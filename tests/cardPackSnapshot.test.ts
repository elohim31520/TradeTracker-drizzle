import {
    buildCompanySnapshot,
    MAX_HISTORY_GAP_DAYS,
    toDailyPoints,
    toTradingDate,
    type DailyPoint,
} from '../src/modules/cardPack/snapshotBuilder';

const company = { symbol: 'AMD', name: 'AMD' };
const TRADING_DATE = '2026-11-19';
const isoDay = (offset: number, from = Date.UTC(2026, 9, 25)) => new Date(from + offset * 86_400_000).toISOString().slice(0, 10);

/** 到 2026-11-18（池子日期的前一天）為止的 25 天，每天 ±1%，價格每天 +1 */
function makePoints(count = 25, lastDate = '2026-11-18'): DailyPoint[] {
    const start = Date.parse(lastDate) - (count - 1) * 86_400_000;
    return Array.from({ length: count }, (_, i) => ({
        date: isoDay(i, start),
        close: 100 + i,
        dayChgPct: i % 2 === 0 ? 1 : -1,
    }));
}
const quote = { price: 489.5, dayChgPct: -7.7, volume: 70_000_000, avgVolume: 35_000_000 };

describe('toTradingDate / toDailyPoints', () => {
    test('資料庫的時間（UTC）換成美東交易日：台北週六 06:00 寫入的列屬於週五', () => {
        // 台北 2026-11-21（週六）06:00 = UTC 11-20 22:00 = 美東 11-20 17:00
        expect(toTradingDate(new Date('2026-11-20T22:00:00Z'))).toBe('2026-11-20');
        // 夏令時間：台北 07-18 06:00 = UTC 07-17 22:00 = 美東 07-17 18:00
        expect(toTradingDate(new Date('2026-07-17T22:00:00Z'))).toBe('2026-07-17');
    });

    test('同一個交易日有多筆（重跑、開發環境每小時爬）只留最後一筆', () => {
        const points = toDailyPoints([
            { price: '100.00', dayChg: '1.00', createdAt: new Date('2026-11-19T20:00:00Z') },
            { price: '101.50', dayChg: '1.50', createdAt: new Date('2026-11-19T22:00:00Z') },
            { price: '99.00', dayChg: '-1.00', createdAt: new Date('2026-11-18T22:00:00Z') },
        ]);
        expect(points).toEqual([
            { date: '2026-11-18', close: 99, dayChgPct: -1 },
            { date: '2026-11-19', close: 101.5, dayChgPct: 1.5 },
        ]);
    });

    test('價格或漲跌幅缺值（null、不是數字）的列略過；結果依日期由舊到新', () => {
        const points = toDailyPoints([
            { price: '10.00', dayChg: '0.50', createdAt: new Date('2026-11-19T22:00:00Z') },
            { price: null, dayChg: '1.00', createdAt: new Date('2026-11-18T22:00:00Z') },
            { price: '10.00', dayChg: null, createdAt: new Date('2026-11-17T22:00:00Z') },
            { price: 'abc', dayChg: '1.00', createdAt: new Date('2026-11-16T22:00:00Z') },
            { price: '9.00', dayChg: '-2.00', createdAt: new Date('2026-11-13T22:00:00Z') },
        ]);
        expect(points.map((p) => p.date)).toEqual(['2026-11-13', '2026-11-19']);
    });
});

describe('buildCompanySnapshot', () => {
    test('當天的紀錄已經在資料庫：收盤價與漲跌幅用資料庫的（和網站其他頁同一份）', () => {
        const points = [...makePoints(), { date: TRADING_DATE, close: 489.19, dayChgPct: -7.72 }];
        const s = buildCompanySnapshot({ company, quote, tradingDate: TRADING_DATE, points });

        expect(s.todaySource).toBe('db');
        expect(s.signals.price).toBe(489.19);
        expect(s.signals.dayChgPct).toBe(-7.72);
    });

    test('當天的紀錄還沒進資料庫（爬蟲還沒跑完或失敗）：用報價頂替，照樣出卡', () => {
        const s = buildCompanySnapshot({ company, quote, tradingDate: TRADING_DATE, points: makePoints() });

        expect(s.todaySource).toBe('quote');
        expect(s.signals.price).toBe(489.5);
        expect(s.signals.dayChgPct).toBe(-7.7);
        expect(s.baselineStale).toBe(false);
        expect(s.signals.moveMultiple).toBeCloseTo(7.7, 1); // 平均波動 1%
    });

    test('基準只看池子日期「之前」的紀錄：當天與之後的紀錄不會被算進自己的基準', () => {
        const s = buildCompanySnapshot({
            company,
            quote,
            tradingDate: TRADING_DATE,
            points: [...makePoints(), { date: TRADING_DATE, close: 1, dayChgPct: 50 }, { date: '2026-11-20', close: 1, dayChgPct: 40 }],
        });
        // 當日是 50%，基準是之前每天 ±1% 的平均 1%：剛好 50 倍。
        // 若把 50% 與之後的 40% 算進基準，平均會被拉高，倍數會小很多
        expect(s.signals.moveMultiple).toBe(50);
    });

    test('成交量倍數 = 報價的當日成交量 ÷ 報價的 10 日均量（資料庫沒有當天的成交量）', () => {
        const s = buildCompanySnapshot({ company, quote, tradingDate: TRADING_DATE, points: makePoints() });
        expect(s.signals.volumeRatio).toBe(2);
        expect(s.signals.volume).toBe(70_000_000);

        const noAvg = buildCompanySnapshot({ company, quote: { ...quote, avgVolume: null }, tradingDate: TRADING_DATE, points: makePoints() });
        expect(noAvg.signals.volumeRatio).toBeNull();
    });

    test('資料庫的歷史過期（最後一筆離池子日期超過上限）：基準訊號留空，近期只剩當日', () => {
        const stale = makePoints(25, '2026-10-01');
        const s = buildCompanySnapshot({ company, quote, tradingDate: TRADING_DATE, points: stale });

        expect(s.baselineStale).toBe(true);
        expect(s.signals.moveMultiple).toBeNull();
        expect(s.signals.change20dPct).toBeNull();
        expect(s.recent).toHaveLength(1);
        // 量能與絕對幅度不依賴資料庫，照樣給
        expect(s.signals.volumeRatio).toBe(2);
        expect(s.signals.score).toBe(3.85); // 絕對 7.7 ÷ 2
    });

    test(`剛好差 ${MAX_HISTORY_GAP_DAYS} 天還算新鮮、多一天就過期；上限可以調`, () => {
        const lastDate = isoDay(-MAX_HISTORY_GAP_DAYS, Date.parse(TRADING_DATE));
        expect(buildCompanySnapshot({ company, quote, tradingDate: TRADING_DATE, points: makePoints(25, lastDate) }).baselineStale).toBe(false);

        const older = isoDay(-(MAX_HISTORY_GAP_DAYS + 1), Date.parse(TRADING_DATE));
        expect(buildCompanySnapshot({ company, quote, tradingDate: TRADING_DATE, points: makePoints(25, older) }).baselineStale).toBe(true);
        expect(
            buildCompanySnapshot({ company, quote, tradingDate: TRADING_DATE, points: makePoints(25, older), maxGapDays: 30 }).baselineStale
        ).toBe(false);
    });

    test('完全沒有歷史（新上市、資料庫讀不到）：視為沒有基準，用報價出卡', () => {
        const s = buildCompanySnapshot({ company, quote, tradingDate: TRADING_DATE, points: [] });
        expect(s.baselineStale).toBe(true);
        expect(s.todaySource).toBe('quote');
        expect(s.signals.moveMultiple).toBeNull();
        expect(s.signals.score).toBeGreaterThan(0);
    });

    test('新上市只有 12 天：波動倍數算得出來，近 20 日累計還不給', () => {
        const s = buildCompanySnapshot({ company, quote, tradingDate: TRADING_DATE, points: makePoints(12) });
        expect(s.signals.moveMultiple).not.toBeNull();
        expect(s.signals.change20dPct).toBeNull();
    });

    test('近期各交易日：最近 5 天加上當日，由舊到新，最後一筆是當日', () => {
        const s = buildCompanySnapshot({ company, quote, tradingDate: TRADING_DATE, points: makePoints() });

        expect(s.recent).toHaveLength(6);
        expect(s.recent.map((r) => r.date)).toEqual([...s.recent.map((r) => r.date)].sort());
        expect(s.recent[5]).toEqual({ date: TRADING_DATE, close: 489.5, chgPct: -7.7 });
        expect(s.recent[0]!.date).toBe('2026-11-14');
    });

    test('近 20 日累計用單日漲跌幅連乘：資料庫價格中間拆股（價格跳 8 倍）也不會算出離譜的數字', () => {
        const points = makePoints(25).map((p, i) => (i >= 12 ? { ...p, close: p.close * 8 } : p)); // 第 12 天起價格 ×8，漲跌幅不變
        const s = buildCompanySnapshot({ company, quote: { ...quote, dayChgPct: 1 }, tradingDate: TRADING_DATE, points });

        expect(Math.abs(s.signals.change20dPct!)).toBeLessThan(10);
    });
});
