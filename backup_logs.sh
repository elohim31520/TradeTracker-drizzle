#!/bin/bash

# --- 1. 設定路徑 ---
# 改用更相容的寫法獲取腳本目錄
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
LOG_DIR="${SCRIPT_DIR}/logs"
ENV_FILE="${SCRIPT_DIR}/.env"
RETENTION_DAYS=7

echo "=========================================="
echo "執行時間: $(date)"

# --- 2. 載入 .env 環境變數 ---
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
    echo "成功載入 .env 變數"
else
    echo "錯誤: 找不到 .env 檔案於 $ENV_FILE"
    exit 1
fi

# 檢查變數
if [ -z "$GCS_BUCKET_LOGS_NAME" ]; then
    echo "錯誤: .env 中未設定 GCS_BUCKET_LOGS_NAME"
    exit 1
fi

# 確保 LOG_DIR 存在
if [ ! -d "$LOG_DIR" ]; then
    echo "錯誤: 找不到 Log 目錄: $LOG_DIR"
    exit 1
fi

GCS_DEST="gs://${GCS_BUCKET_LOGS_NAME}"

# --- 3. 使用 gcloud storage 進行備份 ---
echo "正在備份到 GCS: ${GCS_DEST}..."

# 執行 rsync
gcloud storage rsync "$LOG_DIR" "$GCS_DEST" --recursive

# 檢查上一個指令是否成功
if [ $? -eq 0 ]; then
    echo "備份成功！"
else
    echo "備份失敗，請檢查 GCP 權限。"
    exit 1
fi

# --- 4. 清理本地舊檔案 ---
echo "正在刪除本地超過 ${RETENTION_DAYS} 天的舊 Log..."
find "$LOG_DIR" -type f -mtime +$RETENTION_DAYS -name "application-*.log*" -exec rm -v {} \;

echo "任務完成！"
echo "=========================================="