import { pgTable, serial, text, varchar, integer, numeric, timestamp, pgEnum, uuid, bigserial, index, date, decimal, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { relations } from 'drizzle-orm';
export const orderStatusEnum = pgEnum('order_status', ['pending', 'paid', 'shipped', 'completed', 'cancelled']);

// 使用者表
export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  name: text('name').notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }), //不設定notNull 因為會有第三方登入
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
});

export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
});

export const usersRelations = relations(users, ({ one }) => ({
  admin: one(admins, {
    fields: [users.id],
    references: [admins.userId],
  }),
}));

export const adminsRelations = relations(admins, ({ one }) => ({
  user: one(users, {
    fields: [admins.userId],
    references: [users.id],
  }),
}));

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
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
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
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  symbol: varchar('symbol', { length: 10 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
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
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
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


export const assets = pgTable('assets', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  symbol: varchar('symbol', { length: 10 }).notNull().unique(),
  baseAsset: varchar('base_asset', { length: 255 }),
  quoteAsset: varchar('quote_asset', { length: 255 }),
  decimalPlaces: integer('decimal_places').default(2),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
});

export const priceSnapshots = pgTable('price_snapshots', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),

  // 1. 改用 decimal 確保價格精確
  price: decimal('price', { precision: 20, scale: 6 }).notNull(),
  // 漲跌幅通常百分比也很適合用 decimal
  change: decimal('change', { precision: 10, scale: 4 }),
  assetId: integer('asset_id').references(() => assets.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- 定義兩者之間的關聯 ---
export const assetsRelations = relations(assets, ({ many }) => ({
  snapshots: many(priceSnapshots),
}));

export const priceSnapshotsRelations = relations(priceSnapshots, ({ one }) => ({
  asset: one(assets, {
    fields: [priceSnapshots.assetId],
    references: [assets.id],
  }),
}));

export const stockPrices = pgTable('stock_prices', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  price: decimal('price', { precision: 10, scale: 2 }),
  dayChg: decimal('day_chg', { precision: 10, scale: 2 }),
  weight: decimal('weight', { precision: 10, scale: 2 }),
  companyId: integer('company_id').references(() => companies.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const stockPricesRelations = relations(stockPrices, ({ one }) => ({
  company: one(companies, {
    fields: [stockPrices.companyId],
    references: [companies.id],
  }),
}));

export const portfolios = pgTable(
  'portfolios',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    companyId: integer('company_id')
      .notNull()
      .references(() => companies.id),
    quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(),
    averagePrice: decimal('average_price', { precision: 10, scale: 2 }).notNull().default('0.00'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('unique_user_company').on(table.userId, table.companyId),
  ]
);

export const statusEnum = pgEnum('status', ['draft', 'published', 'archived']);

export const news = pgTable('news', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  content: text('content').notNull(),
  contentEn: text('content_en'),
  contentHash: varchar('content_hash', { length: 32 }).notNull().unique(),
  status: statusEnum('status').default('draft').notNull(),
  publishedAt: timestamp('published_at'),
  viewCount: integer('view_count').default(0).notNull(),
  isTop: boolean('is_top').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
});