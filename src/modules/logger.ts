import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const logDir = 'logs';

// 確保日誌目錄存在
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// 定義日誌格式型別 (winston.Logform.Format)
const productionFormat: winston.Logform.Format = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

const developmentFormat: winston.Logform.Format = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(
        ({ timestamp, level, message, stack }) => 
            `${timestamp} ${level}: ${message}${stack ? `\n${stack}` : ''}`
    )
);

// 初始化 Transports 陣列，明確指定型別
const transports: winston.transport[] = [
    new winston.transports.Console({
        format: process.env.NODE_ENV === 'production' ? productionFormat : developmentFormat,
    }),
];

// 在所有環境下都啟用檔案日誌輪替
transports.push(
    new DailyRotateFile({
        level: 'warn',
        filename: path.join(logDir, 'application-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '30d',
        format: productionFormat, // 檔案通常建議使用 JSON 以利後續分析
    })
);

// 建立 Logger 實例
const logger: winston.Logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { service: 'user-service' },
    transports: transports,
});

export default logger;