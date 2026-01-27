import { Request, Response, NextFunction } from 'express';


const redisCache = (expirationTime: number) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        next();
    };
};

export default redisCache;