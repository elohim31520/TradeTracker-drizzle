import { assignRarities, computeSignals, rarityCounts, type HistoryRow } from '../src/modules/cardPack/signals';

/** 每天依序漲跌 ±step%，所以平均單日波動 = step% */
function makeHistory(count: number, stepPct: number): HistoryRow[] {
    return Array.from({ length: count }, (_, i) => ({
        date: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10),
        dayChgPct: i % 2 === 0 ? stepPct : -stepPct,
    }));
}
const flat = (count: number, dayChgPct: number): HistoryRow[] =>
    makeHistory(count, 0).map((row) => ({ ...row, dayChgPct }));

describe('computeSignals', () => {
    test('異動訊號是「正常的幾倍」：波動 3% ÷ 平均 1% = 3 倍，量 2500 ÷ 均量 1000 = 2.5 倍', () => {
        const s = computeSignals({ price: 105, dayChgPct: 3, volume: 2500, avgVolume: 1000 }, makeHistory(25, 1));

        expect(s.moveMultiple).toBe(3);
        expect(s.volumeRatio).toBe(2.5);
        expect(s.score).toBe(3); // 取最大的
        expect(s.price).toBe(105);
        expect(s.dayChgPct).toBe(3);
    });

    test('平均單日波動只看最近 20 天，更早的不算', () => {
        // 前 10 天波動很大（±10%），最近 20 天都是 ±1%
        const history = [...makeHistory(10, 10), ...makeHistory(20, 1)];
        expect(computeSignals({ price: 100, dayChgPct: 2, volume: 1, avgVolume: 1 }, history).moveMultiple).toBe(2);
    });

    test('沒有均量（新上市或報價沒給）：量能倍數是 null，其餘訊號照算', () => {
        const none = computeSignals({ price: 100, dayChgPct: 3, volume: 2500, avgVolume: null }, makeHistory(25, 1));
        expect(none.volumeRatio).toBeNull();
        expect(none.moveMultiple).toBe(3);
        expect(computeSignals({ price: 100, dayChgPct: 3, volume: 2500, avgVolume: 0 }, makeHistory(25, 1)).volumeRatio).toBeNull();
    });

    test('近 20 日累計 = 當日加上前 19 天的單日漲跌幅連乘', () => {
        const s = computeSignals({ price: 100, dayChgPct: 1, volume: 1, avgVolume: 1 }, flat(19, 1));
        expect(s.change20dPct).toBeCloseTo((Math.pow(1.01, 20) - 1) * 100, 1); // 22.02
    });

    test('累計漲幅只看百分比：資料庫價格中間拆股（價格斷點）也不受影響', () => {
        // computeSignals 根本不看歷史價格；這個測試固定住這個性質：只要單日漲跌幅一樣，結果就一樣
        const a = computeSignals({ price: 100, dayChgPct: 2, volume: 1, avgVolume: 1 }, flat(19, 0.5));
        const b = computeSignals({ price: 800, dayChgPct: 2, volume: 1, avgVolume: 1 }, flat(19, 0.5));
        expect(a.change20dPct).toBe(b.change20dPct);
    });

    test('歷史不足 19 天：累計漲幅是 null；不足 10 天：連波動倍數也是 null，分數退回絕對幅度', () => {
        const s18 = computeSignals({ price: 100, dayChgPct: 1, volume: 1, avgVolume: 1 }, flat(18, 1));
        expect(s18.change20dPct).toBeNull();
        expect(s18.moveMultiple).not.toBeNull();

        const s5 = computeSignals({ price: 50, dayChgPct: -6, volume: 1000, avgVolume: null }, makeHistory(5, 1));
        expect(s5.moveMultiple).toBeNull();
        expect(s5.volumeRatio).toBeNull();
        expect(s5.change20dPct).toBeNull();
        expect(s5.score).toBe(3); // |-6| ÷ 2
    });

    test('沒有任何歷史（基準過期）：只剩量能與絕對幅度', () => {
        const s = computeSignals({ price: 100, dayChgPct: 4, volume: 3000, avgVolume: 1000 }, []);
        expect(s.moveMultiple).toBeNull();
        expect(s.change20dPct).toBeNull();
        expect(s.volumeRatio).toBe(3);
        expect(s.score).toBe(3); // max(量能 3, 絕對 4÷2=2)
    });

    test('絕對幅度也算分：高波動股的 -7.7% 不會輸給平穩股的 -3.9%', () => {
        const volatile = computeSignals({ price: 90, dayChgPct: -7.72, volume: 1, avgVolume: 1 }, makeHistory(25, 6));
        const steady = computeSignals({ price: 96, dayChgPct: -3.87, volume: 1, avgVolume: 1 }, makeHistory(25, 2));

        // 只看自己的歷史，平穩股的 -3.87% 是約 1.9 倍、高波動股的 -7.72% 才約 1.3 倍
        expect(volatile.moveMultiple!).toBeLessThan(steady.moveMultiple!);
        // 加上絕對幅度後順序對了
        expect(volatile.score).toBeGreaterThan(steady.score);
        expect(volatile.score).toBeCloseTo(3.86, 2);
    });

    test('極平靜的股票有波動下限，倍數不會暴衝', () => {
        const s = computeSignals({ price: 100.5, dayChgPct: 0.5, volume: 1, avgVolume: 1 }, flat(25, 0));
        expect(s.moveMultiple).toBe(5); // 0.5 ÷ 下限 0.1
    });
});

describe('rarityCounts', () => {
    test('21 家剛好是 1 / 3 / 6 / 11', () => {
        expect(rarityCounts(21)).toEqual({ legendary: 1, epic: 3, rare: 6, common: 11 });
    });

    test('任何張數：總和等於張數，且至少有一張傳說', () => {
        for (let n = 1; n <= 60; n++) {
            const c = rarityCounts(n);
            expect(c.legendary + c.epic + c.rare + c.common).toBe(n);
            expect(c.legendary).toBeGreaterThanOrEqual(1);
            expect(c.common).toBeGreaterThanOrEqual(0);
        }
        expect(rarityCounts(0)).toEqual({ legendary: 0, epic: 0, rare: 0, common: 0 });
    });
});

describe('assignRarities', () => {
    const items = Array.from({ length: 21 }, (_, i) => ({ symbol: `S${String(i).padStart(2, '0')}`, score: 21 - i }));

    test('依分數由高到低排名切段', () => {
        const result = assignRarities(items);
        const tally = { legendary: 0, epic: 0, rare: 0, common: 0 };
        for (const rarity of result.values()) tally[rarity]++;

        expect(tally).toEqual({ legendary: 1, epic: 3, rare: 6, common: 11 });
        expect(result.get('S00')).toBe('legendary');
        expect(result.get('S01')).toBe('epic');
        expect(result.get('S03')).toBe('epic');
        expect(result.get('S04')).toBe('rare');
        expect(result.get('S10')).toBe('common');
    });

    test('與輸入順序無關', () => {
        const shuffled = [...items].reverse();
        expect(assignRarities(shuffled)).toEqual(assignRarities(items));
    });

    test('分數相同時依代號排序，結果穩定', () => {
        const result = assignRarities([
            { symbol: 'B', score: 2 },
            { symbol: 'A', score: 2 },
        ]);
        expect(result.get('A')).toBe('legendary');
        expect(result.get('B')).not.toBe('legendary');
    });

    test('分數 0（當天完全沒動）一律是普通，不佔稀有度名額', () => {
        const result = assignRarities([
            { symbol: 'A', score: 5 },
            { symbol: 'B', score: 0 },
            { symbol: 'C', score: 0 },
        ]);
        expect(result.get('A')).toBe('legendary');
        expect(result.get('B')).toBe('common');
        expect(result.get('C')).toBe('common');
    });
});
