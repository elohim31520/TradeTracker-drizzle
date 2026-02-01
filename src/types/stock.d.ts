import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { stockPrices } from '../db/schema';

export type StockPrice = InferSelectModel<typeof stockPrices>;