import YahooFinance from 'yahoo-finance2';
import logger from '../logger';
import { db } from '../../db/pg';
import { companies, stockPrices } from '../../db/schema';

const yahooFinance = new YahooFinance();

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

    // regularMarketChangePercent 是當日漲跌幅（小數，例如 -0.012 代表 -1.2%）
    const price = result.regularMarketPrice?.toString();
    const dayChg = result.regularMarketChangePercent != null
        ? (result.regularMarketChangePercent * 100).toFixed(2)  // 轉成百分比字串
        : '0';
    // Yahoo Finance quote 沒有直接提供 weight（成分股權重），預設帶 '0'
    // 若你有其他來源可以在這裡替換
    const weight = '0';

    if (!price) return null;

    return { price, dayChg, weight };
}

export async function crawlStockPrices(): Promise<void> {
    try {
        const sleepTime = 1.2 * 1000;
        const companiesData = await getAllCompanies();

        if (!companiesData.length) {
            logger.warn('Skipping fetch: No symbols found in the database.');
            return;
        }

        const errorSymbols: string[] = [];

        for (const { symbol, id } of companiesData) {
            try {
                const data = await getStockPrice(symbol);

                if (!data) {
                    logger.warn(`No data returned for symbol: ${symbol}`);
                    continue;
                }

                await db.insert(stockPrices).values({ ...data, companyId: id });
                logger.info(`Successfully fetched price for symbol: ${symbol}`);
            } catch (e) {
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
    } catch (e) {
        logger.error(`Crawl failed: ${(e as Error).message}`);
    }
}