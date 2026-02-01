import { db } from '../db/pg';
import { stockPrices, companies } from '../db/schema';
import { desc, sql } from 'drizzle-orm';
import { StockPrice } from '../types/stock';

class StockService {
    async getStockSymbol() {
        return await db
            .select({
                symbol: companies.symbol,
                name: companies.name,
            })
            .from(companies);
    }

    async getMarketBreadth(): Promise<number> {
        const stocks = await this.getTodayStocks();
        const totalStocks = stocks.length;
        if (totalStocks === 0) return 0;

        const positiveStocks = stocks.filter((stock) => {
            const dayChg = typeof stock.dayChg === 'string'
                ? parseFloat(stock.dayChg)
                : stock.dayChg;
            return dayChg && dayChg > 0;
        }).length;
        return positiveStocks / totalStocks;
    }

    async getTodayStocks(): Promise<StockPrice[]> {
        const latestRecord = await db
            .select({ createdAt: stockPrices.createdAt })
            .from(stockPrices)
            .orderBy(desc(stockPrices.id))
            .limit(1);

        if (latestRecord.length === 0) return [];
        const targetDate = latestRecord[0].createdAt.toISOString().split('T')[0]

        //，如果你在 SQL 語句裡寫 AS dayChg（沒有加雙引號）PostgreSQL 會自動把所有的識別字（Identifier）強制轉為小寫
        const query = sql`
            SELECT name, symbol, price,"dayChg", weight, "createdAt"
            FROM (
              SELECT
                ${companies.name} as name,
                ${companies.symbol} as symbol,
                ${stockPrices.price} as price,
                ${stockPrices.dayChg} as "dayChg",   -- ✨ 加上雙引號
                ${stockPrices.weight} as weight,
                ${stockPrices.createdAt} as "createdAt", -- ✨ 加上雙引號
                ROW_NUMBER() OVER (
                  PARTITION BY ${stockPrices.companyId} 
                  ORDER BY ${stockPrices.createdAt} DESC
                ) as rn
              FROM ${stockPrices}
              INNER JOIN ${companies} ON ${stockPrices.companyId} = ${companies.id}
              WHERE ${stockPrices.createdAt}::date = ${targetDate}
            ) as ranked_prices
            WHERE rn = 1
          `;

        const result = await db.execute(query);

        return result as unknown as StockPrice[];
    }

    async getStockDayChgSorted() {
        const stocks = await this.getTodayStocks();
        return stocks
            .map((stock) => ({
                ...stock,
                dayChg: typeof stock.dayChg === 'string'
                    ? parseFloat(stock.dayChg.replace('%', ''))
                    : stock.dayChg,
            }))
            .sort((a, b) => (b.dayChg || 0) - (a.dayChg || 0));
    }
}

export default new StockService()
