import express, { Router } from 'express'
import portfolioController from '../controller/portfolioController'
import { authMiddleware } from '../middleware/auth'
import validate from '../middleware/validate'
import { updateSchema, deleteSchema, createSchema } from '../schemas/portfolioSchema'

const router: Router = express.Router()

router.get('/', authMiddleware, portfolioController.getAllByUserId)
router.put('/', authMiddleware, validate(updateSchema), portfolioController.updatePortfolio)
router.delete('/:id', authMiddleware, validate(deleteSchema, 'params'), portfolioController.deletePortfolio)
router.post('/', authMiddleware, validate(createSchema), portfolioController.createPortfolio)

export default router
