import * as cheerio from 'cheerio';
import 'dotenv/config';
import Sp500Fetcher from '../financialDataFetcher';
import logger from '../logger';
import { db } from '../../db/pg';
import { companies, companyMetrics } from '../../db/schema';

export interface CompanyMetricsInsert {
	price?: string;
	peTrailing?: string;
	peForward?: string;
	epsTrailing?: string;
	epsForward?: string;
	volume?: number;
	marketCap?: string;
  }

async function getAllSp500Symbols(): Promise<{ symbol: string, id: number }[]> {
	return await db
		.select({
			symbol: companies.symbol,
			id: companies.id,
		})
		.from(companies);
}

function extractDataFromHtml(html: string): CompanyMetricsInsert {
	const $ = cheerio.load(html);
	const targetTable = $('.row .col-lg-7 .table');
	const tdObject: Record<string, string> = {};
  
	targetTable.find('tbody tr').each((_, element) => {
	  const tds = $(element).find('td');
	  const key1 = $(tds[0]).text().trim();
	  const value1 = $(tds[1]).text().trim();
	  const key2 = $(tds[2]).text().trim();
	  const value2 = $(tds[3]).text().trim();
  
	  if (key1) tdObject[key1] = value1;
	  if (key2) tdObject[key2] = value2;
	});
  
	const keymap: Record<string, keyof CompanyMetricsInsert> = {
	  'P/E (Trailing)': 'peTrailing',
	  'P/E (Forward)': 'peForward',
	  'EPS (Trailing)': 'epsTrailing',
	  'Prev Close': 'price',
	  'EPS (Forward)': 'epsForward',
	  'Volume': 'volume',
	  'Market Cap': 'marketCap',
	};
  
	const params: CompanyMetricsInsert = {};
  
	for (const [rawKey, value] of Object.entries(tdObject)) {
	  const mappedKey = keymap[rawKey];
	  if (!mappedKey || value === undefined || value === '') continue;
  
	  if (mappedKey === 'marketCap') {
		params[mappedKey] = value;
	  } else if (mappedKey === 'volume') {
		// Volume 是 Integer，保持為 number
		const num = parseInt(value.replace(/,/g, ''), 10);
		if (!isNaN(num)) params[mappedKey] = num;
	  } else {
		// 其餘 Decimal 欄位：先清洗符號，再轉回 string 供 Drizzle 使用
		const cleanedValue = value.replace(/,/g, '').replace('$', '');
		const num = parseFloat(cleanedValue);
		if (!isNaN(num)) {
		  params[mappedKey] = num.toString(); // <--- 關鍵：轉回字串
		}
	  }
	}
  
	return params;
  }

export async function crawlCompanyMetrics(): Promise<void> {
    try {
        const sleepTime = 6 * 1000;
        const companiesData = await getAllSp500Symbols();
        
        if (!companiesData.length) {
            logger.warn('Skipping fetch: No symbols found in the database.');
            return;
        }

        // 1. 建立 Map 提升效能與安全性
        const symbolToIdMap = new Map(companiesData.map(c => [c.symbol, c.id]));
        const symbols = Array.from(symbolToIdMap.keys());

        if (!process.env.SP500_URL) {
            logger.error('SP500_URL is not defined.');
            return;
        }

        const myFetch = new Sp500Fetcher({
            requestUrl: process.env.SP500_URL,
            stockSymbols: symbols,
        });

        while (true) {
            const symbol = myFetch.getCurrentSymbol();
            if (!symbol) break;

            try {
                const htmlContent = await myFetch.fetchHtml();
                const data = extractDataFromHtml(htmlContent);
                
                const companyId = symbolToIdMap.get(symbol);
                
                if (!companyId) {
                    throw new Error(`Symbol ${symbol} exists in fetcher but not in DB mapping`);
                }

                // 2. 執行插入 (建議用 upsert 避免重複執行報錯)
                await db.insert(companyMetrics)
                    .values({
                        ...data,
                        companyId: companyId,
                    })
                    // 如果你的業務邏輯是：同一個公司只留最新一筆，可以加這段：
                    /*
                    .onConflictDoUpdate({
                        target: companyMetrics.companyId,
                        set: { ...data, updatedAt: new Date() }
                    })
                    */
                
                logger.info(`Successfully processed symbol: ${symbol}`);
                
                myFetch.currentIndex++;
                await new Promise((resolve) => setTimeout(resolve, sleepTime));
                
            } catch (e) {
                logger.error(`Failed to process symbol ${symbol}: ${(e as Error).message}`);
                myFetch.addErrorSymbol();
                myFetch.currentIndex++;
            }
        }
        
        // 最後打印結算資訊
        const errorSymbols = myFetch.getAllErrorSymbols();
        if (errorSymbols.length > 0) {
            logger.warn(`Finished with failed symbols: ${errorSymbols.join(', ')}`);
        } else {
            logger.info('All symbols processed successfully.');
        }

    } catch (e) {
        logger.error(`Crawl failed: ${(e as Error).message}`);
    }
}