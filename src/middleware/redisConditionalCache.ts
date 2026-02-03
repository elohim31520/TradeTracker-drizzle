import { Request, Response, NextFunction } from 'express';

const redisConditionalCache = (ttl: number, condition: (req: Request) => boolean) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        next();
    };
};

export default redisConditionalCache;