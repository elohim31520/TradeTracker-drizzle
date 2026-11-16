import YahooFinance from 'yahoo-finance2';
import logger from '../logger';
import { db } from '../../db/pg';
import { assets, priceSnapshots } from '../../db/schema';
import { BTCUSD, USOIL, DXY, US10Y, XAUUSD } from '../../constant/market';

type NewPriceSnapshot = typeof priceSnapshots.$inferInsert;

const yahooFinance = new YahooFinance();

/**
 * assets.symbol → Yahoo Finance ticker。
 * changeField 決定 price_snapshots.change 存什麼：
 *  - percent：當日漲跌幅（%）
 *  - points：當日絕對變動點數。US10Y 沿用原本 tradingeconomics 的語意（殖利率變動幾個百分點），
 *    若改存相對漲跌幅（5.1 → 5.15 = +1%）會和歷史資料不一致
 * 黃金、原油用的是近月期貨（GC=F、CL=F），不是現貨價，和舊來源的現貨報價會有小幅價差。
 */
const YAHOO_MARKET_TICKERS: Record<string, { ticker: string; changeField: 'percent' | 'points' }> = {
    [BTCUSD]: { ticker: 'BTC-USD', changeField: 'percent' },
    [XAUUSD]: { ticker: 'GC=F', changeField: 'percent' },
    [USOIL]: { ticker: 'CL=F', changeField: 'percent' },
    [DXY]: { ticker: 'DX-Y.NYB', changeField: 'percent' },
    [US10Y]: { ticker: '^TNX', changeField: 'points' },
};

/**
 * 市場快照（BTC、黃金、原油、DXY、US10Y）。
 * priceSnapshots.ts 爬 tradingeconomics.com，GCP 機房 IP 被擋（403）後改用 Yahoo Finance，
 * 與股價爬蟲（yStockPrices.ts）同一個資料源。一次 quote() 批次取回全部標的，每次只發一個請求。
 */
export async function crawlMarketPriceSnapshots(): Promise<void> {
    try {
        const allAssets = await db.select().from(assets);

        const targets = allAssets.flatMap((asset) => {
            const config = YAHOO_MARKET_TICKERS[asset.symbol];
            if (!config) {
                logger.warn(`無法抓取標的數據: ${asset.symbol}（YAHOO_MARKET_TICKERS 沒有對應的 ticker）`);
                return [];
            }
            return [{ asset, ...config }];
        });

        if (targets.length === 0) return;

        const quotes = await yahooFinance.quote(targets.map((t) => t.ticker));
        const quoteByTicker = new Map(quotes.map((q) => [q.symbol, q]));

        const results: NewPriceSnapshot[] = [];

        for (const { asset, ticker, changeField } of targets) {
            const quote = quoteByTicker.get(ticker);
            const price = quote?.regularMarketPrice;
            const change = changeField === 'points'
                ? quote?.regularMarketChange
                : quote?.regularMarketChangePercent;

            if (price == null || change == null || !Number.isFinite(price) || !Number.isFinite(change)) {
                logger.warn(`無法抓取標的數據: ${asset.symbol}（Yahoo ticker ${ticker}）`);
                continue;
            }

            results.push({
                assetId: asset.id,
                // Drizzle 的 decimal 會被解析為 string 以維持精確度
                price: price.toString(),
                change: change.toFixed(4),
            });
        }

        if (results.length > 0) {
            await db.insert(priceSnapshots).values(results);
            logger.info(`成功儲存 ${results.length} 筆價格快照`);
        }
    } catch (e) {
        logger.error(`Crawl Error: ${e instanceof Error ? e.message : e}`);
    }
}
