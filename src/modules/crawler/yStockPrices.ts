import YahooFinance from 'yahoo-finance2';
import logger from '../logger';
import redisClient from '../redis';
import { db } from '../../db/pg';
import { companies, stockPrices } from '../../db/schema';

const yahooFinance = new YahooFinance();

// 美股盤中 regularMarketPrice 是即時價，不是收盤價；偵測到盤中就中止整批，避免把盤中價存成當日收盤價
class MarketOpenError extends Error {}

// /stock/today、/stock/breadth 用 redisCache（TTL 24 小時），快取 key 就是 req.originalUrl（沒有 cache: 前綴，
// 和新聞用的 redisConditionalCache 不同）；帶 query 會產生不同 key，所以用 pattern 掃描刪除，而不是列舉固定 key。
// 爬完才清，下一次請求就會用完整的新資料重建快取。清除失敗不該讓整個任務失敗
const STOCK_CACHE_PATTERNS = ['/stock/today*', '/stock/breadth*'];

async function clearStockCache(): Promise<void> {
    try {
        for (const pattern of STOCK_CACHE_PATTERNS) {
            for await (const keys of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
                if (keys.length) await redisClient.del(keys);
            }
        }
        logger.info('已清除股價相關快取');
    } catch (e) {
        logger.error('⚠️ 清除股價快取失敗', e);
    }
}

interface StockPriceInput {
    price: string;
    dayChg: string;
    weight: string;
    companyId: number;
}

async function getAllCompanies(): Promise<{ symbol: string; id: number }[]> {
    return await db
        .select({
            symbol: companies.symbol,
            id: companies.id,
        })
        .from(companies);
}

async function getStockPrice(symbol: string): Promise<Omit<StockPriceInput, 'companyId'> | null> {
    const result = (await yahooFinance.quote(symbol)) as any;

    if (!result) return null;

    if (result.marketState === 'REGULAR') throw new MarketOpenError();

    // regularMarketChangePercent 是當日漲跌幅（小數，例如 -0.012 代表 -1.2%）
    const price = result.regularMarketPrice?.toString();
    const dayChg = result.regularMarketChangePercent != null
        ? result.regularMarketChangePercent.toFixed(2)
        : '0';

    const weight = '0';

    if (!price) return null;

    return { price, dayChg, weight };
}

export async function crawlStockPrices(): Promise<void> {
    try {
        const sleepTime = 2 * 1000;
        const companiesData = await getAllCompanies();

        if (!companiesData.length) {
            logger.warn('Skipping fetch: No symbols found in the database.');
            return;
        }

        const errorSymbols: string[] = [];
        let insertedCount = 0;

        for (const { symbol, id } of companiesData) {
            try {
                const data = await getStockPrice(symbol);

                if (!data) {
                    logger.warn(`No data returned for symbol: ${symbol}`);
                    continue;
                }

                await db.insert(stockPrices).values({ ...data, companyId: id });
                insertedCount++;
                logger.info(`Successfully fetched price for symbol: ${symbol}`);
            } catch (e) {
                if (e instanceof MarketOpenError) {
                    logger.warn(`美股盤中（marketState=REGULAR），略過本次股價更新（觸發於 ${symbol}，已寫入 ${insertedCount} 筆）`);
                    return;
                }
                logger.error(`Failed to fetch symbol ${symbol}: ${(e as Error).message}`);
                errorSymbols.push(symbol);
            }

            await new Promise((resolve) => setTimeout(resolve, sleepTime));
        }

        if (errorSymbols.length > 0) {
            logger.warn(`Finished with failed symbols: ${errorSymbols.join(', ')}`);
        } else {
            logger.info('All symbols processed successfully.');
        }

        // 至少寫入一筆才清快取；全部失敗的話，保留原本完整的舊快取比清掉後重建出空資料好
        if (insertedCount > 0) await clearStockCache();
    } catch (e) {
        logger.error(`Crawl failed: ${(e as Error).message}`);
    }
}