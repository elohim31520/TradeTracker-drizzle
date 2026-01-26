import { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { AuthError } from '../modules/errors';
import { db } from '../db/pg'
import { users } from '../db/schema'

export const verifyAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const userId = req.user?.id;

		if (!userId) {
			throw new AuthError('無效的認證資訊');
		}

		const userWithAdmin = await db.query.users.findFirst({
			where: eq(users.id, userId),
			with: {
				admin: true,
			},
		});

		// 檢查使用者是否存在且關聯的 admin 資料表是否有資料
		if (!userWithAdmin || !userWithAdmin.admin) {
			throw new AuthError('需要管理員權限');
		}

		next();
	} catch (error) {
		next(error);
	}
};