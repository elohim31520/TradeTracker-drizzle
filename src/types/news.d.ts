import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { news } from './schema';

export type News = InferSelectModel<typeof news>;
export type NewNews = InferInsertModel<typeof news>;