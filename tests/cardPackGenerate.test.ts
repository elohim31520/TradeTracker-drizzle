import redisClient from '../src/modules/redis';
import { ai } from '../src/modules/vertexAi';
import { collectSnapshots } from '../src/modules/cardPack/marketData';
import { generateCardPack } from '../src/modules/cardPack/cardPackGenerator';
import { cardPackKeys } from '../src/modules/cardPack/keys';
import type { FakeRedis } from './fakeRedis';

jest.mock('../src/modules/redis', () => ({
    __esModule: true,
    default: require('./fakeRedis').createFakeRedis(),
}));
// 不碰真的 Vertex AI 與 Yahoo：行情與 Gemini 都換成假的，才能數「有沒有去抓」
jest.mock('../src/modules/vertexAi', () => ({
    ai: { models: { generateContent: jest.fn() } },
    geminiConfig: {},
}));
jest.mock('../src/modules/cardPack/marketData', () => {
    class MarketOpenError extends Error {}
    return { collectSnapshots: jest.fn(), MarketOpenError };
});

const redis = redisClient as unknown as FakeRedis;
const generateContent = ai.models.generateContent as unknown as jest.Mock;
const mockedCollect = collectSnapshots as unknown as jest.Mock;

function snapshots(date: string, count = 12) {
    return {
        date,
        snapshots: Array.from({ length: count }, (_, i) => ({
            symbol: `S${String(i).padStart(2, '0')}`,
            name: `Company ${i}`,
            date,
            recent: [],
            todaySource: 'db' as const,
            baselineStale: false,
            signals: { price: 100, dayChgPct: i - 5, volume: 1000, volumeRatio: 1, moveMultiple: 1, change20dPct: 0, score: i },
        })),
    };
}

const modelOutput = JSON.stringify({
    sentiment: 'neutral',
    zh: { headline: '標題', summary: '摘要', points: ['a', 'b', 'c'], watch: '觀察' },
    en: { headline: 'Headline', summary: 'Summary', points: ['a', 'b', 'c'], watch: 'Watch' },
});

const seedPool = (date: string) => redis.set(cardPackKeys.pool(date), JSON.stringify({ date, generated_at: 'x', cards: [] }));

// 台北週五 18:00 = 美東週五 05:00（還沒收盤）→ 最近一個收盤日是週四 2026-11-19
const FRI_BEFORE_CLOSE = new Date('2026-11-20T10:00:00Z');

beforeEach(() => {
    redis.reset();
    jest.clearAllMocks();
    mockedCollect.mockResolvedValue(snapshots('2026-11-19'));
    generateContent.mockResolvedValue({ text: modelOutput });
});

describe('generateCardPack 的預檢（用本地算的最近一個收盤日查 Redis）', () => {
    test('最近一個收盤日的池子已經在 Redis：直接略過，不抓行情、不查資料庫、不呼叫 Gemini', async () => {
        await seedPool('2026-11-19');

        const result = await generateCardPack({ now: FRI_BEFORE_CLOSE });

        expect(result).toBeNull();
        expect(mockedCollect).not.toHaveBeenCalled();
        expect(generateContent).not.toHaveBeenCalled();
    });

    test('預檢沒命中（還沒有這天的池子）：照常抓行情、生成並寫入', async () => {
        const result = await generateCardPack({ now: FRI_BEFORE_CLOSE });

        expect(mockedCollect).toHaveBeenCalledTimes(1);
        expect(generateContent).toHaveBeenCalledTimes(12);
        expect(result?.cards).toHaveLength(12);
        expect(await redis.exists(cardPackKeys.pool('2026-11-19'))).toBe(1);
        expect(await redis.exists(cardPackKeys.poolLatest)).toBe(1);
    });

    test('force：就算池子已存在也不預檢，強制重生', async () => {
        await seedPool('2026-11-19');

        const result = await generateCardPack({ now: FRI_BEFORE_CLOSE, force: true });

        expect(mockedCollect).toHaveBeenCalledTimes(1);
        expect(result?.cards).toHaveLength(12);
    });

    test('write: false（只算不寫，例如手動試跑）：完全不碰 Redis，所以也沒有預檢', async () => {
        await seedPool('2026-11-19');

        const result = await generateCardPack({ now: FRI_BEFORE_CLOSE, write: false });

        expect(mockedCollect).toHaveBeenCalledTimes(1);
        expect(result?.cards).toHaveLength(12);
        expect(await redis.exists(cardPackKeys.poolLatest)).toBe(0);
    });

    test('週末與週一早上：最近一個收盤日是週五，週五的池子在就略過', async () => {
        await seedPool('2026-11-20');

        for (const now of [new Date('2026-11-21T10:00:00Z'), new Date('2026-11-22T10:00:00Z'), new Date('2026-11-23T10:00:00Z')]) {
            expect(await generateCardPack({ now })).toBeNull();
        }
        expect(mockedCollect).not.toHaveBeenCalled();
    });

    test('美東 16:00 收盤為界：收盤前算前一天，收盤後算當天', async () => {
        await seedPool('2026-11-20'); // 只有週五的池子

        // 週五美東 15:30（還沒收盤）→ 最近一個收盤日是週四，週四沒有池子 → 預檢沒命中，去抓行情
        mockedCollect.mockResolvedValue(snapshots('2026-11-19'));
        await generateCardPack({ now: new Date('2026-11-20T20:30:00Z') });
        expect(mockedCollect).toHaveBeenCalledTimes(1);

        // 週五美東 16:30（已收盤）→ 週五，週五的池子在 → 預檢命中
        mockedCollect.mockClear();
        expect(await generateCardPack({ now: new Date('2026-11-20T21:30:00Z') })).toBeNull();
        expect(mockedCollect).not.toHaveBeenCalled();
    });

    test('國定假日（預檢認不得）：預檢落空，抓到行情發現實際交易日的池子已在，仍然略過、不呼叫 Gemini', async () => {
        // 2026-09-07 是美國勞動節（週一休市）。台北週二早上，本地算出來的收盤日是週一，但實際最近的交易日是上週五
        await seedPool('2026-09-04');
        mockedCollect.mockResolvedValue(snapshots('2026-09-04'));

        const result = await generateCardPack({ now: new Date('2026-09-08T10:00:00Z') });

        expect(result).toBeNull();
        expect(mockedCollect).toHaveBeenCalledTimes(1); // 假日會多這 1 次，之後才用實際日期擋掉
        expect(generateContent).not.toHaveBeenCalled();
    });
});
