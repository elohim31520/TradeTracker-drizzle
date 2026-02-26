import tradeService from '../services/tradeService'
import { success } from '../modules/responseHelper'
import { Request, Response, NextFunction } from 'express'
import { ClientError } from '../modules/errors'
import { rabbitMQ } from '../modules/rabbitMQManager'
import redisClient from '../modules/redis'
import { updateJobStatus } from '../modules/util'
import crypto from 'crypto'

async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const userId = req.user!.id
		const tradeData = {
			...(req.body ?? {}),
			userId,
		};

		await rabbitMQ.publish('trade_exchange', 'trade.create.bulk', [tradeData]);
		res.status(202).json(success({ message: 'Trade processing started' }))
	} catch (error) {
		next(error)
	}
}

async function bulkCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const userId = req.user!.id
		const body = req.body ?? []
		const dataToCreate = body.map((item: any) => ({
			...item,
			userId,
		}))

		await rabbitMQ.publish('trade_exchange', 'trade.create.bulk', dataToCreate);
		res.status(202).json(success({ message: 'Bulk trades processing started' }));
	} catch (error) {
		next(error)
	}
}

async function getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const userId = req.user!.id
		const page = Math.max(1, Number(req.query.page) || 1)
		const size = Math.min(100, Math.max(1, Number(req.query.size) || 10))

		const result = await tradeService.getAll({ userId, page, size })
		res.json(success(result))
	} catch (error) {
		next(error)
	}
}

async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const tradeId = Number(req.params.id)
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

async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const tradeId = Number(req.params.id)
		if (isNaN(tradeId)) {
			throw new ClientError('交易ID必須是有效的數字')
		}

		const trade = await tradeService.update(tradeId, req.body)
		res.json(success(trade))
	} catch (error) {
		next(error)
	}
}

async function deleteTrade(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const tradeId = Number(req.params.id)
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

async function handleTradeExtraction(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		if (!req.imagePart) throw new ClientError('找不到圖片資料');

		const jobId = crypto.randomUUID();
		updateJobStatus(jobId, 'pending', 'AI working...')

		await rabbitMQ.publish('ai_exchange', 'ai.extract.trade', {
			imagePart: req.imagePart,
			userId: req.user!.id,
			jobId
		});

		res.status(202).json(success({ jobId, message: 'AI 解析處理中' }));
	} catch (error) {
		next(error);
	}
}

async function getAIJobStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const { jobId } = req.params;
		const data = await redisClient.get(`ai:trade:extraction:${jobId}`);

		if (!data) {
			throw new ClientError('找不到此任務或任務已過期');
		}

		res.json(success(JSON.parse(data)));
	} catch (error) {
		next(error);
	}
}

export default {
	create,
	bulkCreate,
	getAll,
	getById,
	update,
	delete: deleteTrade,
	handleTradeExtraction,
	getAIJobStatus
}