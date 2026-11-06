import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import 'dotenv/config';

const connectionString = process.env.PG_URL;

if (!connectionString) {
  throw new Error("PG_URL environment variable is required");
}

const client = postgres(connectionString, {
  max: 20,
  onnotice: (notice) => console.log(notice),
});

export const db = drizzle(client, {
  schema,
  // 正式環境不印 SQL：每筆查詢（含參數）都會寫進 Docker 容器日誌，
  // 量大且參數可能含使用者資料；開發 / 測試環境維持開啟
  logger: process.env.NODE_ENV !== 'production'
});