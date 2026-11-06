#!/bin/bash
# 備份 Cloud SQL (PostgreSQL) 並上傳到 GCS
#
# 需求：主機有 docker 與 gcloud；.env 內有 PG_URL、GCS_BUCKET
# 資料庫已改由 Cloud SQL 託管，不再有 my-postgres 容器，
# 因此改用一次性的 pg_dump 容器直接連 PG_URL，主機不需要安裝 postgresql-client。

set -u
set -o pipefail

# 獲取腳本所在目錄的絕對路徑
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 設定備份目錄
BACKUP_DIR="$SCRIPT_DIR/backup"

# pg_dump 的主版本必須 >= Cloud SQL 的 PostgreSQL 主版本；
# 若 Cloud SQL 升版，用環境變數覆寫，例如 PG_DUMP_IMAGE=postgres:19-alpine ./backup.sh
PG_DUMP_IMAGE="${PG_DUMP_IMAGE:-postgres:18-alpine}"

# --- 1. 自動讀取 .env ---
ENV_FILE="$SCRIPT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
    set -a
    # tr -d '\r'：.env 若是 CRLF（Windows/部分編輯器），值尾端會多一個 \r 讓 gcloud 與 pg_dump 失敗
    # 用 eval 而非 source <(...)：macOS 內建的 bash 3.2 對 process substitution 的 source 會靜默失敗
    eval "$(tr -d '\r' < "$ENV_FILE")"
    set +a
    echo "✅ 已載入配置: $ENV_FILE"
else
    echo "❌ 錯誤: 找不到 .env 檔案於 $ENV_FILE"
    exit 1
fi

# --- 2. 檢查必要變數 ---
: "${PG_URL:?需在 .env 設定 PG_URL (Cloud SQL 連線字串)}"
: "${GCS_BUCKET:?需在 .env 設定 GCS_BUCKET}"

# 從 PG_URL 取出資料庫名稱（去掉 ?sslmode=... 等參數），只用在檔名
DB_NAME_FROM_URL="${PG_URL##*/}"
DB_NAME_FROM_URL="${DB_NAME_FROM_URL%%\?*}"

# 設定時間與檔名
DATE=$(date +%Y%m%d_%H%M%S)
FILE_NAME="backup_${DB_NAME_FROM_URL}_${DATE}.dump"

# 建立備份目錄
mkdir -p "$BACKUP_DIR"

# --- 3. 執行 PostgreSQL 備份 ---
echo "🐘 正在從 Cloud SQL 備份資料庫 (Custom 格式): $DB_NAME_FROM_URL ..."

# -e PG_URL 只傳變數名稱，不把密碼放在 docker 的命令列參數裡
# 不加 -t，避免 tty 污染二進位輸出
# -F c 為 custom 格式；--clean/--if-exists 留到還原時再決定
docker run --rm -e PG_URL "$PG_DUMP_IMAGE" \
  sh -c 'pg_dump "$PG_URL" -F c --no-owner --no-privileges' \
  > "$BACKUP_DIR/$FILE_NAME"
DUMP_STATUS=$?

# 失敗或檔案為空都視為失敗，並移除殘留檔案，避免之後把空檔案當成備份上傳
if [ "$DUMP_STATUS" -ne 0 ] || [ ! -s "$BACKUP_DIR/$FILE_NAME" ]; then
    rm -f "$BACKUP_DIR/$FILE_NAME"
    echo "❌ 備份失敗，請檢查 PG_URL、Cloud SQL 的 Authorized networks（需包含這台 VM 的外部 IP）與 pg_dump 版本 ($PG_DUMP_IMAGE)"
    exit 1
fi
echo "✅ 本地備份完成: $BACKUP_DIR/$FILE_NAME"

# --- 4. 上傳至 GCS ---
echo "☁️ 正在上傳至 $GCS_BUCKET ..."
if gcloud storage cp "$BACKUP_DIR/$FILE_NAME" "${GCS_BUCKET%/}/"; then
    echo "🚀 GCS 上傳成功！"
else
    echo "❌ 上傳失敗，請檢查 gcloud 權限（VM 的 service account 與 access scope）或 Bucket 路徑"
    exit 1
fi

# --- 5. 清理 VM 本地舊檔案 (保留 7 天) ---
echo "🧹 清理舊檔案..."
find "$BACKUP_DIR" -type f -mtime +7 -name "*.dump" -exec rm {} \;
echo "✨ 備份程序執行完畢。"
