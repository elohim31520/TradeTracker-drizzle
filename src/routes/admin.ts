import express, { Router } from 'express'
import adminController from '../controller/adminController'
import { authMiddleware } from '../middleware/auth'
import { verifyAdmin } from '../middleware/adminAuth'
import validate from '../middleware/validate'
import * as adminSchema from '../schemas/adminSchema'

const router: Router = express.Router()

// 所有路由都需要先驗證 token 和管理員權限
router.use(authMiddleware, verifyAdmin)

router.get('/users', adminController.getAllUsers)
router.post('/set-admin', validate(adminSchema.createAdminSchema), adminController.setUserAsAdmin)
router.delete('/admin/:userId', validate(adminSchema.deleteUserSchema, 'params'), adminController.removeAdmin)
router.delete('/user/:userId', validate(adminSchema.deleteUserSchema, 'params'), adminController.deleteUser)
router.get('/stats', adminController.getSystemStats)

export default router 