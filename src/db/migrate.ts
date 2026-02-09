// src/db/migrate.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'path';

const runMigration = async () => {
  const connectionString = process.env.PG_URL

  if (!connectionString) {
    throw new Error('❌ 找不到資料庫連線字串 (PG_URL)');
  }

  const migrationClient = postgres(connectionString as string, { max: 1 });
  const db = drizzle(migrationClient);

  console.log('⏳ 正在執行資料庫遷移...');

  try {
    await migrate(db, {
      // 在 Docker 中，檔案路徑是 /app/dist/db/migrate.js
      // ../../drizzle 會指向 /app/drizzle
      migrationsFolder: path.join(__dirname, '../../drizzle'),
    });
    console.log('✅ 遷移完成！');
  } catch (err) {
    throw err;
  } finally {
    await migrationClient.end();
  }
};

runMigration().catch((err) => {
  console.error('❌ 遷移失敗！', err);
  process.exit(1);
});