# Stage 1: Build the application
FROM node:22-alpine AS builder

WORKDIR /app

# 優先複製 package 檔案以利用快取
COPY package*.json ./
RUN npm ci

COPY . .

# 執行編譯 (將 TS 轉為 JS)
RUN npm run build

# ---
# Stage 2: Create the production image
FROM node:22-alpine

# 建議安裝 openssl，因為有些資料庫驅動（如 Prisma 或某些版本的 PG）在 Alpine 上需要它
RUN apk add --no-cache openssl

WORKDIR /app

# 只安裝生產環境需要的套件
COPY package*.json ./
RUN npm ci --omit=dev

# 從 builder 階段複製編譯後的程式碼
COPY --from=builder /app/dist ./dist

# 複製 Drizzle 遷移所需的檔案
COPY --from=builder /app/migrations ./migrations
# 如果你在運行時需要用到 schema 定義（例如某些動態需求），則需要確保它包含在 dist 內

COPY generateKeyPairSync.js ./
COPY entrypoint.sh ./

RUN chmod +x ./entrypoint.sh

# 增加安全設定：不要用 root 執行
USER node

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]

# 建議改用 array 格式
CMD ["node", "dist/index.js"]