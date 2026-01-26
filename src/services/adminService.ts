import { db } from '../db/pg'
import { users, admins } from '../db/schema'
import { eq, count } from 'drizzle-orm'
import type { Admin, User } from '../types/user'

class AdminService {
	async getAllUsers() {
		const result = await db
			.select({
				id: users.id,
				name: users.name,
				email: users.email,
				createdAt: users.createdAt,
				updatedAt: users.updatedAt,
				admin: {
					id: admins.id,
					userId: admins.userId,
				},
			})
			.from(users)
			.leftJoin(admins, eq(users.id, admins.userId))

		return result.map((row) => {
			if (!row.admin?.id) {
				const { admin, ...rest } = row
				return rest
			} else {
				return { ...row, isAdmin: true }
			}
		})
	}

	async setUserAsAdmin(userId: string): Promise<Admin> {
		const existing = await db
			.select()
			.from(admins)
			.where(eq(admins.userId, userId))
			.limit(1)

		if (existing.length > 0) {
			throw new Error('該用戶已經是管理員')
		}

		const [newAdmin] = await db
			.insert(admins)
			.values({ userId })
			.returning()

		return newAdmin
	}

	async removeAdmin(userId: string): Promise<boolean> {
		const deleted = await db
			.delete(admins)
			.where(eq(admins.userId, userId))
			.returning()

		if (deleted.length === 0) {
			throw new Error('該用戶不是管理員')
		}

		return true
	}

	async deleteUser(userId: string): Promise<boolean> {
		const deleted = await db
			.delete(users)
			.where(eq(users.id, userId))
			.returning()

		if (deleted.length === 0) {
			throw new Error('用戶不存在')
		}

		return true
	}

	async getSystemStats(): Promise<{ userCount: number; adminCount: number }> {
		const [uCount] = await db.select({ value: count() }).from(users)
		const [aCount] = await db.select({ value: count() }).from(admins)

		return {
			userCount: Number(uCount.value),
			adminCount: Number(aCount.value),
		}
	}
}

export default new AdminService()
