import { Request, Response, NextFunction } from 'express'
import portfolioService from '../services/portfolioService'
import _ from 'lodash'
const responseHelper = require('../modules/responseHelper')

class PorfolioController {
	async getAllByUserId(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			const userId = req.user!.id
			const transactions = await portfolioService.getAllByUserId(userId)
			res.json(responseHelper.success(transactions))
		} catch (error: any) {
			next(error)
		}
	}

	async updatePortfolio(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			const userId = req.user!.id
			const data = _.get(req, 'body', {})
			await portfolioService.updateByUser(userId, data)
			res.json(responseHelper.success())
		} catch (error: any) {
			next(error)
		}
	}

	async deletePortfolio(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			const userId = req.user!.id
			const portfolioId = +_.get(req, 'params.id')
			await portfolioService.deleteByUser(userId, portfolioId)
			res.json(responseHelper.success())
		} catch (error: any) {
			next(error)
		}
	}

	async createPortfolio(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			const userId = req.user!.id
			const data = _.get(req, 'body', {})
			await portfolioService.createByUser(userId, data)
			res.json(responseHelper.success())
		} catch (error: any) {
			next(error)
		}
	}
}

export default new PorfolioController()
