import tradeService from '../services/tradeService'
import { success, fail } from '../modules/responseHelper'
import { Request, Response, NextFunction } from 'express'
import { ClientError } from '../modules/errors'
import { NewTrade } from '../types/trade'

class TradeController {
	async create(req: Request, res: Response, next: NextFunction) {
		try {
			const userId = req.user!.id
			const tradeData = {
				...req.body,
				userId,
			}
			const trade = await tradeService.create(tradeData as NewTrade)
			res.status(201).json(success(trade))
		} catch (error) {
			next(error)
		}
	}

	async bulkCreate(req: Request, res: Response, next: NextFunction) {
		try {
			const userId = req.user!.id
			const dataToCreate = req.body.map((item: any) => ({
				...item,
				userId,
			}))
			const trades = await tradeService.bulkCreate(dataToCreate)
			res.json(success(trades))
		} catch (error) {
			next(error)
		}
	}

	async getAll(req: Request, res: Response, next: NextFunction) {
		try {
			const userId = req.user!.id
			const page = Math.max(1, parseInt(req.query.page as string) || 1)
			const size = Math.min(100, Math.max(1, parseInt(req.query.size as string) || 10))

			const result = await tradeService.getAll({ userId, page, size })
			res.json(success(result))
		} catch (error) {
			next(error)
		}
	}

	async getById(req: Request, res: Response, next: NextFunction) {
		try {
			const tradeId = parseInt(req.params.id as string)
			if (isNaN(tradeId)) {
				throw new ClientError('交易ID必須是有效的數字')
			}

			const trade = await tradeService.getById(tradeId)
			if (!trade) {
				throw new ClientError('找不到交易記錄')
			}

			res.json(success(trade))
		} catch (error) {
			next(error)
		}
	}

	async update(req: Request, res: Response, next: NextFunction) {
		try {
			const tradeId = parseInt(req.params.id as string)
			if (isNaN(tradeId)) {
				throw new ClientError('交易ID必須是有效的數字')
			}

			const trade = await tradeService.update(tradeId, req.body)
			res.json(success(trade))
		} catch (error) {
			next(error)
		}
	}

	async delete(req: Request, res: Response, next: NextFunction) {
		try {
			const tradeId = parseInt(req.params.id as string)
			if (isNaN(tradeId)) {
				throw new ClientError('交易ID必須是有效的數字')
			}

			const userId = req.user!.id
			await tradeService.delete(tradeId, userId)
			res.status(204).json(success(null, '交易記錄已成功刪除'))
		} catch (error) {
			next(error)
		}
	}
}

export default new TradeController()
