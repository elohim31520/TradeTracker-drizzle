import redisClient from '../src/modules/redis';
import cardPackService from '../src/services/cardPackService';
import { AppError, ConflictError } from '../src/modules/errors';
import { CARD_PACK_DAILY_OPENS, CARD_PACK_HISTORY_LIMIT, CARD_PACK_TTL } from '../src/constant/cardPack';
import { cardPackKeys } from '../src/modules/cardPack/keys';
import type { CardPackCard, CardPackPool } from '../src/types/cardPack';
import type { FakeRedis } from './fakeRedis';

jest.mock('../src/modules/redis', () => ({
    __esModule: true,
    default: require('./fakeRedis').createFakeRedis(),
}));

const redis = redisClient as unknown as FakeRedis;

const USER = 'user-1';
const POOL_DATE = '2026-11-19';
/** UTC 2026-11-20 02:00（台北 10:00） */
const NOW = new Date('2026-11-20T02:00:00Z');
const first = () => 0;
const last = () => 0.999999;

function makeCard(i: number, date = POOL_DATE): CardPackCard {
    return {
        id: `${date}:S${String(i).padStart(2, '0')}`,
        date,
        symbol: `S${String(i).padStart(2, '0')}`,
        name: `Company ${i}`,
        rarity: i === 0 ? 'legendary' : 'common',
        sentiment: 'neutral',
        signals: { price: 100 + i, dayChgPct: i - 10, volume: 1000, volumeRatio: 1 + i / 10, moveMultiple: 1, change20dPct: 0, score: i },
        zh: { headline: `標題${i}`, summary: '摘要', points: ['a', 'b', 'c'], watch: '觀察' },
        en: { headline: `Headline ${i}`, summary: 'Summary', points: ['a', 'b', 'c'], watch: 'Watch' },
    };
}

async function seedPool(count = 21, date = POOL_DATE) {
    const pool: CardPackPool = {
        date,
        generated_at: '2026-11-20T00:00:00.000Z',
        cards: Array.from({ length: count }, (_, i) => makeCard(i, date)),
    };
    await redis.set(cardPackKeys.poolLatest, JSON.stringify(pool));
    return pool;
}

const drawId = async (options: { now?: Date; random?: () => number } = {}) =>
    (await cardPackService.draw(USER, { now: NOW, random: first, ...options })).card.id;

beforeEach(() => redis.reset());

describe('getPool / getToday', () => {
    test('還沒有卡池：ready 為 false，沒有 movers', async () => {
        expect(await cardPackService.getToday()).toEqual({
            date: null,
            ready: false,
            dailyOpens: CARD_PACK_DAILY_OPENS,
            movers: [],
        });
    });

    test('卡池內容壞掉也視為準備中，不丟錯', async () => {
        await redis.set(cardPackKeys.poolLatest, '{not json');
        expect((await cardPackService.getToday()).ready).toBe(false);

        await redis.set(cardPackKeys.poolLatest, JSON.stringify({ date: POOL_DATE, cards: [] }));
        expect((await cardPackService.getToday()).ready).toBe(false);
    });

    test('movers 依異動分數由高到低，而且只有數字、沒有稀有度與分析文字', async () => {
        await seedPool(5);
        const today = await cardPackService.getToday();

        expect(today.ready).toBe(true);
        expect(today.date).toBe(POOL_DATE);
        expect(today.movers.map((m) => m.symbol)).toEqual(['S04', 'S03', 'S02', 'S01', 'S00']);
        expect(Object.keys(today.movers[0]!)).toEqual(['symbol', 'name', 'dayChgPct', 'volumeRatio']);
    });
});

describe('draw', () => {
    test('卡池還沒準備好：503，而且完全不動次數與鎖', async () => {
        await expect(cardPackService.draw(USER, { now: NOW })).rejects.toMatchObject({
            statusCode: 503,
            message: '今日卡包準備中',
        });
        expect(redis.strings.size).toBe(0);
        expect(redis.sets.size).toBe(0);
        expect(redis.lists.size).toBe(0);
    });

    test('抽一張：回傳整張卡與剩餘次數，並記下次數、已抽過、紀錄與 TTL', async () => {
        await seedPool();
        const result = await cardPackService.draw(USER, { now: NOW, random: first });

        expect(result.card.id).toBe(`${POOL_DATE}:S00`);
        expect(result.card.zh.headline).toBe('標題0');
        expect(result.date).toBe(POOL_DATE);
        expect(result.remaining).toBe(CARD_PACK_DAILY_OPENS - 1);

        const opensKey = cardPackKeys.opens(USER, '2026-11-20');
        expect(redis.strings.get(opensKey)).toBe('1');
        expect(redis.expiries.get(opensKey)).toBe(CARD_PACK_TTL.opens);
        expect([...redis.sets.get(cardPackKeys.drawn(USER, POOL_DATE))!]).toEqual([`${POOL_DATE}:S00`]);
        expect(redis.expiries.get(cardPackKeys.drawn(USER, POOL_DATE))).toBe(CARD_PACK_TTL.drawn);

        const history = JSON.parse(redis.lists.get(cardPackKeys.history(USER))![0]!);
        expect(history).toMatchObject({
            id: `${POOL_DATE}:S00`,
            symbol: 'S00',
            rarity: 'legendary',
            headline: { zh: '標題0', en: 'Headline 0' },
            drawnAt: NOW.toISOString(),
        });
        expect(redis.expiries.get(cardPackKeys.history(USER))).toBe(CARD_PACK_TTL.history);
    });

    test('每張卡等機率：random 決定落在第幾張，沒有權重', async () => {
        await seedPool(10);
        expect(await drawId({ random: first })).toBe(`${POOL_DATE}:S00`);
        redis.reset();
        await seedPool(10);
        expect(await drawId({ random: last })).toBe(`${POOL_DATE}:S09`);
        redis.reset();
        await seedPool(10);
        expect(await drawId({ random: () => 0.55 })).toBe(`${POOL_DATE}:S05`);
    });

    test('排除已抽過的卡：同一個池子連抽不會重複', async () => {
        await seedPool(21);
        const ids: string[] = [];
        for (let i = 0; i < CARD_PACK_DAILY_OPENS; i++) ids.push(await drawId({ random: first }));

        expect(new Set(ids).size).toBe(CARD_PACK_DAILY_OPENS);
        expect(ids).toEqual(['S00', 'S01', 'S02', 'S03', 'S04'].map((s) => `${POOL_DATE}:${s}`));
    });

    test('次數用完：429，次數不會再增加，鎖也有放掉', async () => {
        await seedPool();
        for (let i = 0; i < CARD_PACK_DAILY_OPENS; i++) await drawId();

        await expect(cardPackService.draw(USER, { now: NOW })).rejects.toMatchObject({
            statusCode: 429,
            message: '今日抽卡次數已用完',
        });
        expect(redis.strings.get(cardPackKeys.opens(USER, '2026-11-20'))).toBe(String(CARD_PACK_DAILY_OPENS));
        expect(await redis.exists(cardPackKeys.lock(USER))).toBe(0);
    });

    test('每天以 UTC 00:00 為界重發次數，已抽過的清單跟著池子走', async () => {
        await seedPool();
        const beforeMidnight = new Date('2026-11-20T23:59:00Z'); // UTC 11/20 23:59
        const afterMidnight = new Date('2026-11-21T00:01:00Z'); // UTC 11/21 00:01

        for (let i = 0; i < CARD_PACK_DAILY_OPENS; i++) await drawId({ now: beforeMidnight });
        await expect(cardPackService.draw(USER, { now: beforeMidnight })).rejects.toBeInstanceOf(AppError);

        const next = await cardPackService.draw(USER, { now: afterMidnight, random: first });
        expect(next.remaining).toBe(CARD_PACK_DAILY_OPENS - 1);
        // 池子沒換（週末），前一天抽過的 S00～S04 還是被排除
        expect(next.card.id).toBe(`${POOL_DATE}:S05`);
    });

    test('台北 00:00（UTC 16:00）不是界線：同一個 UTC 日內次數是共用的', async () => {
        await seedPool();
        const beforeTaipeiMidnight = new Date('2026-11-20T15:59:00Z');
        const afterTaipeiMidnight = new Date('2026-11-20T16:01:00Z');

        for (let i = 0; i < CARD_PACK_DAILY_OPENS - 1; i++) await drawId({ now: beforeTaipeiMidnight });
        const lastOne = await cardPackService.draw(USER, { now: afterTaipeiMidnight, random: first });
        expect(lastOne.remaining).toBe(0);
        await expect(cardPackService.draw(USER, { now: afterTaipeiMidnight })).rejects.toMatchObject({ statusCode: 429 });
    });

    test('新池子的 id 不同，所以換池子後之前抽過的不影響', async () => {
        await seedPool(21, '2026-11-18');
        await drawId();
        await seedPool(21, '2026-11-19');
        expect(await drawId()).toBe('2026-11-19:S00');
    });

    test('整個池子都抽過了（連假撐很多天）：忽略排除、允許重複，不報錯', async () => {
        await seedPool(3);
        const ids = [await drawId(), await drawId(), await drawId(), await drawId()];
        expect(ids).toEqual([`${POOL_DATE}:S00`, `${POOL_DATE}:S01`, `${POOL_DATE}:S02`, `${POOL_DATE}:S00`]);
        expect([...redis.sets.get(cardPackKeys.drawn(USER, POOL_DATE))!]).toEqual([`${POOL_DATE}:S00`]);
    });

    test('已經有一次抽卡在處理中（鎖還在）：409，不動次數', async () => {
        await seedPool();
        await redis.set(cardPackKeys.lock(USER), '1');

        await expect(cardPackService.draw(USER, { now: NOW })).rejects.toBeInstanceOf(ConflictError);
        expect(redis.strings.has(cardPackKeys.opens(USER, '2026-11-20'))).toBe(false);
        // 別人的鎖不能被這次請求放掉
        expect(await redis.exists(cardPackKeys.lock(USER))).toBe(1);
    });

    test('成功後鎖會放掉，下一次可以接著抽', async () => {
        await seedPool();
        await drawId();
        expect(await redis.exists(cardPackKeys.lock(USER))).toBe(0);
        await expect(drawId()).resolves.toBeDefined();
    });

    test('不同使用者的次數、排除與紀錄各自獨立', async () => {
        await seedPool();
        await cardPackService.draw('user-a', { now: NOW, random: first });
        const b = await cardPackService.draw('user-b', { now: NOW, random: first });

        expect(b.card.id).toBe(`${POOL_DATE}:S00`); // user-b 沒抽過，不會被 user-a 排除
        expect(b.remaining).toBe(CARD_PACK_DAILY_OPENS - 1);
    });

    test('紀錄只留最新的 50 筆', async () => {
        await seedPool(21);
        const total = CARD_PACK_HISTORY_LIMIT + 5;
        const days = Math.ceil(total / CARD_PACK_DAILY_OPENS);
        let drawn = 0;
        for (let d = 0; d < days && drawn < total; d++) {
            const now = new Date(Date.UTC(2026, 10, 20 + d, 2, 0, 0));
            for (let i = 0; i < CARD_PACK_DAILY_OPENS && drawn < total; i++, drawn++) {
                await cardPackService.draw(USER, { now, random: first });
            }
        }

        const me = await cardPackService.getMe(USER, new Date(Date.UTC(2026, 10, 20 + days, 2, 0, 0)));
        expect(me.history).toHaveLength(CARD_PACK_HISTORY_LIMIT);
        const times = me.history.map((h) => h.drawnAt);
        expect([...times].sort().reverse()).toEqual(times); // 最新的在前
    });
});

describe('getMe', () => {
    test('沒有卡池也能查：ready false、次數是完整的一天', async () => {
        const me = await cardPackService.getMe(USER, NOW);
        expect(me).toMatchObject({ date: null, ready: false, remaining: CARD_PACK_DAILY_OPENS, history: [] });
    });

    test('抽過之後：剩餘次數減少，紀錄最新的在前，並帶中英標題', async () => {
        await seedPool();
        await drawId();
        await drawId();
        const me = await cardPackService.getMe(USER, NOW);

        expect(me.ready).toBe(true);
        expect(me.remaining).toBe(CARD_PACK_DAILY_OPENS - 2);
        expect(me.history.map((h) => h.symbol)).toEqual(['S01', 'S00']);
        expect(me.history[0]!.headline).toEqual({ zh: '標題1', en: 'Headline 1' });
    });

    test('壞掉的紀錄略過，不讓整個回應失敗', async () => {
        await redis.lPush(cardPackKeys.history(USER), '{bad');
        await redis.lPush(cardPackKeys.history(USER), JSON.stringify({ id: 'ok', symbol: 'AMD' }));
        const me = await cardPackService.getMe(USER, NOW);
        expect(me.history).toHaveLength(1);
    });
});

describe('resetUser', () => {
    test('清掉今天的次數、目前池子的已抽過清單與紀錄', async () => {
        await seedPool();
        await drawId();
        await drawId();
        await cardPackService.resetUser(USER, NOW);

        const me = await cardPackService.getMe(USER, NOW);
        expect(me.remaining).toBe(CARD_PACK_DAILY_OPENS);
        expect(me.history).toEqual([]);
        expect(await drawId()).toBe(`${POOL_DATE}:S00`);
    });
});
