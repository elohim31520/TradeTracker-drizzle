#!/bin/bash

# 獲取腳本所在目錄的絕對路徑
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 設定容器名稱 (對應你的 docker-compose container_name)
CONTAINER_NAME="my-postgres"

# 設定備份目錄
BACKUP_DIR="$SCRIPT_DIR/backup"

# --- 2. 自動讀取 .env ---
ENV_FILE="$SCRIPT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
    echo "✅ 已載入配置: $ENV_FILE"
else
    echo "❌ 錯誤: 找不到 .env 檔案於 $ENV_FILE"
    exit 1
fi

# --- 3. 檢查必要變數 ---
# 根據你的 .env 與 docker-compose 邏輯：
# 使用 postgres 作為預設用戶，或從環境變數讀取
DB_USER="postgres" 
: "${DB_NAME:?需在 .env 設定 DB_NAME}"
: "${DB_PASSWORD:?需在 .env 設定 DB_PASSWORD}"
: "${GCS_BUCKET:?需在 .env 設定 GCS_BUCKET}"

# 設定時間與檔名
DATE=$(date +%Y%m%d_%H%M%S)
FILE_NAME="backup_${DB_NAME}_${DATE}.sql.gz"

# 建立備份目錄
mkdir -p "$BACKUP_DIR"

# --- 4. 執行 PostgreSQL 備份 ---
echo "🐘 正在從容器 [$CONTAINER_NAME] 備份資料庫: $DB_NAME ..."

# 使用 pg_dump 並透過環境變數傳遞密碼避免互動式輸入
# 輸出的資料會直接透過管線壓縮
docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER_NAME" \
  pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_DIR/$FILE_NAME"

# 檢查備份是否成功
if [ $? -eq 0 ]; then
    echo "✅ 本地備份完成: $BACKUP_DIR/$FILE_NAME"
else
    echo "❌ 備份失敗，請檢查容器狀態、資料庫名稱或密碼"
    exit 1
fi

# --- 5. 上傳至 GCS ---
echo "☁️ 正在上傳至 $GCS_BUCKET ..."
gcloud storage cp "$BACKUP_DIR/$FILE_NAME" "$GCS_BUCKET/"

if [ $? -eq 0 ]; then
    echo "🚀 GCS 上傳成功！"
else
    echo "❌ 上傳失敗，請檢查 gcloud 權限或 Bucket 路徑"
    exit 1
fi

# --- 6. 清理 VM 本地舊檔案 (保留 7 天) ---
echo "🧹 清理舊檔案..."
find "$BACKUP_DIR" -type f -mtime +7 -name "*.sql.gz" -exec rm {} \;
echo "✨ 備份程序執行完畢。"