import { formatInTimeZone } from 'date-fns-tz';
import type { HotCompany } from '../../constant/hotCompanies';
import type { CardSignals } from '../../types/cardPack';
import { computeSignals } from './signals';

const MARKET_TIMEZONE = 'America/New_York';
/**
 * 資料庫最後一筆歷史離池子日期超過幾個日曆天，就視為基準過期：爬蟲壞了好幾天時，
 * 拿舊的資料算「近 20 日」會是錯的，寧可不給基準（倍數與累計漲幅留空），也不要給錯的數字。
 * 一般的週末與連假最多隔 4 天，10 天足夠容納幾次漏爬。
 */
export const MAX_HISTORY_GAP_DAYS = 10;
/** prompt 裡附上的近期交易日筆數（不含當日） */
const RECENT_ROWS = 5;

export interface RecentRow {
    date: string;
    close: number;
    chgPct: number;
}

export interface CompanySnapshot {
    symbol: string;
    name: string;
    /** 資料所屬的美東交易日 */
    date: string;
    signals: CardSignals;
    /** 近幾個交易日的收盤與漲跌幅（由舊到新，最後一筆是當日） */
    recent: RecentRow[];
    /** 當日的收盤價與漲跌幅取自哪裡：資料庫（和網站其他頁同一份）；當天的資料還沒爬進資料庫就用報價 */
    todaySource: 'db' | 'quote';
    /** 資料庫的歷史是否過期或不足，過期時基準訊號（倍數、累計漲幅）留空 */
    baselineStale: boolean;
}

/** 資料庫 stock_prices 的一筆，已換成美東交易日 */
export interface DailyPoint {
    date: string;
    close: number;
    dayChgPct: number;
}

/** 這家公司最近一個收盤日的報價（Yahoo 一次批次報價，順便拿到成交量與均量） */
export interface QuoteInput {
    price: number;
    dayChgPct: number;
    volume: number;
    /** Yahoo 的近 10 日均量；沒有就是 null */
    avgVolume: number | null;
}

/** Date 或 Unix 時間戳 → 美東交易日 yyyy-MM-dd */
export function toTradingDate(value: Date | number): string {
    const date = value instanceof Date ? value : new Date(value < 1e12 ? value * 1000 : value);
    return formatInTimeZone(date, MARKET_TIMEZONE, 'yyyy-MM-dd');
}

/**
 * stock_prices 的列轉成「每個美東交易日一筆」：爬蟲在台北 06:00（= 美東前一天傍晚）寫入，
 * 換成美東日期就是那個交易日；同一天有多筆（重跑、開發環境每小時爬）只留最後一筆。
 * 價格或漲跌幅缺值的列略過。結果由舊到新。
 */
export function toDailyPoints(rows: { price: string | null; dayChg: string | null; createdAt: Date }[]): DailyPoint[] {
    const byDate = new Map<string, { at: number; point: DailyPoint }>();
    for (const row of rows) {
        const close = Number(row.price);
        const dayChgPct = Number(row.dayChg);
        if (row.price == null || row.dayChg == null || !Number.isFinite(close) || !Number.isFinite(dayChgPct)) continue;
        const date = toTradingDate(row.createdAt);
        const at = row.createdAt.getTime();
        const existing = byDate.get(date);
        if (!existing || at >= existing.at) byDate.set(date, { at, point: { date, close, dayChgPct } });
    }
    return [...byDate.values()].map((v) => v.point).sort((a, b) => a.date.localeCompare(b.date));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000);

/**
 * 組出一家公司的快照（純函式，不碰資料庫與網路）。
 * - 歷史（基準）只取池子日期「之前」的資料庫紀錄；
 * - 當日的收盤價與漲跌幅優先用資料庫裡那天的紀錄（和網站其他頁同一份），還沒爬進來就用報價；
 * - 成交量與均量一律來自報價（資料庫沒有當天的成交量：company_metrics 要到台北 15:00 才爬）。
 */
export function buildCompanySnapshot(input: {
    company: HotCompany;
    quote: QuoteInput;
    tradingDate: string;
    /** 資料庫的每日紀錄，由舊到新 */
    points: DailyPoint[];
    maxGapDays?: number;
}): CompanySnapshot {
    const { company, quote, tradingDate, points, maxGapDays = MAX_HISTORY_GAP_DAYS } = input;

    const todayPoint = points.find((p) => p.date === tradingDate);
    const prior = points.filter((p) => p.date < tradingDate);
    const last = prior[prior.length - 1];
    const baselineStale = !last || daysBetween(last.date, tradingDate) > maxGapDays;
    const usable = baselineStale ? [] : prior;

    const price = todayPoint?.close ?? quote.price;
    const dayChgPct = todayPoint?.dayChgPct ?? quote.dayChgPct;

    const signals = computeSignals(
        { price, dayChgPct, volume: quote.volume, avgVolume: quote.avgVolume },
        usable.map((p) => ({ date: p.date, dayChgPct: p.dayChgPct }))
    );
    const recent: RecentRow[] = [
        ...usable.slice(-RECENT_ROWS).map((p) => ({ date: p.date, close: round2(p.close), chgPct: round2(p.dayChgPct) })),
        { date: tradingDate, close: round2(price), chgPct: round2(dayChgPct) },
    ];

    return {
        symbol: company.symbol,
        name: company.name,
        date: tradingDate,
        signals,
        recent,
        todaySource: todayPoint ? 'db' : 'quote',
        baselineStale,
    };
}
