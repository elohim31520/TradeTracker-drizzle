import express from 'express';
import request from 'supertest';
import redisClient from '../src/modules/redis';
import errorHandler from '../src/middleware/errorHandler';
import cardPackRoutes from '../src/routes/cardPack';
import { CARD_PACK_DAILY_OPENS } from '../src/constant/cardPack';
import { cardPackKeys } from '../src/modules/cardPack/keys';
import { collectSnapshots } from '../src/modules/cardPack/marketData';
import { HOT_COMPANIES } from '../src/constant/hotCompanies';
import type { CardPackPool } from '../src/types/cardPack';
import type { FakeRedis } from './fakeRedis';

jest.mock('../src/modules/redis', () => ({
    __esModule: true,
    default: require('./fakeRedis').createFakeRedis(),
}));

// 真的 authMiddleware 會讀 secrets/ 底下的金鑰；這裡只驗證「有沒有登入」的串接，換成用 header 帶使用者
jest.mock('../src/middleware/auth', () => ({
    authMiddleware: (req: any, _res: any, next: any) => {
        const { AuthError } = require('../src/modules/errors');
        const id = req.headers['x-test-user'];
        if (!id) return next(new AuthError('未提供有效的授權標頭'));
        req.user = { id, email: 'test@example.com', name: 'Test' };
        next();
    },
}));

// 真的 verifyAdmin 會查資料庫；這裡只驗證「有沒有擋非管理員」的串接，換成用 header 標記管理員
jest.mock('../src/middleware/adminAuth', () => ({
    verifyAdmin: (req: any, _res: any, next: any) => {
        const { AuthError } = require('../src/modules/errors');
        if (req.headers['x-test-admin'] !== '1') return next(new AuthError('需要管理員權限'));
        next();
    },
}));

// 不碰真的 Yahoo 與資料庫
jest.mock('../src/modules/cardPack/marketData', () => {
    class MarketOpenError extends Error {}
    return { collectSnapshots: jest.fn(), MarketOpenError };
});

const redis = redisClient as unknown as FakeRedis;
const mockedCollect = collectSnapshots as unknown as jest.Mock;

const app = express();
app.use(express.json());
app.use('/card-pack', cardPackRoutes);
app.use(errorHandler);

const asUser = (id = 'user-1') => ({ 'x-test-user': id });
const asAdmin = () => ({ ...asUser('admin-1'), 'x-test-admin': '1' });

const POOL_DATE = '2026-11-19';
const content = {
    sentiment: 'bullish',
    zh: { headline: '上傳的標題', summary: '摘要', points: ['a', 'b', 'c'], watch: '觀察' },
    en: { headline: 'Uploaded headline', summary: 'Summary', points: ['a', 'b', 'c'], watch: 'Watch' },
};
const uploadBody = (count = 8) => ({
    date: POOL_DATE,
    cards: HOT_COMPANIES.slice(0, count).map((c) => ({ symbol: c.symbol, ...content })),
});

async function seedPool() {
    const pool: CardPackPool = {
        date: '2026-11-19',
        generated_at: '2026-11-20T00:00:00.000Z',
        cards: Array.from({ length: 21 }, (_, i) => ({
            id: `2026-11-19:S${i}`,
            date: '2026-11-19',
            symbol: `S${i}`,
            name: `Company ${i}`,
            rarity: 'common' as const,
            sentiment: 'neutral' as const,
            signals: { price: 100, dayChgPct: i, volume: 1000, volumeRatio: 1, moveMultiple: 1, change20dPct: 0, score: i },
            zh: { headline: `標題${i}`, summary: '摘要', points: ['a', 'b', 'c'], watch: '觀察' },
            en: { headline: `Headline ${i}`, summary: 'Summary', points: ['a', 'b', 'c'], watch: 'Watch' },
        })),
    };
    await redis.set(cardPackKeys.poolLatest, JSON.stringify(pool));
}

beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => {})); // errorHandler 會把每個錯誤印出來
afterAll(() => jest.restoreAllMocks());
beforeEach(() => {
    redis.reset();
    mockedCollect.mockReset();
    mockedCollect.mockResolvedValue({
        date: POOL_DATE,
        snapshots: HOT_COMPANIES.map((c, i) => ({
            symbol: c.symbol,
            name: c.name,
            date: POOL_DATE,
            recent: [],
            todaySource: 'db',
            baselineStale: false,
            signals: { price: 100, dayChgPct: i - 5, volume: 1000, volumeRatio: 1, moveMultiple: 1, change20dPct: 0, score: i },
        })),
    });
});

describe('GET /card-pack/today（公開）', () => {
    test('不用登入；卡池還沒好時 ready 為 false', async () => {
        const res = await request(app).get('/card-pack/today');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toMatchObject({ ready: false, date: null, movers: [] });
    });

    test('卡池好了之後回傳今日異動，沒有任何卡片內容', async () => {
        await seedPool();
        const res = await request(app).get('/card-pack/today');
        expect(res.body.data.ready).toBe(true);
        expect(res.body.data.movers[0]).toEqual({ symbol: 'S20', name: 'Company 20', dayChgPct: 20, volumeRatio: 1 });
        expect(JSON.stringify(res.body)).not.toMatch(/標題|Headline|rarity/);
    });
});

describe('需要登入的路由', () => {
    test('沒有登入：GET /me 與 POST /draw 都是 401', async () => {
        await seedPool();
        expect((await request(app).get('/card-pack/me')).status).toBe(401);
        const draw = await request(app).post('/card-pack/draw');
        expect(draw.status).toBe(401);
        expect(redis.strings.size).toBe(1); // 只有 seed 的卡池，沒有人被扣次數
    });

    test('卡池還沒準備好：503「今日卡包準備中」，不扣次數', async () => {
        const res = await request(app).post('/card-pack/draw').set(asUser());
        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({ success: false, code: 503, message: '今日卡包準備中' });

        const me = await request(app).get('/card-pack/me').set(asUser());
        expect(me.body.data.remaining).toBe(CARD_PACK_DAILY_OPENS);
    });

    test('抽卡成功：回整張卡與剩餘次數，且不允許被快取', async () => {
        await seedPool();
        const res = await request(app).post('/card-pack/draw').set(asUser());

        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.body.data.card.id).toMatch(/^2026-11-19:S\d+$/);
        expect(res.body.data.card.zh.headline).toMatch(/^標題/);
        expect(res.body.data.remaining).toBe(CARD_PACK_DAILY_OPENS - 1);

        const me = await request(app).get('/card-pack/me').set(asUser());
        expect(me.headers['cache-control']).toBe('no-store');
        expect(me.body.data.remaining).toBe(CARD_PACK_DAILY_OPENS - 1);
        expect(me.body.data.history).toHaveLength(1);
        expect(me.body.data.history[0].id).toBe(res.body.data.card.id);
    });

    test('連抽到次數用完後 429', async () => {
        await seedPool();
        for (let i = 0; i < CARD_PACK_DAILY_OPENS; i++) {
            expect((await request(app).post('/card-pack/draw').set(asUser())).status).toBe(200);
        }
        const res = await request(app).post('/card-pack/draw').set(asUser());
        expect(res.status).toBe(429);
        expect(res.body.message).toBe('今日抽卡次數已用完');
    });

    test('另一個使用者不受影響', async () => {
        await seedPool();
        for (let i = 0; i < CARD_PACK_DAILY_OPENS; i++) await request(app).post('/card-pack/draw').set(asUser('user-a'));
        const res = await request(app).post('/card-pack/draw').set(asUser('user-b'));
        expect(res.status).toBe(200);
    });
});

describe('POST /card-pack/pool（管理員上傳卡池）', () => {
    test('沒有登入：401；已登入但不是管理員：401，都不會去抓行情或寫入', async () => {
        expect((await request(app).post('/card-pack/pool').send(uploadBody())).status).toBe(401);
        const notAdmin = await request(app).post('/card-pack/pool').set(asUser()).send(uploadBody());
        expect(notAdmin.status).toBe(401);
        expect(notAdmin.body.message).toBe('需要管理員權限');
        expect(mockedCollect).not.toHaveBeenCalled();
        expect(redis.strings.size).toBe(0);
    });

    test('管理員上傳成功：回寫入的張數，之後一般使用者馬上看得到卡池、抽得到上傳的內容', async () => {
        const res = await request(app).post('/card-pack/pool').set(asAdmin()).send(uploadBody(8));

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, data: { date: POOL_DATE, count: 8, skipped: [], isLatest: true } });

        const today = await request(app).get('/card-pack/today');
        expect(today.body.data).toMatchObject({ ready: true, date: POOL_DATE });
        expect(today.body.data.movers).toHaveLength(8);

        const draw = await request(app).post('/card-pack/draw').set(asUser('player-1'));
        expect(draw.status).toBe(200);
        expect(draw.body.data.card.zh.headline).toBe('上傳的標題');
    });

    test('內容有問題：400 帶出原因，不寫入', async () => {
        const body = uploadBody();
        body.cards[0]!.zh = { ...content.zh, watch: '建議買進' };

        const res = await request(app).post('/card-pack/pool').set(asAdmin()).send(body);
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/買進/);
        expect(redis.strings.size).toBe(0);
    });

    test('日期和行情對不上：409', async () => {
        const res = await request(app).post('/card-pack/pool').set(asAdmin()).send({ ...uploadBody(), date: '2026-11-18' });
        expect(res.status).toBe(409);
        expect(redis.strings.size).toBe(0);
    });
});

describe('POST /card-pack/dev/reset（非 production 才有）', () => {
    test('重設自己的次數與紀錄', async () => {
        await seedPool();
        await request(app).post('/card-pack/draw').set(asUser());
        expect((await request(app).post('/card-pack/dev/reset').set(asUser())).status).toBe(200);

        const me = await request(app).get('/card-pack/me').set(asUser());
        expect(me.body.data).toMatchObject({ remaining: CARD_PACK_DAILY_OPENS, history: [] });
    });

    test('一樣要登入', async () => {
        expect((await request(app).post('/card-pack/dev/reset')).status).toBe(401);
    });
});
