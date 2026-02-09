// src/db/migrate.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'path';

const runMigration = async () => {
  const connectionString = process.env.PG_URL || process.env.DATABASE_URL;
  let retries = 5;

  while (retries > 0) {
    try {
      const migrationClient = postgres(connectionString as string, { max: 1 });
      const db = drizzle(migrationClient);

      console.log('⏳ 正在執行資料庫遷移...');
      await migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });

      console.log('✅ 遷移完成！');
      await migrationClient.end();
      break; // 成功後跳出迴圈
    } catch (err: any) {
      // 42710 是 PostgreSQL "type_already_exists" 的錯誤代碼
      // 42P07 是 "relation_already_exists" (資料表已存在) 的錯誤代碼
      if (err.code === '42710' || err.code === '42P07') {
        console.warn(`⚠️ 偵測到資料結構已存在，跳過重複建立: ${err.message}`);
      } else {
        console.error('❌ 遷移失敗！', err);
        process.exit(1);
      }
    }
  }
};

runMigration().catch((err) => {
  console.error('❌ 遷移失敗！', err);
  process.exit(1);
});