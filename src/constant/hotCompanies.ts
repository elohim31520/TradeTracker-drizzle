export interface HotCompany {
    /** 大寫代號（Yahoo Finance 的 symbol） */
    symbol: string;
    name: string;
}

/**
 * 卡包只處理這份熱門公司名單，每家每天一張卡。
 * 與前端（探索熱門公司）是同一份名單，
 * 兩邊要一起改；前端用小寫 id，這裡用大寫代號。
 */
export const HOT_COMPANIES: HotCompany[] = [
    { symbol: 'SPCX', name: 'SpaceX' },
    { symbol: 'SNDK', name: 'Sandisk' },
    { symbol: 'MU', name: 'Micron' },
    { symbol: 'COHR', name: 'Coherent' },
    { symbol: 'LITE', name: 'Lumentum' },
    { symbol: 'TSM', name: 'TSMC' },
    { symbol: 'AMD', name: 'AMD' },
    { symbol: 'AVGO', name: 'Broadcom' },
    { symbol: 'INTC', name: 'Intel' },
    { symbol: 'MRVL', name: 'Marvell' },
    { symbol: 'STX', name: 'Seagate' },
    { symbol: 'GEV', name: 'GE Vernova' },
    { symbol: 'LLY', name: 'Eli Lilly' },
    { symbol: 'TSLA', name: 'Tesla' },
    { symbol: 'NVDA', name: 'NVIDIA' },
    { symbol: 'PLTR', name: 'Palantir' },
    { symbol: 'AMZN', name: 'Amazon' },
    { symbol: 'GOOG', name: 'Alphabet' },
    { symbol: 'META', name: 'Meta' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'AAPL', name: 'Apple' },
];
