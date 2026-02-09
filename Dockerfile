# --- Stage 1: Build the application ---
    FROM node:22-alpine AS builder

    WORKDIR /app
    
    # 利用快取安裝依賴
    COPY package*.json ./
    RUN npm ci
    
    # 複製所有檔案並執行 TypeScript 編譯
    COPY . .
    RUN npm run build
    
    # --- Stage 2: Create the production image ---
    FROM node:22-alpine
    
    # 安裝必要套件：openssl (資料庫連線與加密所需)
    RUN apk add --no-cache openssl
    
    # 時區維持預設 (UTC)
    
    WORKDIR /app
    
    # 只安裝生產環境需要的套件
    COPY package*.json ./
    RUN npm ci --omit=dev
    
    # 從 builder 階段複製編譯後的程式碼
    COPY --from=builder /app/dist ./dist
    COPY --from=builder /app/drizzle ./drizzle
    COPY --from=builder /app/drizzle.config.ts ./
    
    # 修正路徑：從 builder 複製 drizzle 資料夾到運行目錄
    COPY --from=builder /app/drizzle ./drizzle
    
    # 複製啟動腳本與密鑰工具
    COPY generateKeyPairSync.js ./
    COPY entrypoint.sh ./
    
    # 賦予 entrypoint 執行權限
    RUN chmod +x ./entrypoint.sh
    
    # 使用非 root 用戶執行，提升安全性
    USER node
    
    EXPOSE 3000
    
    # 透過 entrypoint 腳本啟動環境
    ENTRYPOINT ["./entrypoint.sh"]
    
    # 預設啟動指令
    CMD ["node", "dist/index.js"]