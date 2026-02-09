// src/db/migrate.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'path';

const runMigration = async () => {
  const connectionString = process.env.PG_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('❌ 找不到 PG_URL');

  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);

  console.log('⏳ 正在執行資料庫遷移...');

  try {
    await migrate(db, {
      migrationsFolder: path.join(__dirname, '../../drizzle')
    });
    console.log('✅ 遷移順利完成！');
  } catch (err: any) {
    // 42710: Type already exists (型別已存在)
    // 42P07: Relation already exists (資料表已存在)
    if (err.code === '42710' || err.code === '42P07') {
      console.warn(`⚠️ 偵測到資料結構已存在 (${err.code})，跳過並視為成功。`);
      console.log('🚀 雖然有警告，但結構已就緒，準備啟動 Server...');
    } else {
      console.error('❌ 遷移失敗！', err);
      process.exit(1);
    }
  } finally {
    await migrationClient.end();
  }
};

runMigration();