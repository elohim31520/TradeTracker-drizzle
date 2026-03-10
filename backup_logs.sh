#!/bin/bash

# --- 1. 設定路徑 ---
# 使用最保險的方式獲取腳本絕對路徑
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
LOG_DIR="${SCRIPT_DIR}/logs"
ENV_FILE="${SCRIPT_DIR}/.env"
RETENTION_DAYS=7

echo "=========================================="
echo "執行時間: $(date)"

# --- 2. 載入 .env 環境變數 ---
if [ -f "$ENV_FILE" ]; then
    # 使用與資料庫腳本相同的載入邏輯
    set -a
    source "$ENV_FILE"
    set +a
    echo "✅ 成功載入 .env 變數"
else
    echo "❌ 錯誤: 找不到 .env 檔案於 $ENV_FILE"
    exit 1
fi

# 檢查 Bucket 名稱變數是否為空
if [ -z "$GCS_BUCKET_LOGS_NAME" ]; then
    echo "❌ 錯誤: .env 中未設定 GCS_BUCKET_LOGS_NAME"
    exit 1
fi

# 確保本地 Log 目錄存在
if [ ! -d "$LOG_DIR" ]; then
    echo "⚠️ 警告: 找不到 Log 目錄: $LOG_DIR，嘗試建立它..."
    mkdir -p "$LOG_DIR"
fi

# 組合 GCS 路徑 (確保變數兩旁有引號包圍，避免空格或特殊字元)
GCS_DEST="gs://${GCS_BUCKET_LOGS_NAME}"

# --- 3. 使用 gcloud storage 進行備份 ---
echo "☁️ 正在同步 Log 到 GCS: ${GCS_DEST} ..."

# 使用 rsync 同步。如果還是報權限錯誤，可以考慮暫時改成 cp -r
gcloud storage rsync "$LOG_DIR" "$GCS_DEST" --recursive

# 檢查上一個指令 (rsync) 的執行結果
if [ $? -eq 0 ]; then
    echo "🚀 Log 備份成功！"
else
    echo "❌ 備份失敗，請檢查 GCP 權限設定 (IAM & Scopes)。"
    exit 1
fi

# --- 4. 清理本地舊檔案 (保留 7 天) ---
echo "🧹 正在清理本地超過 ${RETENTION_DAYS} 天的舊 Log..."
# 加上 -name "*.log*" 確保不會誤刪其他重要檔案
find "$LOG_DIR" -type f -mtime +$RETENTION_DAYS -name "application-*.log*" -exec rm -v {} \;

echo "✨ 任務完成！"
echo "=========================================="