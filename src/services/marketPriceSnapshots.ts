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

export async function create(params: NewPriceSnapshots): Promise<PriceSnapshots> {
    const [data] = await db
        .insert(priceSnapshots)
        .values(params)
        .returning();

    return data;
}

export async function getAll(): Promise<PriceSnapshots[]> {
    const data = await db
        .select()
        .from(priceSnapshots);

    return data;
}

export async function getRegisteredSymbols(): Promise<string[]> {
    const rows = await db
        .select({ symbol: assets.symbol })
        .from(assets);

    return rows.map(r => r.symbol);
}

export async function getMomentumData(data: MarketDataRow[]): Promise<MomentumResult[]> {
    const allSymbols = await getRegisteredSymbols();

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

    // 2. 數據聚合（額外保存原始價格，供高利率判斷使用）
    Object.entries(standardizedGroups).forEach(([symbol, items]) => {
        const key = getSafeKey(symbol);
        items.forEach(({ createdAt, volume, price }) => {
            if (!consolidatedData.has(createdAt)) {
                // 初始化聚合點，動態產生所有 symbol 的預設值
                const initialPoint: any = { createdAt };
                allSymbols.forEach(s => initialPoint[getSafeKey(s)] = 0);
                consolidatedData.set(createdAt, initialPoint);
            }
            consolidatedData.get(createdAt)[key] = volume;
            // 保存原始價格，供需要判斷實際數值的特殊邏輯使用
            consolidatedData.get(createdAt)[`_rawPrice_${key}`] = Number(price);
        });
    });

    // 3. 動態權重計算 (以 BTC 為基準)
    // BTC 與自己的相關係數 = 1.0，自然取得最高權重，無需硬設底值
    const btcSymbol = 'BTCUSD';
    const btcItems = standardizedGroups[btcSymbol] || [];
    const btcV = btcItems.map(i => i.volume).slice(-MOVING_AVERAGE);

    if (btcV.length === 0) throw new Error("缺少基準資產 (BTCUSD) 數據無法計算權重");

    // 3-1. 各資產原始相關係數
    const rawCorrelations: Record<string, number> = {};
    allSymbols.forEach(symbol => {
        const volumes = (standardizedGroups[symbol] || []).map(i => i.volume).slice(-MOVING_AVERAGE);
        rawCorrelations[symbol] = volumes.length > 0 ? calculateCorrelation(btcV, volumes) : 0;
    });

    // 3-2. 正規化：絕對值加總為 1，保留正負方向
    // 正相關資產貢獻正向動能，負相關資產（US10Y、DXY）自然拖累
    const normalize = (correlations: Record<string, number>): Record<string, number> => {
        const totalAbs = Object.values(correlations).reduce((sum, v) => sum + Math.abs(v), 0);
        if (totalAbs === 0) return correlations;
        return Object.fromEntries(
            Object.entries(correlations).map(([k, v]) => [k, v / totalAbs])
        );
    };

    // 4. 計算最終加權動能
    return Array.from(consolidatedData.values()).map((point) => {
        // 高利率情景：US10Y 實際利率 > 4.5% 時，拖累效果加倍，再重新 normalize
        const us10yKey = getSafeKey(US10Y);
        const actualRate = point[`_rawPrice_${us10yKey}`] ?? 0;
        const adjustedCorrelations = { ...rawCorrelations };
        if (actualRate > 4.5) {
            adjustedCorrelations[US10Y] = rawCorrelations[US10Y] * 2;
        }
        const finalWeights = normalize(adjustedCorrelations);

        let weightedVolume = 0;
        allSymbols.forEach(symbol => {
            const key = getSafeKey(symbol);
            weightedVolume += (point[key] || 0) * finalWeights[symbol];
        });

        return {
            ct: point.createdAt,
            v: parseFloat(weightedVolume.toFixed(2)),
        };
    });
}

export async function getLastSnapshotBySymbol(symbol: string): Promise<any | null> {
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

export async function getDataByDateRange(rangeInDays: number): Promise<DateRangeMarketData[]> {
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
                ORDER BY ABS(ps.change) DESC
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

export async function getMomentumByDateRange(rangeInDays: number) {
    const data = await getDataByDateRange(rangeInDays)
    return getMomentumData(data)
}

export async function getAllMomentum() {
    const data = await getDataByDateRange(3650)
    return getMomentumData(data)
}

export async function getWeights(): Promise<Record<string, number>> {
    // 1. 取得指定範圍內的歷史資料
    const data: DateRangeMarketData[] = await getDataByDateRange(MOVING_AVERAGE);

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

    // 4. 各資產對 BTC 的相關係數（BTC 自己 = 1.0，自然最高）
    const getCorrelation = (targetPrices: number[]): number => {
        const targetSlice = targetPrices.slice(-MOVING_AVERAGE);
        if (btcSlice.length === 0 || targetSlice.length === 0) return 0;
        return calculateCorrelation(btcSlice, targetSlice);
    };

    const rawCorrelations = {
        [BTCUSD]: getCorrelation(prices[BTCUSD]),
        [DXY]: getCorrelation(prices[DXY]),
        [USOIL]: getCorrelation(prices[USOIL]),
        [US10Y]: getCorrelation(prices[US10Y]),
        [XAUUSD]: getCorrelation(prices[XAUUSD]),
    };

    // 5. 正規化：絕對值加總為 1，保留正負方向
    const totalAbs = Object.values(rawCorrelations).reduce((sum, v) => sum + Math.abs(v), 0);
    return Object.fromEntries(
        Object.entries(rawCorrelations).map(([k, v]) => [
            k,
            Number((totalAbs === 0 ? 0 : v / totalAbs).toFixed(3))
        ])
    );
}

export async function getMarketDataBySymbol({ symbol, page, size }: GetMarketDataParams) {
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

export async function getQuotes() {
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

export default {
    create,
    getAll,
    getRegisteredSymbols,
    getMomentumData,
    getLastSnapshotBySymbol,
    getDataByDateRange,
    getMomentumByDateRange,
    getAllMomentum,
    getWeights,
    getMarketDataBySymbol,
    getQuotes,
}
