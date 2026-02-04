import { Router } from 'express'
import BalanceController from '../controller/balanceController'
import { authMiddleware } from '../middleware/auth'
import validate from '../middleware/validate'
import { createBalanceSchema, updateBalanceSchema } from '../schemas/balanceSchema'

const router = Router()

router.get('/', authMiddleware, BalanceController.getBalance)
router.post('/', authMiddleware, validate(createBalanceSchema), BalanceController.createBalance)
router.put('/', authMiddleware, validate(updateBalanceSchema), BalanceController.updateBalance)

export default router
