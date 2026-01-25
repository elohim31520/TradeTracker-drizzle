import { pgTable, serial, text, varchar, integer, numeric, timestamp, pgEnum, uuid, bigserial, index, date, decimal } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { relations } from 'drizzle-orm';
export const orderStatusEnum = pgEnum('order_status', ['pending', 'paid', 'shipped', 'completed', 'cancelled']);

// 1. 使用者表
export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  name: text('name').notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }) //不設定notNull 因為會有第三方登入
});

export const userThirdpartyAccounts = pgTable('user_thirdparty_accounts', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 50 }).notNull(),
  providerUserId: text('provider_user_id').notNull(),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  picture: text('picture'),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const userThirdpartyAccountsRelations = relations(userThirdpartyAccounts, ({ one }) => ({
  user: one(users, {
    fields: [userThirdpartyAccounts.userId],
    references: [users.id],
  }),
}));

export const stockTradeTypeEnum = pgEnum('stock_trade_type', ['buy', 'sell']);

// 公司表
export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  symbol: varchar('symbol', { length: 10 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 交易表
export const stockTrades = pgTable('stock_trades', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  companyId: integer('company_id').notNull().references(() => companies.id),
  tradeType: stockTradeTypeEnum('trade_type').notNull(),
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  tradeDate: date('trade_date', { mode: 'string' }).defaultNow().notNull(),
}, (table) => {
  return {
    // 增加索引大幅提升 API 查詢速度
    userIdIdx: index('user_id_idx').on(table.userId),
    companyIdIdx: index('company_id_idx').on(table.companyId),
    tradeDateIdx: index('trade_date_idx').on(table.tradeDate),
  }
})

export const stockTradesRelations = relations(stockTrades, ({ one }) => ({
  company: one(companies, {
    fields: [stockTrades.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [stockTrades.userId],
    references: [users.id],
  }),
}));

export const companiesRelations = relations(companies, ({ many }) => ({
  trades: many(stockTrades),
  metrics: many(companyMetrics),
}));

export const companyMetrics = pgTable('company_metrics', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),

  // 價格與估值
  price: decimal('price', { precision: 15, scale: 2 }),
  peTrailing: decimal('pe_trailing', { precision: 10, scale: 2 }),
  peForward: decimal('pe_forward', { precision: 10, scale: 2 }),
  epsTrailing: decimal('eps_trailing', { precision: 10, scale: 2 }),
  epsForward: decimal('eps_forward', { precision: 10, scale: 2 }),

  // 成交量與市值
  volume: integer('volume'),
  marketCap: varchar('market_cap', { length: 32 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()),
});

export const companyMetricsRelations = relations(companyMetrics, ({ one }) => ({
  company: one(companies, {
    fields: [companyMetrics.companyId],
    references: [companies.id],
  }),
}));