import { Request, Response, NextFunction } from 'express';
import _ from 'lodash';
import companyMetricsService from '../services/companyMetrics';
import { success } from '../modules/responseHelper';

interface GetBySymbolParams {
    symbol: string;
}

interface GetBySymbolQuery {
    days?: string;
}

async function getBySymbol(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const params = req.params as unknown as GetBySymbolParams;
        const query = req.query as unknown as GetBySymbolQuery;

        const symbol = _.upperCase(_.get(params, 'symbol', ''));
        const days = query.days ? parseInt(query.days, 10) : undefined;

        const data = await companyMetricsService.getBySymbol(symbol, days);

        res.json(success(data));
    } catch (error) {
        next(error);
    }
}

export default {
    getBySymbol
};