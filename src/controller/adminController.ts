import { success } from '../modules/responseHelper'
import AdminService from '../services/adminService'
import { Request, Response, NextFunction } from 'express'

async function getAllUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const users = await AdminService.getAllUsers()
		res.json(success(users))
	} catch (error) {
		next(error)
	}
}

async function setUserAsAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const { userId } = req.body
		const admin = await AdminService.setUserAsAdmin(userId)
		res.status(201).json(success(admin, '已成功設置為管理員'))
	} catch (error) {
		next(error)
	}
}

async function removeAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const userId = req.user?.id!
		await AdminService.removeAdmin(userId)
		res.json(success(null, '已成功移除管理員權限'))
	} catch (error) {
		next(error)
	}
}

async function deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const userId = req.user?.id!
		await AdminService.deleteUser(userId)
		res.json(success(null, '用戶已成功刪除'))
	} catch (error) {
		next(error)
	}
}

async function getSystemStats(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const stats = await AdminService.getSystemStats()
		res.json(success(stats))
	} catch (error) {
		next(error)
	}
}

export default {
	getAllUsers,
	setUserAsAdmin,
	removeAdmin,
	deleteUser,
	getSystemStats
}