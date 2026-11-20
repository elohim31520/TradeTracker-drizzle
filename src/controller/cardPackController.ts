import { Request, Response, NextFunction } from 'express';
import cardPackService from '../services/cardPackService';
import { success } from '../modules/responseHelper';

async function getToday(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        res.json(success(await cardPackService.getToday()));
    } catch (error) {
        next(error);
    }
}

async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // 每個人的內容不同，不能被中間的快取共用
        res.set('Cache-Control', 'no-store');
        res.json(success(await cardPackService.getMe(req.user!.id)));
    } catch (error) {
        next(error);
    }
}

async function draw(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(success(await cardPackService.draw(req.user!.id)));
    } catch (error) {
        next(error);
    }
}

/** 開發用：重設自己的次數與紀錄；路由只在非 production 註冊 */
async function devReset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        await cardPackService.resetUser(req.user!.id);
        res.json(success(null));
    } catch (error) {
        next(error);
    }
}

export default { getToday, getMe, draw, devReset };
