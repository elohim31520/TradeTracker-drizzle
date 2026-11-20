import type { CardRarity, CardSignals } from '../../types/cardPack';

/** 基準期：當日之前最近 20 個交易日的單日漲跌幅 */
export const BASELINE_DAYS = 20;
/** 基準期至少要有幾個交易日；不足（例如新上市）就當作沒有基準，倍數為 null */
export const MIN_BASELINE_SAMPLES = 10;
/** 平均單日波動的下限（%），避免極平靜的股票讓倍數暴衝 */
const MIN_MEAN_ABS_CHG_PCT = 0.1;
/** 絕對漲跌幅每幾個 % 算「1 倍」：-4% 就是 2 倍 */
const ABS_MOVE_UNIT_PCT = 2;

/** 當日之前某個交易日的單日漲跌幅（來自資料庫的 stock_prices.dayChg） */
export interface HistoryRow {
    /** 美東交易日 yyyy-MM-dd */
    date: string;
    /** 單日漲跌幅（%） */
    dayChgPct: number;
}

export interface TodayQuote {
    price: number;
    /** 當日漲跌幅（%） */
    dayChgPct: number;
    volume: number;
    /** 成交量的比較基準（Yahoo 報價的近 10 日均量）；沒有就是 null */
    avgVolume: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
const roundOrNull = (n: number | null) => (n == null ? null : round2(n));

/**
 * 算出一家公司當天的訊號。history 是「當日之前」每個交易日的單日漲跌幅（由舊到新），
 * 全部用「百分比」計算、不看價格本身，所以拆股造成的價格斷點不會影響結果。
 *
 * 三個異動訊號都換成「正常的幾倍」，1 倍就是平常的樣子：
 * - moveMultiple：今天的波動幅度 ÷ 近 20 日平均單日波動（各公司自己跟自己比，TSLA 與 AAPL 漲 3% 意義不同）
 * - volumeRatio：今天的成交量 ÷ 近 10 日平均量。均量取自同一筆報價，成交量與均量一定在同一個尺度上；
 *   Yahoo 的 10 日均量可能含當天，所以倍數會略偏保守
 * - |當日漲跌幅| ÷ 2%：絕對幅度。卡面上最顯眼的就是漲跌幅，只跟自己比的話，高波動股的 -7.7%
 *   會排在平常很穩的股票 -3.9% 後面，看起來不合理；這一項同時讓新上市（沒有基準）的公司也能排名
 * 分數取三者最大的，所以「只有價格動」或「只有量放大」都算異動。
 */
export function computeSignals(today: TodayQuote, history: HistoryRow[]): CardSignals {
    const baseline = history.slice(-BASELINE_DAYS).map((row) => Math.abs(row.dayChgPct));
    const moveMultiple =
        baseline.length >= MIN_BASELINE_SAMPLES
            ? Math.abs(today.dayChgPct) / Math.max(mean(baseline), MIN_MEAN_ABS_CHG_PCT)
            : null;

    const volumeRatio =
        today.avgVolume != null && today.avgVolume > 0 && today.volume > 0 ? today.volume / today.avgVolume : null;

    // 近 20 個交易日累計：當日加上前 19 個交易日的單日漲跌幅連乘。資料不足 19 天就不給
    const prior = history.slice(-(BASELINE_DAYS - 1));
    const change20dPct =
        prior.length === BASELINE_DAYS - 1
            ? (prior.reduce((acc, row) => acc * (1 + row.dayChgPct / 100), 1 + today.dayChgPct / 100) - 1) * 100
            : null;

    return {
        price: round2(today.price),
        dayChgPct: round2(today.dayChgPct),
        volume: today.volume,
        volumeRatio: roundOrNull(volumeRatio),
        moveMultiple: roundOrNull(moveMultiple),
        change20dPct: roundOrNull(change20dPct),
        score: round2(Math.max(moveMultiple ?? 0, volumeRatio ?? 0, Math.abs(today.dayChgPct) / ABS_MOVE_UNIT_PCT)),
    };
}

/** 各稀有度佔卡數的比例：21 家剛好是 1 / 3 / 6 / 11 張（約 5% / 14% / 29% / 52%） */
const RARITY_SHARE = { legendary: 1 / 21, epic: 3 / 21, rare: 6 / 21 } as const;

/** 依總張數換算各稀有度的張數；傳說至少 1 張，總和一定等於 total */
export function rarityCounts(total: number): Record<CardRarity, number> {
    if (total <= 0) return { legendary: 0, epic: 0, rare: 0, common: 0 };
    const legendary = Math.max(1, Math.round(total * RARITY_SHARE.legendary));
    const epic = Math.min(Math.round(total * RARITY_SHARE.epic), total - legendary);
    const rare = Math.min(Math.round(total * RARITY_SHARE.rare), total - legendary - epic);
    return { legendary, epic, rare, common: total - legendary - epic - rare };
}

/**
 * 依異動分數由高到低排名，切成傳說 / 史詩 / 稀有 / 普通。
 * 用「當天排名」而不是固定門檻：平靜的日子池子裡仍有各等級的卡，崩盤日也不會全是傳說。
 * 分數相同時依代號排序，結果才穩定；分數 0（當天完全沒動）的一律是普通。
 * 稀有度代表「今天這家公司的異動有多不尋常」，與多空方向無關。
 */
export function assignRarities(items: { symbol: string; score: number }[]): Map<string, CardRarity> {
    const counts = rarityCounts(items.length);
    const order: CardRarity[] = [
        ...Array<CardRarity>(counts.legendary).fill('legendary'),
        ...Array<CardRarity>(counts.epic).fill('epic'),
        ...Array<CardRarity>(counts.rare).fill('rare'),
        ...Array<CardRarity>(counts.common).fill('common'),
    ];

    const ranked = [...items].sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
    const result = new Map<string, CardRarity>();
    ranked.forEach((item, index) => {
        result.set(item.symbol, item.score > 0 ? order[index]! : 'common');
    });
    return result;
}
