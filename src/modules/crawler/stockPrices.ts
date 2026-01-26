import axios from 'axios'
import * as cheerio from 'cheerio'
import _ from 'lodash'
import { eq } from 'drizzle-orm'
import { decodeBuffer } from '../util'
import { db } from '../../db/pg' 
import { companies, stockPrices } from '../../db/schema'
import logger from '../logger'

interface StockPriceInput {
	price: string // Drizzle decimal 通常映射為 string 以維持精確度
	dayChg: string
	weight: string
	companyId: number
  }

async function extractDataFromHtml(htmlContent: string): Promise<StockPriceInput[]> {
	const $ = cheerio.load(htmlContent)
	const componentsTable = $('.table-responsive').first().find('table');
	const rows = componentsTable.find('tbody tr').toArray()

	if (rows.length === 0) {
        console.warn("警告：找不到任何數據列，請檢查選擇器或 HTML 內容");
        return [];
    }

    const allCompanies = await db.select().from(companies)
    const companyMap = new Map(allCompanies.map(c => [c.symbol, c.id]))

	const stockPricesData: StockPriceInput[] = []
	
	for (const row of rows) {
        const $row = $(row)
        const cols = $row.find('td')

        const companyName = cols.eq(1).text().trim()
        const symbol = cols.eq(2).text().trim()
        
        // 數據清洗
        const price = cols.eq(4).text().trim().replace(/,/g, '')
        const dayChg = cols.eq(6).text().trim().replace(/[()%]/g, '')
        const weight = cols.eq(3).text().trim().replace('%', '')

        if (!symbol) continue

        // 2. 處理公司 ID (模擬 findOrCreate)
        let companyId = companyMap.get(symbol)
        
        if (!companyId) {
            // 如果公司不存在，則插入新公司
            const [newCompany] = await db.insert(companies)
                .values({ 
                    symbol: symbol, 
                    name: companyName 
                })
                .onConflictDoNothing({ target: companies.symbol }) // 避免併發造成的重複插入
                .returning({ id: companies.id })
            
            if (newCompany) {
                companyId = newCompany.id
            } else {
                // 如果 conflict 了，再查一次
                const existing = await db.query.companies.findFirst({
                    where: eq(companies.symbol, symbol)
                })
                companyId = existing?.id
            }
            
            if (companyId) companyMap.set(symbol, companyId)
        }

        if (companyId) {
            stockPricesData.push({
                companyId: companyId,
                price: price,         // Drizzle decimal 接受 string
                dayChg: dayChg,
                weight: weight,
            })
        }
    }

    return stockPricesData
}

export async function crawlStockPrices(): Promise<void> {
    try {
        const url = process.env.STOCK_PRICES_URL
        if (!url) {
            logger.error('STOCK_PRICES_URL 沒有定義！')
            return
        }

        const resp = await axios.get(url, { responseType: 'arraybuffer' })
        const html = decodeBuffer(resp.data)
        const dataToInsert = await extractDataFromHtml(html)

        if (dataToInsert.length === 0) {
            logger.info('No new stock prices to insert.')
            return
        }

        await db.insert(stockPrices).values(dataToInsert)
        
        logger.info(`成功創建 ${dataToInsert.length} 筆股票價格紀錄。`)
    } catch (e) {
        logger.error(`Crawl Error: ${e instanceof Error ? e.message : e}`)
    }
}