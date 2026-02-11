import tradeService from '../services/tradeService'
import { success, fail } from '../modules/responseHelper'
import { Request, Response, NextFunction } from 'express'
import { ClientError, ServerError } from '../modules/errors'
import { rabbitMQ } from '../modules/rabbitMQManager'
import { geminiModel } from '../modules/vertexAi';

class TradeController {
	async create(req: Request, res: Response, next: NextFunction) {
		try {
			const userId = req.user!.id
			const tradeData = {
				...req.body,
				userId,
			};

			await rabbitMQ.publish('trade_exchange', 'trade.create.single', tradeData);
			res.status(202).json(success({ message: 'Trade processing started' }))

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

			await rabbitMQ.publish('trade_exchange', 'trade.create.bulk', dataToCreate);
			res.status(202).json(success({ message: 'Bulk trades processing started' }));
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

	async handleTradeExtraction(req: Request, res: Response, next: NextFunction) {
		try {
			const prompt = `
				請分析圖片中的交易紀錄，並將其中文字轉換為以下 JSON 陣列格式 createSchema[]。

				const createSchema = Joi.object({
					companyId: Joi.number().required(),
					tradeType: Joi.string().valid('buy', 'sell').required(),
					quantity: Joi.number().integer().positive().required(),
					price: Joi.number().precision(2).positive().required(),
					tradeDate: Joi.date().iso().required(),
				})

				上述是拿JOI驗證的格式給你參考，到時候API接收的資料屬性就是長這樣
				最終幫我拼湊出完整的 createSchema[]
				如果沒資料返回[]
			。`

			if (!req.imagePart) {
				throw new Error('找不到圖片資料');
			}

			const result = await geminiModel.generateContent({
				contents: [{
					role: 'user',
					parts: [
						{ text: prompt },
						req.imagePart
					]
				}]
			});

			const response = result.response;
			const candidate = response.candidates?.[0];
			const part = candidate?.content?.parts?.[0];

			if (!part || !part.text) {
				throw new Error('AI 未能產生有效的文字內容');
			}

			// 避免 AI 偶爾回傳非 JSON 字串
			let extractedData;
			try {
				// 更穩健的寫法（清除整個 code block 包裝）
				extractedData = JSON.parse(part.text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
			} catch (e) {
				throw new Error('AI 回傳格式錯誤，無法解析 JSON');
			}

			if (!Array.isArray(extractedData)) extractedData = [extractedData];
			if (!extractedData.length) {
				throw new ServerError('AI 回傳格式錯誤，無法解析 JSON，請確保截圖裡的文字正確');
			}

			req.body = extractedData
			next();
		} catch (err) {
			next(err);
		}
	}
}

export default new TradeController()
