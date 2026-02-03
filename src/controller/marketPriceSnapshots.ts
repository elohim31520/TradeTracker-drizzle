import { Request, Response, NextFunction } from 'express';
import _ from 'lodash';
import priceSnapshotsService from '../services/marketPriceSnapshots';
import { success } from '../modules/responseHelper';

class MarketIndexController {

    public async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const data = await priceSnapshotsService.getAll();
            res.json(success(data));
        } catch (error) {
            next(error);
        }
    }

    public async getMomentum(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const data = await priceSnapshotsService.getAllMomentum();
            res.json(success(data));
        } catch (error) {
            next(error);
        }
    }

    public async getLastSnapshotBySymbol(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const symbol = (_.get(req, 'params.symbol', '') as string).toUpperCase();
            const data = await priceSnapshotsService.getLastSnapshotBySymbol(symbol);
            res.json(success(data));
        } catch (error) {
            next(error);
        }
    }

    public async getMarketIndicesByDays(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const days = Number(_.get(req, 'params.days'));
            const data = await priceSnapshotsService.getMomentumByDateRange(days);
            res.json(success(data));
        } catch (error) {
            next(error);
        }
    }

    public async getWeights(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const data = await priceSnapshotsService.getWeights();
            res.json(success(data));
        } catch (error) {
            next(error);
        }
    }

    public async getMarketDataBySymbol(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const symbol = (_.get(req, 'params.symbol', '') as string).toUpperCase();
            const page = Number(_.get(req, 'query.page', 1));
            const size = Number(_.get(req, 'query.size', 10));
            const data = await priceSnapshotsService.getMarketDataBySymbol({ symbol, page, size });
            res.json(success(data));
        } catch (error) {
            next(error);
        }
    }

    public async getQuotes(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const data = await priceSnapshotsService.getQuotes();
            res.json(success(data));
        } catch (error) {
            next(error);
        }
    }
}

export default new MarketIndexController();