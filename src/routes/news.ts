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

const router = express.Router()

router.get('/', validate(getAllNewsQuerySchema, 'query'), newsController.getAllNews)
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
