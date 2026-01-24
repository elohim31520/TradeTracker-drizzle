import express, { Router } from 'express'
import validate from '../middleware/validate'
import { registerSchema, loginSchema, changePasswordSchema, googleLoginSchema } from '../schemas/authSchema'
import userController from '../controller/userController'
// import googleAuthController from '../controller/googleAuthController'
import { authMiddleware } from '../middleware/auth'
import { success } from '../modules/responseHelper'

const router: Router = express.Router()

router.post('/register', validate(registerSchema), userController.create)
router.post('/login', validate(loginSchema), userController.login)
// router.post('/google/login', validate(googleLoginSchema), googleAuthController.googleLogin)
router.post('/password', authMiddleware, validate(changePasswordSchema), userController.changePassword)
router.get('/is-login', authMiddleware, (req, res) => {
	res.json(success(true))
})
export default router
