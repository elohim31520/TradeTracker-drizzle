import { db } from '../db/pg'
import { assets, priceSnapshots } from '../db/schema'
import { PriceSnapshots, NewPriceSnapshots, DateRangeMarketData, GetMarketDataParams, MarketDataRow, StandardizedItem, ConsolidatedPoint, MomentumResult } from '../types/marketSnapshots'
import { eq, desc, sql } from 'drizzle-orm';

import {
    calculateMean,
    calculateStdDev,
    calculateCorrelation
} from '../modules/math';
import {
    MOVING_AVERAGE,
    BTCUSD,
    USOIL,
    DXY,
    US10Y,
    XAUUSD
} from '../constant/market';
import { getZonedDate, subtractDays } from '../modules/date';

class MarketPriceSnapshotsService {
    async create(params: NewPriceSnapshots): Promise<PriceSnapshots> {
        const [data] = await db
            .insert(priceSnapshots)
            .values(params)
            .returning();

        return data;
    }

    async getAll(): Promise<PriceSnapshots[]> {
        const data = await db
            .select()
            .from(priceSnapshots);

        return data;
    }

    async getRegisteredSymbols(): Promise<string[]> {
        const rows = await db
            .select({ symbol: assets.symbol })
            .from(assets);

        return rows.map(r => r.symbol);
    }

    async getMomentumData(data: MarketDataRow[]): Promise<MomentumResult[]> {
        const allSymbols = await this.getRegisteredSymbols();

        // 為了保持邏輯相容性，我們定義一個內部 Mapping 將大寫 Symbol 轉為小寫 Key
        // 例如: 'BTCUSD' -> 'btc', 'US10Y' -> 'us10y'
        const getSafeKey = (sym: string) => sym.toLowerCase().replace('usd', '');

        const consolidatedData = new Map<string, any>();

        // 標準化邏輯
        const standardizeData = (targetData: MarketDataRow[]): StandardizedItem[] => {
            const prices = targetData.map((item) => Number(item.price));
            return targetData.map((item, index) => {
                const start = Math.max(0, index - MOVING_AVERAGE);
                const windowPrices = index === 0 ? [prices[0]] : prices.slice(start, index);
                const currentPrice = Number(item.price);
                const mean = calculateMean(windowPrices);
                const stdDev = calculateStdDev(windowPrices, mean);
                const diff = currentPrice - mean;

                let standardizedValue = 0;
                if (diff !== 0 && Math.abs(stdDev) > 1e-6) {
                    standardizedValue = parseFloat((diff / stdDev).toFixed(2));
                }
                return { ...item, volume: standardizedValue };
            });
        };

        // 1. 依動態取得的 Symbols 進行分類與標準化
        const standardizedGroups: Record<string, StandardizedItem[]> = {};

        allSymbols.forEach(symbol => {
            const filtered = data.filter(d => d.symbol === symbol);
            if (filtered.length > 0) {
                standardizedGroups[symbol] = standardizeData(filtered);
            }
        });

        // 2. 數據聚合
        Object.entries(standardizedGroups).forEach(([symbol, items]) => {
            const key = getSafeKey(symbol);
            items.forEach(({ createdAt, volume }) => {
                if (!consolidatedData.has(createdAt)) {
                    // 初始化聚合點，動態產生所有 symbol 的預設值
                    const initialPoint: any = { createdAt };
                    allSymbols.forEach(s => initialPoint[getSafeKey(s)] = 0);
                    consolidatedData.set(createdAt, initialPoint);
                }
                consolidatedData.get(createdAt)[key] = volume;
            });
        });

        // 3. 動態權重計算 (以 BTC 為基準)
        // 注意：這裡假設資料庫中一定存在 BTCUSD 作為錨點
        const btcSymbol = 'BTCUSD';
        const btcItems = standardizedGroups[btcSymbol] || [];
        const btcV = btcItems.map(i => i.volume).slice(-MOVING_AVERAGE);

        if (btcV.length === 0) throw new Error("缺少基準資產 (BTCUSD) 數據無法計算權重");

        const baseWeight = 0.1;

        // 計算各個資產對 BTC 的權重
        const weights: Record<string, number> = {};
        allSymbols.forEach(symbol => {
            const volumes = (standardizedGroups[symbol] || []).map(i => i.volume).slice(-MOVING_AVERAGE);
            const correlation = volumes.length > 0 ? calculateCorrelation(btcV, volumes) : 0;

            if (symbol === btcSymbol) {
                weights[symbol] = Math.max(0.6, 0.8 + baseWeight * correlation);
            } else if (symbol === 'US10Y') {
                weights[symbol] = baseWeight * Math.abs(correlation); // 債券通常取絕對值
            } else {
                weights[symbol] = baseWeight * correlation;
            }
        });

        // 4. 計算最終加權動能
        return Array.from(consolidatedData.values()).map((point) => {
            let weightedVolume = 0;

            allSymbols.forEach(symbol => {
                const key = getSafeKey(symbol);
                let currentWeight = weights[symbol];

                // 特殊邏輯：高利率情景
                if (symbol === 'US10Y' && point[key] > 4.5) {
                    currentWeight *= 2;
                }

                weightedVolume += (point[key] || 0) * currentWeight;
            });

            return {
                ct: point.createdAt,
                v: parseFloat(weightedVolume.toFixed(2)),
            };
        });
    }

    async getLastSnapshotBySymbol(symbol: string): Promise<any | null> {
        const rows = await db
            .select({
                id: priceSnapshots.id,
                price: priceSnapshots.price,
                createdAt: priceSnapshots.createdAt,
                symbol: assets.symbol,
            })
            .from(priceSnapshots)
            .innerJoin(assets, eq(priceSnapshots.assetId, assets.id))
            .where(eq(assets.symbol, symbol))
            .orderBy(desc(priceSnapshots.createdAt))
            .limit(1);

        if (rows.length === 0) {
            return null
        }

        return rows[0];
    }

    async getDataByDateRange(rangeInDays: number): Promise<DateRangeMarketData[]> {
        const startDate = subtractDays(getZonedDate(), rangeInDays).toISOString();

        // 注意：PostgreSQL，欄位建議使用雙引號或不加引號，DATE_FORMAT 需改為 to_char
        const query = sql<DateRangeMarketData[]>`
          WITH "RankedData" AS (
            SELECT
              ps.id,
              ps.asset_id,
              ps.price,
              ps.change,
              to_char(ps.created_at, 'YYYY-MM-DD HH24') AS "hourGroup",
              ROW_NUMBER() OVER (
                PARTITION BY ps.asset_id, to_char(ps.created_at, 'YYYY-MM-DD HH24')
                ORDER BY ps.change DESC
              ) as rn
            FROM
              price_snapshots ps
            WHERE
              ps.created_at >= ${startDate}
          )
          SELECT
            a.symbol,
            r.price,
            r.change,
            r."hourGroup" AS "createdAt"
          FROM
            "RankedData" r
          JOIN assets a ON r.asset_id = a.id
          WHERE
            r.rn = 1
          ORDER BY
            a.symbol, r."hourGroup"
        `;

        const results = await db.execute(query);

        return results as unknown as DateRangeMarketData[];
    }

    async getMomentumByDateRange(rangeInDays: number) {
        const data = await this.getDataByDateRange(rangeInDays)
        return this.getMomentumData(data)
    }

    async getAllMomentum() {
        const data = await this.getDataByDateRange(3650)
        return this.getMomentumData(data)
    }

    async getWeights(): Promise<Record<string, number>> {
        // 1. 取得指定範圍內的歷史資料
        const data: DateRangeMarketData[] = await this.getDataByDateRange(MOVING_AVERAGE);

        /**
         * 輔助函式：根據 symbol 篩選價格並確保轉換為 number 陣列
         */
        const getPrices = (symbol: string): number[] =>
            data
                .filter((d) => d.symbol === symbol)
                .map((d) => Number(d.price));

        // 2. 整理各資產的價格序列
        const prices: Record<string, number[]> = {
            [BTCUSD]: getPrices(BTCUSD),
            [DXY]: getPrices(DXY),
            [USOIL]: getPrices(USOIL),
            [US10Y]: getPrices(US10Y),
            [XAUUSD]: getPrices(XAUUSD),
        };

        // 3. 取得基準值 (BTC) 的切片
        const btcSlice = prices[BTCUSD].slice(-MOVING_AVERAGE);
        const baseWeight = 0.1;

        /**
         * 內部計算相關係數權重的邏輯
         */
        const getCorrelationWeight = (values: number[], targetPrices: number[]): number => {
            const targetSlice = targetPrices.slice(-MOVING_AVERAGE);
            // 防止空陣列導致計算錯誤
            if (values.length === 0 || targetSlice.length === 0) return 0;
            return baseWeight * calculateCorrelation(values, targetSlice);
        };

        // 4. 計算並回傳最終權重物件
        return {
            [BTCUSD]: Number(
                Math.max(0.6, 0.8 + getCorrelationWeight(btcSlice, prices[BTCUSD])).toFixed(3)
            ),
            [DXY]: Number(getCorrelationWeight(btcSlice, prices[DXY]).toFixed(3)),
            [USOIL]: Number(getCorrelationWeight(btcSlice, prices[USOIL]).toFixed(3)),
            [US10Y]: Number(getCorrelationWeight(btcSlice, prices[US10Y]).toFixed(3)),
            [XAUUSD]: Number(getCorrelationWeight(btcSlice, prices[XAUUSD]).toFixed(3)),
        };
    }

    async getMarketDataBySymbol({ symbol, page, size }: GetMarketDataParams) {
        const limit = size
        const offset = (page - 1) * limit;

        const rows = await db
            .select({
                id: priceSnapshots.id,
                price: priceSnapshots.price,
                createdAt: priceSnapshots.createdAt,
                symbol: assets.symbol,
            })
            .from(priceSnapshots)
            .innerJoin(assets, eq(priceSnapshots.assetId, assets.id))
            .where(eq(assets.symbol, symbol))
            .orderBy(desc(priceSnapshots.createdAt))
            .limit(limit)
            .offset(offset);

        return rows;
    }

    async getQuotes() {
        const subquery = db
            .select({
                id: priceSnapshots.id,
                price: priceSnapshots.price,
                createdAt: priceSnapshots.createdAt,
                assetId: priceSnapshots.assetId,
                rn: sql<number>`row_number() over (
                    partition by ${priceSnapshots.assetId} 
                    order by ${priceSnapshots.createdAt} desc
                    )`.as('rn'),
            })
            .from(priceSnapshots)
            .as('sq');

        //主查詢：從子查詢中篩選出 rn = 1 (最新的一筆) 並關聯 assets 表
        const data = await db
            .select({
                symbol: assets.symbol,
                price: subquery.price,
                createdAt: subquery.createdAt,
                assetId: subquery.assetId,
            })
            .from(subquery)
            .innerJoin(assets, eq(subquery.assetId, assets.id))
            .where(eq(subquery.rn, 1));

        return data;
    }
}

export default new MarketPriceSnapshotsService()
