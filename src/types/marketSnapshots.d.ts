import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { priceSnapshots } from '../db/schema';

export type PriceSnapshots = InferSelectModel<typeof priceSnapshots>;
export type NewPriceSnapshots = InferInsertModel<typeof priceSnapshots>;

export interface DateRangeMarketData {
    symbol: string;
    price: string | number;
    change: string | number;
    createdAt: string; // 這是格式化後的 hourGroup
}

export interface GetMarketDataParams {
    symbol: string;
    page: number;
    size: number;
}

export interface MarketDataRow {
    symbol: string;
    price: string | number;
    createdAt: string;
}

export interface StandardizedItem extends MarketDataRow {
    volume: number;
}

export interface ConsolidatedPoint {
    createdAt: string;
    btc: number;
    usoil: number;
    dxy: number;
    us10y: number;
}

export interface MomentumResult {
    ct: string;
    v: number;
}