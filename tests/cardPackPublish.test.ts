import redisClient from '../src/modules/redis';
import { collectSnapshots, MarketOpenError } from '../src/modules/cardPack/marketData';
import { publishCardPack } from '../src/modules/cardPack/cardPackPublisher';
import { CARD_PACK_MIN_POOL_SIZE, CARD_PACK_TTL } from '../src/constant/cardPack';
import { HOT_COMPANIES } from '../src/constant/hotCompanies';
import { cardPackKeys } from '../src/modules/cardPack/keys';
import type { CardPackPool } from '../src/types/cardPack';
import type { FakeRedis } from './fakeRedis';

jest.mock('../src/modules/redis', () => ({
    __esModule: true,
    default: require('./fakeRedis').createFakeRedis(),
}));
// 不碰真的 Yahoo 與資料庫：行情換成假的，才能數「有沒有去抓」
jest.mock('../src/modules/cardPack/marketData', () => {
    class MarketOpenError extends Error {}
    return { collectSnapshots: jest.fn(), MarketOpenError };
});

const redis = redisClient as unknown as FakeRedis;
const mockedCollect = collectSnapshots as unknown as jest.Mock;

const DATE = '2026-11-19';
const content = {
    sentiment: 'neutral',
    zh: { headline: '標題', summary: '摘要', points: ['a', 'b', 'c'], watch: '觀察' },
    en: { headline: 'Headline', summary: 'Summary', points: ['a', 'b', 'c'], watch: 'Watch' },
};

/** 前 count 家熱門公司的行情；score 隨順序遞增，所以越後面的越異動 */
function market(date: string, count = HOT_COMPANIES.length) {
    return {
        date,
        snapshots: HOT_COMPANIES.slice(0, count).map((c, i) => ({
            symbol: c.symbol,
            name: c.name,
            date,
            recent: [],
            todaySource: 'db' as const,
            baselineStale: false,
            signals: { price: 100 + i, dayChgPct: i - 5, volume: 1000, volumeRatio: 1, moveMultiple: 1, change20dPct: 0, score: i },
        })),
    };
}

/** 前 count 家熱門公司各一張卡的上傳內容 */
const upload = (count = HOT_COMPANIES.length, date = DATE) => ({
    date,
    cards: HOT_COMPANIES.slice(0, count).map((c) => ({ symbol: c.symbol, ...content })),
});

const readPool = async (key: string) => JSON.parse((await redis.get(key))!) as CardPackPool;

beforeEach(() => {
    redis.reset();
    jest.clearAllMocks();
    mockedCollect.mockResolvedValue(market(DATE));
});

describe('publishCardPack：成功', () => {
    test('寫入當天的池子與 latest：卡片帶上伺服器補的名稱、數字與稀有度，文字是上傳的', async () => {
        const result = await publishCardPack(upload());

        expect(result).toEqual({ date: DATE, count: HOT_COMPANIES.length, skipped: [], isLatest: true });
        const pool = await readPool(cardPackKeys.pool(DATE));
        expect(pool.date).toBe(DATE);
        expect(pool.cards).toHaveLength(HOT_COMPANIES.length);
        expect(await readPool(cardPackKeys.poolLatest)).toEqual(pool);

        const first = pool.cards[0]!;
        expect(first).toMatchObject({
            id: `${DATE}:${HOT_COMPANIES[0]!.symbol}`,
            date: DATE,
            symbol: HOT_COMPANIES[0]!.symbol,
            name: HOT_COMPANIES[0]!.name,
            sentiment: 'neutral',
            zh: content.zh,
            en: content.en,
        });
        expect(first.signals.price).toBe(100);
        expect(new Date(pool.generated_at).toString()).not.toBe('Invalid Date');
    });

    test('兩個 key 都帶 5 天的過期時間', async () => {
        await publishCardPack(upload());
        expect(redis.expiries.get(cardPackKeys.pool(DATE))).toBe(CARD_PACK_TTL.pool);
        expect(redis.expiries.get(cardPackKeys.poolLatest)).toBe(CARD_PACK_TTL.pool);
    });

    test('稀有度依異動分數排名：分數最高的是 legendary，最低的是 common', async () => {
        await publishCardPack(upload());
        const pool = await readPool(cardPackKeys.pool(DATE));
        const bySymbol = new Map(pool.cards.map((c) => [c.symbol, c.rarity]));

        expect(bySymbol.get(HOT_COMPANIES[HOT_COMPANIES.length - 1]!.symbol)).toBe('legendary');
        expect(bySymbol.get(HOT_COMPANIES[0]!.symbol)).toBe('common');
    });

    test('只傳一部分公司（例如 8 家）也可以，池子就只有那 8 張', async () => {
        const result = await publishCardPack(upload(8));
        expect(result.count).toBe(8);
        expect((await readPool(cardPackKeys.poolLatest)).cards).toHaveLength(8);
    });

    test('代號大小寫不拘', async () => {
        const input = upload(CARD_PACK_MIN_POOL_SIZE);
        input.cards[0]!.symbol = input.cards[0]!.symbol.toLowerCase();
        const result = await publishCardPack(input);
        expect(result.count).toBe(CARD_PACK_MIN_POOL_SIZE);
        expect((await readPool(cardPackKeys.pool(DATE))).cards[0]!.symbol).toBe(HOT_COMPANIES[0]!.symbol);
    });

    test('同一天重傳：整包覆蓋舊的', async () => {
        await publishCardPack(upload(10));
        const rewritten = upload(6);
        rewritten.cards.forEach((c) => (c.zh = { ...content.zh, headline: '改過的標題' }));
        const result = await publishCardPack(rewritten);

        expect(result.count).toBe(6);
        const pool = await readPool(cardPackKeys.poolLatest);
        expect(pool.cards).toHaveLength(6);
        expect(pool.cards.every((c) => c.zh.headline === '改過的標題')).toBe(true);
    });

    test('補傳比較舊的日期：寫入那天的池子，但不蓋掉比較新的 latest', async () => {
        await publishCardPack(upload(10, DATE));

        mockedCollect.mockResolvedValue(market('2026-11-18'));
        const result = await publishCardPack(upload(7, '2026-11-18'));

        expect(result.isLatest).toBe(false);
        expect((await readPool(cardPackKeys.pool('2026-11-18'))).cards).toHaveLength(7);
        expect((await readPool(cardPackKeys.poolLatest)).date).toBe(DATE);
    });

    test('latest 的內容壞掉：當作沒有，直接覆蓋', async () => {
        await redis.set(cardPackKeys.poolLatest, '不是 JSON');
        const result = await publishCardPack(upload());
        expect(result.isLatest).toBe(true);
        expect((await readPool(cardPackKeys.poolLatest)).date).toBe(DATE);
    });
});

describe('publishCardPack：行情的限制', () => {
    test('上傳的日期和行情的日期對不上：409，什麼都不寫', async () => {
        mockedCollect.mockResolvedValue(market('2026-11-20'));

        await expect(publishCardPack(upload())).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('2026-11-20') });
        expect(redis.strings.size).toBe(0);
    });

    test('美股盤中：409，什麼都不寫', async () => {
        mockedCollect.mockRejectedValue(new MarketOpenError());

        await expect(publishCardPack(upload())).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('盤中') });
        expect(redis.strings.size).toBe(0);
    });

    test('Yahoo 抓不到：原本的錯誤照樣丟出，不會被誤當成盤中', async () => {
        mockedCollect.mockRejectedValue(new Error('network down'));
        await expect(publishCardPack(upload())).rejects.toThrow('network down');
        expect(redis.strings.size).toBe(0);
    });

    test('有幾家沒有可用的行情：略過並回報在 skipped，其餘照常寫入，稀有度只在寫入的卡之間排名', async () => {
        // 行情只剩前 10 家，上傳 12 家
        mockedCollect.mockResolvedValue(market(DATE, 10));
        const result = await publishCardPack(upload(12));

        expect(result).toMatchObject({ count: 10, skipped: [HOT_COMPANIES[10]!.symbol, HOT_COMPANIES[11]!.symbol] });
        const pool = await readPool(cardPackKeys.pool(DATE));
        expect(pool.cards.map((c) => c.symbol)).not.toContain(HOT_COMPANIES[10]!.symbol);
        expect(pool.cards.some((c) => c.rarity === 'legendary')).toBe(true);
    });

    test('有行情的卡不足最小數量：400，整批不寫入，訊息列出被略過的代號', async () => {
        mockedCollect.mockResolvedValue(market(DATE, CARD_PACK_MIN_POOL_SIZE - 1));

        await expect(publishCardPack(upload(CARD_PACK_MIN_POOL_SIZE + 2))).rejects.toMatchObject({
            statusCode: 400,
            message: expect.stringContaining(HOT_COMPANIES[CARD_PACK_MIN_POOL_SIZE - 1]!.symbol),
        });
        expect(redis.strings.size).toBe(0);
    });
});

describe('publishCardPack：內容有問題的請求', () => {
    test('格式不符：400，而且連行情都不抓', async () => {
        const input = upload();
        input.cards[0]!.sentiment = 'moon';

        await expect(publishCardPack(input)).rejects.toMatchObject({ statusCode: 400 });
        expect(mockedCollect).not.toHaveBeenCalled();
        expect(redis.strings.size).toBe(0);
    });

    test('含投資建議用語：400，不抓行情、不寫入', async () => {
        const input = upload();
        input.cards[3]!.zh = { ...content.zh, watch: '建議逢低買進' };

        await expect(publishCardPack(input)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('買進') });
        expect(mockedCollect).not.toHaveBeenCalled();
        expect(redis.strings.size).toBe(0);
    });

    test('卡片數量不足：400', async () => {
        await expect(publishCardPack(upload(CARD_PACK_MIN_POOL_SIZE - 1))).rejects.toMatchObject({ statusCode: 400 });
        expect(mockedCollect).not.toHaveBeenCalled();
    });
});
