import { Request, Response, NextFunction } from 'express';
import redisClient from '../modules/redis';
import { success } from '../modules/responseHelper'

const checkAiUsageLimit = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    const userId = req.user?.id!;
    const key = `usage:ai_analyze:${userId}`;
    const LIMIT = 10;
    const EXPIRATION = 24 * 60 * 60;

    try {
        const currentUsage = await redisClient.incr(key);

        if (currentUsage === 1) {
            await redisClient.expire(key, EXPIRATION);
        }

        // 檢查是否超過限制
        if (currentUsage > LIMIT) {
            const ttl = await redisClient.ttl(key);
            return res.status(429).json(success({
                remainingTime: ttl // 讓前端知道還要等多久（秒）
            }, '已達 24 小時內的使用次數上限 (10次)',));
        }

        // 通過檢查
        next();
    } catch (error) {
        console.error('Redis 流量限制錯誤:', error);
        // Fail-open: Redis 出錯時選擇放行，避免影響正常用戶使用
        next();
    }
};

export default checkAiUsageLimit;