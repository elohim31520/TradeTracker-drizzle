#!/bin/bash

# --- 1. 設定路徑 ---
SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
LOG_DIR="${SCRIPT_DIR}/logs"
ENV_FILE="${SCRIPT_DIR}/.env"
RETENTION_DAYS=7

echo "=========================================="
echo "執行時間: $(date)"

# --- 2. 載入 .env 環境變數 ---
if [ -f "$ENV_FILE" ]; then
    # 讀取 .env 並導出變數
    export $(grep -v '^#' "$ENV_FILE" | xargs)
    echo "成功載入 .env 變數"
else
    echo "錯誤: 找不到 .env 檔案於 $ENV_FILE"
    exit 1
fi

# 檢查 Bucket 名稱是否存在
if [ -z "$GCS_BUCKET_LOGS_NAME" ]; then
    echo "錯誤: .env 中未設定 GCS_BUCKET_LOGS_NAME"
    exit 1
fi

GCS_DEST="gs://${GCS_BUCKET_LOGS_NAME}"

# --- 3. 使用 gcloud storage 進行備份 ---
echo "正在備份到 GCS: ${GCS_DEST}..."

# 使用 rsync (比 cp 更聰明，只會上傳新增或修改過的檔案)
# --recursive: 遞迴處理子目錄
gcloud storage rsync "$LOG_DIR" "$GCS_DEST" --recursive

# --- 4. 清理本地舊檔案 (只保留 7 天) ---
echo "正在刪除本地超過 ${RETENTION_DAYS} 天的舊 Log..."
find "$LOG_DIR" -type f -mtime +$RETENTION_DAYS -name "application-*.log*" -exec rm -v {} \;

echo "任務完成！"
echo "=========================================="