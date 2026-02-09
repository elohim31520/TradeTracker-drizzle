// src/db/migrate.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'path';

const runMigration = async () => {
  // 建立連線，並設定只用 1 個連線來跑遷移 (安全性考量)
  const migrationClient = postgres(process.env.DATABASE_URL as string, { max: 1 });
  const db = drizzle(migrationClient);

  console.log('⏳ 正在執行資料庫遷移...');

  await migrate(db, {
    // 指向你 COPY 到 Docker 裡的那個 migrations 資料夾
    migrationsFolder: path.join(__dirname, '../../migrations'),
  });

  console.log('✅ 遷移完成！');
  
  await migrationClient.end();
};

runMigration().catch((err) => {
  console.error('❌ 遷移失敗！', err);
  process.exit(1);
});