import redisClient from '../src/modules/redis';
import { ai } from '../src/modules/vertexAi';
import { collectSnapshots, MarketOpenError } from '../src/modules/cardPack/marketData';
import { ensureCardPackPool, MIN_POOL_SIZE } from '../src/modules/cardPack/cardPackGenerator';
import { CARD_PACK_TTL } from '../src/constant/cardPack';
import { cardPackKeys } from '../src/modules/cardPack/keys';
import type { CardPackPool } from '../src/types/cardPack';
import type { FakeRedis } from './fakeRedis';

jest.mock('../src/modules/redis', () => ({
    __esModule: true,
    default: require('./fakeRedis').createFakeRedis(),
}));
// 不碰真的 Vertex AI 與 Yahoo：生成器的行情與 Gemini 都換成假的
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

const DATE = '2026-11-19';

function snapshots(count: number) {
    return {
        date: DATE,
        snapshots: Array.from({ length: count }, (_, i) => ({
            symbol: `S${String(i).padStart(2, '0')}`,
            name: `Company ${i}`,
            date: DATE,
            recent: [],
            signals: { price: 100, dayChgPct: i - 5, volume: 1000, volumeRatio: 1, moveMultiple: 1, change20dPct: 0, score: i },
        })),
    };
}

const modelOutput = JSON.stringify({
    sentiment: 'neutral',
    zh: { headline: '標題', summary: '摘要', points: ['a', 'b', 'c'], watch: '觀察' },
    en: { headline: 'Headline', summary: 'Summary', points: ['a', 'b', 'c'], watch: 'Watch' },
});

const latestPool = async () => {
    const raw = await redis.get(cardPackKeys.poolLatest);
    return raw ? (JSON.parse(raw) as CardPackPool) : null;
};

beforeEach(() => {
    redis.reset();
    jest.clearAllMocks();
    mockedCollect.mockResolvedValue(snapshots(12));
    generateContent.mockResolvedValue({ text: modelOutput });
});

describe('ensureCardPackPool（cron 容器啟動時補卡池）', () => {
    test('已經有卡池：什麼都不做，不抓行情、不呼叫 Gemini、不上鎖', async () => {
        await redis.set(cardPackKeys.poolLatest, JSON.stringify({ date: DATE, generated_at: 'x', cards: [] }));

        await ensureCardPackPool();

        expect(mockedCollect).not.toHaveBeenCalled();
        expect(generateContent).not.toHaveBeenCalled();
        expect(await redis.exists(cardPackKeys.bootstrapLock)).toBe(0);
    });

    test('沒有卡池：補生成一次，寫入 latest 與當天的池子，並上 30 分鐘的鎖', async () => {
        await ensureCardPackPool();

        expect(mockedCollect).toHaveBeenCalledTimes(1);
        expect(generateContent).toHaveBeenCalledTimes(12);
        const pool = await latestPool();
        expect(pool?.date).toBe(DATE);
        expect(pool?.cards).toHaveLength(12);
        expect(await redis.exists(cardPackKeys.pool(DATE))).toBe(1);
        expect(await redis.exists(cardPackKeys.bootstrapLock)).toBe(1);
        expect(redis.expiries.get(cardPackKeys.bootstrapLock)).toBe(CARD_PACK_TTL.bootstrapLockSeconds);
        expect(redis.expiries.get(cardPackKeys.poolLatest)).toBe(CARD_PACK_TTL.pool);
    });

    test('latest 不見了、但同一天的池子 key 還在：照樣重新生成並把 latest 寫回來（force）', async () => {
        await redis.set(cardPackKeys.pool(DATE), JSON.stringify({ date: DATE, generated_at: 'old', cards: [] }));

        await ensureCardPackPool();

        expect(mockedCollect).toHaveBeenCalledTimes(1);
        expect((await latestPool())?.cards).toHaveLength(12);
    });

    test('補生成成功後再啟動一次：已有卡池，不會再生成', async () => {
        await ensureCardPackPool();
        await ensureCardPackPool();

        expect(mockedCollect).toHaveBeenCalledTimes(1);
        expect(generateContent).toHaveBeenCalledTimes(12);
    });

    test('鎖已經被占用（另一個實例正在補，或剛失敗過）：略過，不重複打 Gemini', async () => {
        await redis.set(cardPackKeys.bootstrapLock, '1');

        await ensureCardPackPool();

        expect(mockedCollect).not.toHaveBeenCalled();
        expect(generateContent).not.toHaveBeenCalled();
        expect(await latestPool()).toBeNull();
    });

    test('生成失敗（Gemini 全部出錯）：丟出錯誤、不寫入 latest；鎖還在，反覆重啟不會一直重試', async () => {
        generateContent.mockRejectedValue(new Error('quota exceeded'));

        await expect(ensureCardPackPool()).rejects.toThrow(/不寫入 Redis/);
        expect(await latestPool()).toBeNull();
        expect(await redis.exists(cardPackKeys.bootstrapLock)).toBe(1);

        mockedCollect.mockClear();
        generateContent.mockClear();
        await ensureCardPackPool(); // 容器重啟
        expect(mockedCollect).not.toHaveBeenCalled();
        expect(generateContent).not.toHaveBeenCalled();
    });

    test(`成功的卡剛好 ${MIN_POOL_SIZE} 張（門檻等於每天可拆的包數）：照常寫入`, async () => {
        mockedCollect.mockResolvedValue(snapshots(MIN_POOL_SIZE));

        await ensureCardPackPool();

        expect((await latestPool())?.cards).toHaveLength(MIN_POOL_SIZE);
    });

    test(`成功的卡少於 ${MIN_POOL_SIZE} 張：不寫入，避免用殘缺的池子上線`, async () => {
        mockedCollect.mockResolvedValue(snapshots(MIN_POOL_SIZE - 1));

        await expect(ensureCardPackPool()).rejects.toThrow(/不寫入 Redis/);
        expect(await latestPool()).toBeNull();
    });

    test('啟動時美股還在盤中：不丟錯、不寫入，等下一個排程', async () => {
        mockedCollect.mockRejectedValue(new MarketOpenError());

        await expect(ensureCardPackPool()).resolves.toBeUndefined();
        expect(generateContent).not.toHaveBeenCalled();
        expect(await latestPool()).toBeNull();
    });
});
