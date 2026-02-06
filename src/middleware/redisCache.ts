import { Request, Response, NextFunction } from 'express';
import redisClient from '../modules/redis';
import logger from '../modules/logger';
import { DEFAULT_CACHE_TIME } from '../constant/cache';

const redisCache = (expirationTime: number = DEFAULT_CACHE_TIME) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        if (req.method !== 'GET') {
            return next();
        }

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
            const cachedBody = await redisClient.get(cacheKey);

            if (cachedBody) {
                logger.info(`[Cache] Hit: ${cacheKey}`);
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('X-Cache-Status', 'HIT'); 
                res.send(cachedBody); 
                return;
            }

            logger.info(`[Cache] Miss: ${cacheKey}, 重新緩存...`);

            const originalJson = res.json.bind(res);

            res.json = function (body: any): Response {
                if (body && body.success === true) {
                    const bodyString = JSON.stringify(body);
                    
                    redisClient.set(cacheKey, bodyString, {
                        EX: expirationTime,
                    })
                    .catch((err) => logger.error(`[Cache] Redis Set 失敗: ${cacheKey}`, err));
                }

                return originalJson.call(this, body);
            };

            next();
        } catch (error) {
            logger.error('[Cache] Middleware unexpected error:', error);
            next();
        }
    };
};

export default redisCache;