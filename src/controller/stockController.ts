import stockService from '../services/stockService'
import _ from 'lodash'
import { success } from '../modules/responseHelper'
import { Request, Response, NextFunction } from 'express'

class StockController {
	async getStockSymbol(req: Request, res: Response, next: NextFunction) {
		try {
			const data = await stockService.getStockSymbol()
			res.json(success(data))
		} catch (error) {
			next(error)
		}
	}

	async getMarketBreadth(req: Request, res: Response, next: NextFunction) {
		try {
			const data = await stockService.getMarketBreadth()
			res.json(success(data))
		} catch (error) {
			next(error)
		}
	}

	async getTodayStocks(req: Request, res: Response, next: NextFunction) {
		try {
			const data = await stockService.getStockDayChgSorted()
			res.json(success(data))
		} catch (error) {
			next(error)
		}
	}
}

export default new StockController()
