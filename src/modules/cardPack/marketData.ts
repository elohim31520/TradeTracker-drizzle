import YahooFinance from 'yahoo-finance2';
import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '../../db/pg';
import { companies as companiesTable, stockPrices } from '../../db/schema';
import logger from '../logger';
import { ServerError } from '../errors';
import type { HotCompany } from '../../constant/hotCompanies';
import {
    buildCompanySnapshot,
    toDailyPoints,
    toTradingDate,
    type CompanySnapshot,
    type DailyPoint,
} from './snapshotBuilder';

export type { CompanySnapshot, RecentRow } from './snapshotBuilder';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/** 從資料庫讀幾個日曆天的歷史：60 天約 40 個交易日，夠算 20 日基準 */
const HISTORY_LOOKBACK_DAYS = 60;

/** 美股盤中的報價是即時價，不是收盤價；偵測到盤中就中止整批，避免把盤中的數字做成當日的卡 */
export class MarketOpenError extends Error {}

interface YahooQuote {
    symbol: string;
    marketState?: string;
    regularMarketPrice?: number;
    /** 當日漲跌幅，單位是百分比（-3.53 代表 -3.53%），已用昨收驗證 */
    regularMarketChangePercent?: number;
    regularMarketVolume?: number;
    /** 近 10 日平均成交量，與 regularMarketVolume 在同一個尺度上（拆股時也是） */
    averageDailyVolume10Day?: number;
    regularMarketTime?: Date | number;
}

function mostCommon(values: string[]): string | null {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    let best: string | null = null;
    for (const [value, count] of counts) {
        if (best === null || count > counts.get(best)! || (count === counts.get(best) && value > best)) best = value;
    }
    return best;
}

/** 一次取回所有報價（這是生成卡池唯一會打 Yahoo 的地方）。偶爾連線逾時，重試兩次（間隔 3、6 秒）再放棄 */
async function fetchQuotes(symbols: string[]): Promise<YahooQuote[]> {
    const attempts = 3;
    for (let attempt = 1; ; attempt++) {
        try {
            return (await yahooFinance.quote(symbols)) as unknown as YahooQuote[];
        } catch (err) {
            if (attempt >= attempts) throw err;
            logger.warn(`[CardPack] 取報價失敗（第 ${attempt} 次），稍後重試: ${(err as Error).message}`);
            await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
        }
    }
}

/**
 * 從資料庫讀這些公司最近的每日股價（stock_prices，每天台北 06:00 由爬蟲寫入）。
 * 讀不到（資料庫出狀況）不讓整批生成失敗：回空，這次的卡就沒有基準訊號，稀有度只看絕對漲跌幅。
 */
async function loadDailyPoints(symbols: string[]): Promise<Map<string, DailyPoint[]>> {
    try {
        const since = new Date(Date.now() - HISTORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
        const rows = await db
            .select({
                symbol: companiesTable.symbol,
                price: stockPrices.price,
                dayChg: stockPrices.dayChg,
                createdAt: stockPrices.createdAt,
            })
            .from(stockPrices)
            .innerJoin(companiesTable, eq(stockPrices.companyId, companiesTable.id))
            .where(and(inArray(companiesTable.symbol, symbols), gte(stockPrices.createdAt, since)))
            .orderBy(asc(stockPrices.createdAt));

        const bySymbol = new Map<string, typeof rows>();
        for (const row of rows) bySymbol.set(row.symbol, [...(bySymbol.get(row.symbol) ?? []), row]);
        return new Map([...bySymbol].map(([symbol, list]) => [symbol, toDailyPoints(list)]));
    } catch (err) {
        logger.error('[CardPack] 讀取資料庫的歷史股價失敗，這次的卡沒有基準訊號', err);
        return new Map();
    }
}

/**
 * 收集熱門公司最近一個收盤日的行情與訊號。
 *
 * 只打 Yahoo 一次（批次報價）：拿市場狀態、交易日、成交量與 10 日均量。
 * 價格的部分走資料庫：當日收盤價、漲跌幅與 20 日基準都來自 stock_prices（和網站其他頁同一份）；
 * 當天的資料還沒爬進資料庫（06:00 的爬蟲尚未跑完、或失敗）就用同一筆報價頂替，不會因此出不了卡。
 * 池子的日期取「多數公司報價所屬的美東交易日」，這樣遇到國定假日也不會誤判成別天；
 * 報價日期不一致的（停牌、尚未更新）視為過時資料略過。
 */
export async function collectSnapshots(companies: HotCompany[]): Promise<{ date: string; snapshots: CompanySnapshot[] }> {
    const quotes = await fetchQuotes(companies.map((c) => c.symbol));
    if (quotes.some((q) => q.marketState === 'REGULAR')) throw new MarketOpenError();

    const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
    const usable: { company: HotCompany; quote: YahooQuote; date: string }[] = [];
    for (const company of companies) {
        const quote = bySymbol.get(company.symbol);
        if (
            !quote ||
            quote.regularMarketPrice == null ||
            quote.regularMarketChangePercent == null ||
            !quote.regularMarketVolume ||
            !quote.regularMarketTime
        ) {
            logger.warn(`[CardPack] ${company.symbol} 報價不完整，略過`);
            continue;
        }
        usable.push({ company, quote, date: toTradingDate(quote.regularMarketTime) });
    }

    const date = mostCommon(usable.map((u) => u.date));
    if (!date) throw new ServerError('取不到任何熱門公司的報價');

    const current = usable.filter((u) => u.date === date);
    for (const u of usable) {
        if (u.date !== date) logger.warn(`[CardPack] ${u.company.symbol} 報價是 ${u.date}（池子日期 ${date}），視為過時略過`);
    }

    const points = await loadDailyPoints(current.map((u) => u.company.symbol));
    const snapshots = current.map(({ company, quote }) =>
        buildCompanySnapshot({
            company,
            tradingDate: date,
            points: points.get(company.symbol) ?? [],
            quote: {
                price: quote.regularMarketPrice as number,
                dayChgPct: quote.regularMarketChangePercent as number,
                volume: quote.regularMarketVolume as number,
                avgVolume: quote.averageDailyVolume10Day ?? null,
            },
        })
    );

    const fromQuote = snapshots.filter((s) => s.todaySource === 'quote').map((s) => s.symbol);
    const stale = snapshots.filter((s) => s.baselineStale).map((s) => s.symbol);
    if (fromQuote.length) logger.warn(`[CardPack] ${fromQuote.length} 家當天的股價還沒進資料庫，改用報價：${fromQuote.join(',')}`);
    if (stale.length) logger.warn(`[CardPack] ${stale.length} 家資料庫的歷史過期或不足，沒有基準訊號：${stale.join(',')}`);

    return { date, snapshots };
}
