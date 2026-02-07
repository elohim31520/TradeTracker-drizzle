import { eq, and } from 'drizzle-orm'
import { db } from '../db/pg'
import { users, userThirdpartyAccounts } from '../db/schema'
import { generateToken, generateSalt, sha256 } from '../modules/crypto'
import { ClientError, ConflictError, ServerError } from '../modules/errors'
import { USER_NOT_FOUND, PASSWORD_INCORRECT } from '../constant/userErrors'
import bcrypt from 'bcrypt';
import { OAuth2Client, TokenPayload } from 'google-auth-library'

const googleOAuth = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)

class userService {
	private readonly SALT_ROUNDS = 10;

	async findAll() {
		const allUsers = await db
			.select({
				id: users.id,
				name: users.name,
				email: users.email,
			})
			.from(users);

		return allUsers;
	}

	async create({ name, password, email }: any) {
		try {
			// 1. 直接雜湊，bcrypt 會自動生成 Salt 並混入結果中
			const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);

			const [newUser] = await db.insert(users).values({
				name,
				email,
				password: hashedPassword,
			}).returning();

			return { token: generateToken({ name: newUser.name, id: newUser.id, email: newUser.email }) };
		} catch (error: any) {
			// 檢查是否是唯一約束違反 (重複 email)
			if (error.message && (
				error.message.includes('duplicate key value violates unique constraint') ||
				error.message.includes('UNIQUE constraint failed') ||
				error.message.includes('Failed query')
			)) {
				throw new ConflictError('郵箱已被註冊');
			}
			throw error;
		}
	}

	async login({ email, password }: any) {
		const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

		if (!user) throw new ClientError(USER_NOT_FOUND);

		// 驗證時，bcrypt 會從 user.password 中解析出鹽值進行比對
		const isMatch = await bcrypt.compare(password, user.password!);

		if (!isMatch) throw new ClientError(PASSWORD_INCORRECT);

		return { token: generateToken({ name: user.name, id: user.id, email: user.email }) };
	}

	async changePassword({
		userId,
		oldPassword,
		newPassword,
	}: {
		userId: string;
		oldPassword: string;
		newPassword: string;
	}) {
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!user) throw new ClientError(USER_NOT_FOUND);

		// bcrypt.compare 會自動從 user.password (Hash字串) 裡提取鹽值來比對
		const isMatch = await bcrypt.compare(oldPassword, user.password!);
		if (!isMatch) throw new ClientError(PASSWORD_INCORRECT);

		// 產生新密碼的 Hash
		const hashedNewPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

		// 更新資料庫
		await db
			.update(users)
			.set({ password: hashedNewPassword })
			.where(eq(users.id, userId));

		return { message: '密碼更新成功' };
	}


	async handleGoogleCredential(credential: string) {
		const ticket = await googleOAuth.verifyIdToken({
			idToken: credential,
			audience: process.env.GOOGLE_CLIENT_ID,
		})

		const payload = ticket.getPayload();

		if (!payload) {
			throw new ClientError('無法解析 Google 資料');
		}

		const { sub: googleId, email, name, picture } = payload;

		// 系統需要 email 和 sub 才能運作
		if (!googleId || !email) {
			throw new ClientError('Google 帳號資訊不足 (缺少 Email 或 ID)');
		}

		const existingAccount = await db.query.userThirdpartyAccounts.findFirst({
			where: and(
				eq(userThirdpartyAccounts.provider, 'google'),
				eq(userThirdpartyAccounts.providerUserId, googleId)
			),
			with: {
				user: true,
			},
		});

		let targetUser;

		if (existingAccount) {
			// A. 如果已存在，更新資訊
			await db.update(userThirdpartyAccounts)
				.set({ picture, name })
				.where(eq(userThirdpartyAccounts.id, existingAccount.id));

			targetUser = existingAccount.user;
		} else {
			// B. 如果不存在，使用 Transaction 處理「找/創使用者」與「綁定帳號」
			targetUser = await db.transaction(async (tx) => {
				// 檢查 User 表是否已存在該 Email
				let localUser = await tx.query.users.findFirst({
					where: eq(users.email, email),
				});

				if (!localUser) {
					const [newUser] = await tx.insert(users)
						.values({
							name: name || `google_${googleId}`,
							email,
						})
						.returning();
					localUser = newUser;
				}

				// 創建外部帳號關聯
				await tx.insert(userThirdpartyAccounts)
					.values({
						userId: localUser.id,
						provider: 'google',
						providerUserId: googleId,
						picture,
						name,
					})
					.onConflictDoUpdate({
						target: [userThirdpartyAccounts.provider, userThirdpartyAccounts.providerUserId],
						set: { picture, name }
					});

				return localUser;
			});
		}

		if (!targetUser) {
			throw new ServerError('無法創建或找到用戶');
		}

		return {
			token: generateToken({ name: targetUser.name, id: targetUser.id, email: targetUser.email }),
			picture,
			name,
		};
	}
}

export default new userService()
