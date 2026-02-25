import { Request, Response, NextFunction } from 'express'
import newsService from '../services/newsService'
import { success } from '../modules/responseHelper'
import _ from 'lodash'

class NewsController {
	async getAllNews(req: Request, res: Response, next: NextFunction) {
		try {
			const page = Number(req.query.page ?? 1)
			const size = Number(req.query.size ?? 10)
			const status = _.get(req, 'query.status', 'published') as string

			if (page <= 3 && status === 'published') {
				res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
			} else {
				res.setHeader('Cache-Control', 'no-store')
			}

			const news = await newsService.getAllNews({ page, size, status })
			res.json(success(news))
		} catch (error) {
			next(error)
		}
	}

	async getNewsById(req: Request, res: Response, next: NextFunction) {
		try {
			const id = Number(req.params.id)
			const news = await newsService.getNewsById(id)
			res.json(success(news))
		} catch (error) {
			next(error)
		}
	}

	async createNews(req: Request, res: Response, next: NextFunction) {
		try {
			const news = await newsService.createNews(req.body)
			res.json(success(news))
		} catch (error) {
			next(error)
		}
	}

	async bulkCreateNews(req: Request, res: Response, next: NextFunction) {
		try {
			const news = await newsService.bulkCreateNews(req.body)
			res.json(success(news))
		} catch (error) {
			next(error)
		}
	}

	async updateNews(req: Request, res: Response, next: NextFunction) {
		try {
			const id = Number(req.params.id)
			const news = await newsService.updateNews(id, req.body)
			res.json(success(news))
		} catch (error) {
			next(error)
		}
	}

	async deleteNews(req: Request, res: Response, next: NextFunction) {
		try {
			const id = Number(req.params.id)
			const done = await newsService.deleteNews(id)
			res.json(success(done))
		} catch (error) {
			next(error)
		}
	}
}

export default new NewsController()