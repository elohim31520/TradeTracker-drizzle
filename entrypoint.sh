#!/bin/sh
# set -e 表示只要任何指令失敗，腳本就立刻停止，防止帶著錯誤啟動
set -e

SECRETS_DIR="/app/secrets"
PRIVATE_KEY_PATH="$SECRETS_DIR/private.key"
PUBLIC_KEY_PATH="$SECRETS_DIR/public.key"
GENERATOR_SCRIPT_PATH="/app/generateKeyPairSync.js"

# 1. 確保祕密目錄存在
mkdir -p $SECRETS_DIR

# 2. 處理金鑰生成
if [ ! -f "$PRIVATE_KEY_PATH" ]; then
  echo "🔑 Key pair not found. Generating new keys..."
  node $GENERATOR_SCRIPT_PATH "$PRIVATE_KEY_PATH" "$PUBLIC_KEY_PATH"
  # 設定權限，私鑰只有擁有者能讀取，增加安全性
  chmod 600 "$PRIVATE_KEY_PATH"
  echo "✅ New key pair generated."
else
  echo "🔒 Key pair found. Skipping generation."
fi

echo "Database migration starting..."
# 這裡假設你有寫一個 migrate.js 來執行 drizzle-orm 的 migrate 函式
# 或者你也可以直接跑 npx drizzle-kit migrate (前提是有裝 devDeps)
node ./dist/db/migrate.js 

echo "🚀 All systems go! Starting Express server..."

# 4. 執行 CMD 指定的指令 (node ./dist/app.js)
exec "$@"