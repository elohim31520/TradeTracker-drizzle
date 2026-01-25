import axios from 'axios';
import * as cheerio from 'cheerio';
import _ from 'lodash';
import 'dotenv/config';

import { MARKET_INDEX_HEADERS } from '../../constant/config'
import { BTCUSD, USOIL, DXY, US10Y, XAUUSD } from '../../constant/market'
import { decodeBuffer } from '../util'
import logger from '../logger'
import { db } from '../../db/pg'
import { assets, priceSnapshots } from '../../pgSchema';

type NewPriceSnapshot = typeof priceSnapshots.$inferInsert;

function extractDataFromHtml($: cheerio.CheerioAPI, symbol: string, assetId: number): NewPriceSnapshot | null {
    let selector: string;

    if (symbol === USOIL) {
        selector = `tr[data-symbol="CL1:COM"]`;
    } else if (symbol === US10Y) {
        selector = 'tr[data-symbol="USGG10YR:IND"]';
    } else {
        selector = `tr[data-symbol="${symbol}:CUR"]`;
    }

    const row = $(selector);
    if (!row.length) return null;

    const val = row.find('td#p').text().trim();
    const chValue = row.find('td#pch').text().trim().replace('%', '');

    const price = parseFloat(val);
    const change = parseFloat(chValue);

    if (isNaN(price) || isNaN(change)) return null;

    return {
        assetId,
        // Drizzle 的 decimal 會被解析為 string 以維持精確度
        // 寫入時可以傳入 string 或是 number
        price: price.toString(), 
        change: change.toString(),
    };
}

export async function crawlMarketPriceSnapshots(): Promise<void> {
    const url = process.env.MARKET_URL;

    if (!url) {
        logger.error('MARKET_URL 環境變數沒定義！');
        return;
    }

    try {
        const res = await axios.get(url, { 
            headers: MARKET_INDEX_HEADERS,
            responseType: 'arraybuffer' // 確保 decodeBuffer 能處理原始資料
        });
        
        const htmlContent = decodeBuffer(res.data);
        const $ = cheerio.load(htmlContent);

        const allAssets = await db.select().from(assets);
        
        const results: NewPriceSnapshot[] = [];

        for (const asset of allAssets) {
            const data = extractDataFromHtml($, asset.symbol, asset.id);

            if (data) {
                results.push(data);
            } else {
                logger.warn(`無法抓取標的數據: ${asset.symbol}`);
            }
        }

        if (results.length > 0) {
            await db.insert(priceSnapshots).values(results);
            logger.info(`成功儲存 ${results.length} 筆價格快照`);
        }
        
    } catch (e: any) {
        logger.error(`Crawl Error: ${e.message}`);
    }
}