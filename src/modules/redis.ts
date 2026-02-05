import { createClient, RedisClientType } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// 建立實例
const redisClient: RedisClientType = createClient({
    url: REDIS_URL,
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                console.error('Redis 重連次數過多，停止重連');
                return new Error('Redis connection lost');
            }
            // 每次重連延遲增加 (指數退避)
            return Math.min(retries * 100, 3000);
        },
        connectTimeout: 10000, // 10秒連線逾時
    }
});

redisClient.on('error', (err: any) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Redis 連線中...'));
redisClient.on('ready', () => console.log('Redis 連線成功且已準備就緒'));
redisClient.on('reconnecting', () => console.warn('Redis 正在嘗試重連...'));
redisClient.on('end', () => console.log('Redis 連線已斷開'));

export const connectRedis = async () => {
    if (!redisClient.isOpen) {
        await redisClient.connect();
    }
};

const gracefulShutdown = async () => {
    if (redisClient.isOpen) {
        await redisClient.quit();
        console.log('Redis 連線已安全關閉');
    }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export default redisClient;