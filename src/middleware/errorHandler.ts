import { Request, Response, NextFunction } from 'express';
import { AppError, AuthError, ClientError, ConflictError } from '../modules/errors';
import errorCodes from '../constant/errorCodes';
import { DrizzleError } from 'drizzle-orm';

// 定義 Handler 的介面
interface ErrorMatcher {
    matches: (err: any) => boolean;
    handle: (err: any, res: Response) => void;
}

const errorHandlers: ErrorMatcher[] = [
    {
        matches: (err) => err instanceof AuthError,
        handle: (err, res) => {
            res.status(401).json({ success: false, code: 401, message: err.message });
        },
    },
    {
        matches: (err) => err instanceof ClientError,
        handle: (err, res) => {
            res.status(400).json({ success: false, code: 400, message: err.message });
        },
    },
    {
        matches: (err) => err instanceof AppError,
        handle: (err: AppError, res) => {
            res.status(err.statusCode).json({ success: false, code: err.statusCode, message: err.message });
        },
    },
    {
        matches: (err) => err instanceof DrizzleError,
        handle: (err, res) => {
            res.status(500).json({ 
                success: false, 
                code: 500, 
                message: "資料庫操作異常 (ORM Error)",
                detail: process.env.NODE_ENV === 'development' ? err.message : undefined
            });
        },
    },
    
    // --- Drizzle / Postgres 專屬處理 ---
    {
        // Postgres 唯一約束衝突，錯誤碼通常是 '23505'
        matches: (err) => err.code === '23505' || err.message?.includes('unique constraint'),
        handle: (err, res) => {
            res.status(409).json({ 
                success: false, 
                code: errorCodes.DUPLICATE_ACCOUNT.code, 
                message: "資料已存在" 
            });
        },
    },
    {
        // Postgres 外鍵約束失敗
        matches: (err) => err.code === '23503',
        handle: (err, res) => {
            res.status(400).json({ 
                success: false, 
                code: 400, 
                message: "關聯資料不存在或仍在使用中" 
            });
        },
    },
    {
        // 處理 Drizzle 資料型態錯誤 (例如 UUID 格式不對)
        matches: (err) => err.message?.includes('invalid input syntax for type uuid'),
        handle: (err, res) => {
            res.status(400).json({ success: false, code: 400, message: "無效的 ID 格式" });
        },
    }
];

const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('🔥 [Fatal] Unhandled Error:', err);
    console.error('💥 Error Caught:', {
        name: err.name,
        message: err.message,
        code: err.code,
        path: req.path,
    });

    if (res.headersSent) {
        return next(err);
    }

    // 3. 尋找匹配的處理器
    for (const handler of errorHandlers) {
        if (handler.matches(err)) {
            return handler.handle(err, res);
        }
    }

    // 4. 未預期的錯誤 (預設 500)
    res.status(500).json({
        success: false,
        code: errorCodes.SERVER_ERROR.code,
        message: "伺服器內部錯誤"
    });
};

export default errorHandler;