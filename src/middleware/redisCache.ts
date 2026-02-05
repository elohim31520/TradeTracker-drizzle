import { Request, Response, NextFunction } from 'express';
import { RedisClientType } from 'redis';
import redisClient from '../modules/redis';
import { success } from '../modules/responseHelper';
import logger from '../modules/logger';
import { DEFAULT_CACHE_TIME } from '../constant/cache';

interface ApiResponse {
    code: number | string;
    data: any;
    message?: string;
}

const redisCache = (expirationTime: number = DEFAULT_CACHE_TIME) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        // 1. 安全檢查：只快取 GET 請求
        if (req.method !== 'GET') {
            return next();
        }

        // 2. 環境與連線狀態檢查
        const disableReis = process.env.DISABLE_REDIS === 'true';
        if (disableReis) {
            logger.debug(`[DISABLE_REDIS] 強制跳過 refis cache: ${req.originalUrl}`);
            return next();
        }

        if (!redisClient?.isReady) {
            logger.warn('[Cache] Redis client is not ready, bypassing cache');
            return next();
        }

        const cacheKey = req.originalUrl;

        try {
            // 3. 嘗試取得快取
            const cachedData = await redisClient.get(cacheKey);

            if (cachedData) {
                logger.info(`[Cache] Hit: ${cacheKey}`);
                try {
                    const parsedData = JSON.parse(cachedData);
                    res.json(success(parsedData));
                    return;
                } catch (parseError) {
                    logger.error(`[Cache] Parse error for key ${cacheKey}:`, parseError);
                    await redisClient.del(cacheKey);
                }
            }

            logger.info(`[Cache] Miss: ${cacheKey}, 重新緩存...`);

            // 4. 攔截 res.json 並自動寫入快取
            const originalJson = res.json.bind(res);

            // 重新定義 res.json 的行為
            res.json = (body: ApiResponse): Response => {
                // 檢查是否為成功的回應碼 (200 系列)
                const isSuccess = [200, 201, 202, 204, 206].includes(Number(body.code));

                if (isSuccess && body.data !== undefined) {
                    // 非同步寫入 Redis，不阻塞回應過程
                    redisClient
                        .set(cacheKey, JSON.stringify(body.data), {
                            EX: expirationTime,
                        })
                        .then(() => logger.info(`[Cache] Successfully set cache for: ${cacheKey}`))
                        .catch((err) => logger.error(`[Cache] Storage error for ${cacheKey}:`, err));
                }

                return originalJson(body);
            };

            next();
        } catch (error) {
            logger.error('[Cache] Middleware unexpected error:', error);
            next();
        }
    };
};

export default redisCache;