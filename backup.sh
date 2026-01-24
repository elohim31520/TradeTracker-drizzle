#!/bin/bash

# --- 1. 設定固定變數 ---
# 獲取腳本所在目錄的絕對路徑
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 設定容器名稱為 mysql
CONTAINER_NAME="mysql"

# 設定備份目錄為當前目錄下的 backup/
BACKUP_DIR="$SCRIPT_DIR/backup"

# --- 2. 自動讀取 .env ---
ENV_FILE="$SCRIPT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
    echo "已載入配置: $ENV_FILE"
else
    echo "❌ 錯誤: 找不到 .env 檔案於 $ENV_FILE"
    exit 1
fi

# --- 3. 檢查必要變數 (確保從 .env 讀取成功) ---
# 註：GCS_BUCKET 若沒在 .env 中，請手動補上
: "${DB_NAME:?需在 .env 設定 DB_NAME}"
: "${DB_USER:?需在 .env 設定 DB_USER}"
: "${DB_PASSWORD:?需在 .env 設定 DB_PASSWORD}"
: "${GCS_BUCKET:?需在 .env 設定 GCS_BUCKET}"

# 設定時間與檔名
DATE=$(date +%Y%m%d_%H%M%S)
FILE_NAME="backup_${DB_NAME}_${DATE}.sql.gz"

# 建立備份目錄
mkdir -p "$BACKUP_DIR"

# --- 4. 執行備份 ---
echo "正在從容器 [$CONTAINER_NAME] 備份資料庫: $DB_NAME ..."

# 執行 mysqldump 並直接壓縮
docker exec "$CONTAINER_NAME" /usr/bin/mysqldump -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" | gzip > "$BACKUP_DIR/$FILE_NAME"

# 檢查備份是否成功
if [ $? -eq 0 ]; then
    echo "✅ 本地備份完成: $BACKUP_DIR/$FILE_NAME"
else
    echo "❌ 備份失敗，請檢查容器狀態或權限"
    exit 1
fi

# --- 5. 上傳至 GCS ---
echo "正在上傳至 $GCS_BUCKET ..."
/usr/bin/gsutil cp "$BACKUP_DIR/$FILE_NAME" "$GCS_BUCKET/"

if [ $? -eq 0 ]; then
    echo "🚀 上傳成功！"
else
    echo "❌ 上傳失敗，請檢查 gcloud 權限"
    exit 1
fi

# --- 6. 清理 VM 本地舊檔案 (保留 7 天) ---
find "$BACKUP_DIR" -type f -mtime +7 -name "*.sql.gz" -exec rm {} \;
echo "已清理 7 天前的