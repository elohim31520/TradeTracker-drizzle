import { Request, Response, NextFunction } from 'express'
import BalanceService from '../services/balanceService'
import { success } from '../modules/responseHelper'
import _ from 'lodash'

class BalanceController {
	async getBalance(req: Request, res: Response, next: NextFunction) {
		try {
			const userId = req.user!.id
			const data = await BalanceService.getBalance(userId)
			res.json(success(data))
		} catch (error) {
			next(error)
		}
	}

	async createBalance(req: Request, res: Response, next: NextFunction) {
		try {
			const userId = req.user!.id
			const data = await BalanceService.createBalance(userId, _.get(req, 'body.balance'))
			res.json(success(data))
		} catch (error) {
			next(error)
		}
	}

	async updateBalance(req: Request, res: Response, next: NextFunction) {
		try {
			const userId = req.user!.id
			const data = await BalanceService.updateBalance(userId, _.get(req, 'body.balance'))
			res.json(success(data))
		} catch (error) {
			next(error)
		}
	}
}

export default new BalanceController()
