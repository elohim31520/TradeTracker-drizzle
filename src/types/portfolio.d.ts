import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { portfolios, companies } from './schema';

type Company = InferSelectModel<typeof companies>;

export type Portfolio = InferSelectModel<typeof portfolios>;

export type NewPortfolio = InferInsertModel<typeof portfolios>;

export interface PortfolioWithCompany extends Portfolio {
    company?: Pick<Company, 'name' | 'symbol'> | null;
    stock_id?: string;
}
