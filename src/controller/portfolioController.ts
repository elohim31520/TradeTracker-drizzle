import { Request, Response, NextFunction } from 'express'
import portfolioService from '../services/portfolioService'
const { success } = require('../modules/responseHelper')

async function getAllByUserId(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const userId = req.user!.id
		const portfolios = await portfolioService.getAllByUserId(userId)
		res.json(success(portfolios))
	} catch (error: any) {
		next(error)
	}
}

async function updatePortfolio(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const userId = req.user!.id
		const data = req.body ?? {}
		await portfolioService.updateByUser(userId, data)
		res.json(success())
	} catch (error: any) {
		next(error)
	}
}

async function deletePortfolio(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const userId = req.user!.id
		const portfolioId = Number(req.params.id)
		await portfolioService.deleteByUser(userId, portfolioId)
		res.json(success())
	} catch (error: any) {
		next(error)
	}
}

async function createPortfolio(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const userId = req.user!.id
		const data = req.body ?? {}
		await portfolioService.createByUser(userId, data)
		res.json(success())
	} catch (error: any) {
		next(error)
	}
}

export default {
	getAllByUserId,
	updatePortfolio,
	deletePortfolio,
	createPortfolio
}