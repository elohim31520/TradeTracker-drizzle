import { Request, Response, NextFunction } from 'express';
import redisClient from '../modules/redis';
import logger from '../modules/logger';

const redisConditionalCache = (
    expirationTime: number,
    condition: (req: Request) => boolean
) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        if (process.env.DISABLE_REDIS === 'true' || req.method !== 'GET' || !condition(req)) {
            return next();
        }

        if (!redisClient?.isReady) return next();

        const cacheKey = `cache:${req.originalUrl || req.url}`;

        try {
            const cachedData = await redisClient.get(cacheKey);
            if (cachedData) {
                logger.info(`[Cache] Hit: ${cacheKey}`);
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('X-Cache', 'HIT');
                res.send(cachedData);
                return;
            }

            const originalJson = res.json;

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
            logger.error(`[Cache] Middleware Error: ${error}`);
            next();
        }
    };
};

export default redisConditionalCache;