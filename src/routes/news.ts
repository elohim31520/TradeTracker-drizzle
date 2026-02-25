import express from 'express'
import newsController from '../controller/newsController'
import { authMiddleware } from '../middleware/auth'
import { verifyAdmin } from '../middleware/adminAuth'
import validate from '../middleware/validate'
import {
	updateSchema,
	deleteSchema,
	createSchema,
	bulkCreateSchema,
	idSchema,
	getAllNewsQuerySchema,
} from '../schemas/newsSchema'
import redisConditionalCache from '../middleware/redisConditionalCache'
import { DAILY_UPDATE_CACHE_TTL } from '../constant/cache'


const router = express.Router()

router.get('/', validate(getAllNewsQuerySchema, 'query'),
	redisConditionalCache(DAILY_UPDATE_CACHE_TTL, (req) => {
		const page = Number(req.query.page ?? 1)
		const size = Number(req.query.size ?? 10)
		const status = req.query.status ?? 'published'

		// 只緩存前三頁、預設 size、published 狀態
		return page <= 3 && size === 10 && status === 'published'
	}),
	newsController.getAllNews
)

router.get('/:id', newsController.getNewsById)
router.post('/bulkCreate', authMiddleware, verifyAdmin, validate(bulkCreateSchema), newsController.bulkCreateNews)
router.post('/', authMiddleware, verifyAdmin, validate(createSchema), newsController.createNews)
router.put(
	'/:id',
	authMiddleware,
	verifyAdmin,
	validate(updateSchema),
	validate(idSchema, 'params'),
	newsController.updateNews
)
router.delete('/:id', authMiddleware, verifyAdmin, validate(deleteSchema, 'params'), newsController.deleteNews)

export default router
