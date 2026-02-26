import stockService from '../services/stockService'
import { success } from '../modules/responseHelper'
import { Request, Response, NextFunction } from 'express'

async function getStockSymbol(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const data = await stockService.getStockSymbol()
		res.json(success(data))
	} catch (error) {
		next(error)
	}
}

async function getMarketBreadth(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const data = await stockService.getMarketBreadth()
		res.json(success(data))
	} catch (error) {
		next(error)
	}
}

async function getTodayStocks(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const data = await stockService.getStockDayChgSorted()
		res.json(success(data))
	} catch (error) {
		next(error)
	}
}

export default {
	getStockSymbol,
	getMarketBreadth,
	getTodayStocks
}