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
    } catch (err) {
      retries -= 1;
      console.warn(`⚠️ 遷移連線失敗，剩餘重試次數: ${retries}`);
      if (retries === 0) throw err;
      await new Promise(res => setTimeout(res, 3000)); // 等 3 秒再試
    }
  }
};

runMigration().catch((err) => {
  console.error('❌ 遷移失敗！', err);
  process.exit(1);
});