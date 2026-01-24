import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { AuthError } from '../modules/errors';
import { UserPayload } from '../types/user';

const PUBLIC_KEY_PATH = path.join(process.cwd(), 'secrets', 'public.key');
const publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
	try {
		const authHeader = req.headers.authorization;

		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			throw new AuthError('未提供有效的授權標頭');
		}

		const token = authHeader.split(' ')[1];
		if (!token) {
			throw new AuthError('Token 缺失');
		}

		const decoded = jwt.verify(token, publicKey, {
			algorithms: ['RS256']
		}) as UserPayload;

		//@ts-ignore
		req.user = decoded;

		next();
	} catch (error: any) {
		if (error.name === 'TokenExpiredError') {
			return next(new AuthError('Token 已過期'));
		}
		if (error.name === 'JsonWebTokenError') {
			return next(new AuthError('Token 無效或簽章錯誤'));
		}
		next(new AuthError(`驗證失敗: ${error.message}`));
	}
};