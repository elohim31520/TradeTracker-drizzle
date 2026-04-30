import YahooFinance from 'yahoo-finance2';
import logger from '../logger';
import { db } from '../../db/pg';
import { companies, companyMetrics } from '../../db/schema';

const yahooFinance = new YahooFinance();

export interface CompanyMetricsInsert {
    price?: string;
    peTrailing?: string;
    peForward?: string;
    epsTrailing?: string;
    epsForward?: string;
    volume?: number;
    marketCap?: string;
}

async function getAllSp500Symbols(): Promise<{ symbol: string; id: number }[]> {
    return await db
        .select({
            symbol: companies.symbol,
            id: companies.id,
        })
        .from(companies);
}

async function getCompanyMetrics(symbol: string): Promise<CompanyMetricsInsert> {
    const result = (await yahooFinance.quote(symbol)) as any;

    if (!result) return {};

    return {
        price: result.regularMarketPrice?.toString(),
        peTrailing: result.trailingPE?.toString(),
        peForward: result.forwardPE?.toString(),
        epsTrailing: result.epsTrailingTwelveMonths?.toString(),
        epsForward: result.epsForward?.toString(),
        volume: result.regularMarketVolume,
        marketCap: result.marketCap?.toString(),
    };
}

export async function crawlCompanyMetrics(): Promise<void> {
    try {
        const sleepTime = 1.2 * 1000;
        const companiesData = await getAllSp500Symbols();

        if (!companiesData.length) {
            logger.warn('Skipping fetch: No symbols found in the database.');
            return;
        }

        const errorSymbols: string[] = [];

        for (const { symbol, id } of companiesData) {
            try {
                const data = await getCompanyMetrics(symbol);

                await db.insert(companyMetrics).values({
                    ...data,
                    companyId: id,
                });
                // 若同一公司只保留最新一筆，改用 upsert：
                // .onConflictDoUpdate({
                //   target: companyMetrics.companyId,
                //   set: { ...data, updatedAt: new Date() },
                // });

                logger.info(`Successfully processed symbol: ${symbol}`);
            } catch (e) {
                logger.error(`Failed to process symbol ${symbol}: ${(e as Error).message}`);
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