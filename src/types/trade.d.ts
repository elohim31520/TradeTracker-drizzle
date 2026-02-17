import { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { stockTrades, companies } from '../db/schema';

// 推斷出來的類型
export type Trade = InferSelectModel<typeof stockTrades>;
export type NewTrade = InferInsertModel<typeof stockTrades>;
export type TradeUpdate = Partial<NewTrade>;
export type Company = InferSelectModel<typeof companies>;
export type NewCompany = InferInsertModel<typeof companies>;

// 用於查詢的接口
export interface GetAllTradesParams {
  userId: string;
  page: number;
  size: number;
}

// 用於返回的交易數據結構
export interface TradeWithCompany {
  id: number;
  companyId: number;
  quantity: string; // 在 Node.js 和資料庫（如 PostgreSQL）的互動中，numeric 通常會被當作 string 處理。
  price: string;
  type: 'buy' | 'sell';
  date: string;
  stockSymbol: string;
  company?: {
    name: string;
    symbol: string;
  } | null;
}

// 分頁響應
export interface PaginatedTrades {
  data: TradeWithCompany[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}
