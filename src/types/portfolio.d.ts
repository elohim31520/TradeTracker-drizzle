import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { portfolios, companies } from './schema';

type Company = InferSelectModel<typeof companies>;

export type Portfolio = InferSelectModel<typeof portfolios>;

export type NewPortfolioDB = InferInsertModel<typeof portfolios>;

export interface NewPortfolio {
    stockSymbol: string;
    quantity?: number;
    averagePrice?: number;
}

// 查询返回的 company 类型
type CompanyInfo = {
    name: string | null;
    symbol: string | null;
} | null;

export interface PortfolioWithCompany extends Portfolio {
    company: CompanyInfo;
    stockSymbol: string;
}
