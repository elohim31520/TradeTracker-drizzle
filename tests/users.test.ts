import request from 'supertest'
import express from 'express'
import { db } from '../src/db/pg'
import { users } from '../src/db/schema/index'
import userRoutes from '../src/routes/users'
import errorHandler from '../src/middleware/errorHandler'
import { eq } from 'drizzle-orm'

// Mock Google auth service for testing
// jest.mock('../services/googleAuthService', () => {
// 	const mockService = {
// 		handleGoogleCredential: jest.fn().mockResolvedValue({
// 			token: 'mock-google-token',
// 			picture: 'https://example.com/picture.jpg',
// 			name: 'Google User'
// 		})
// 	};
// 	return mockService;
// })

// Mock auth middleware for testing
let mockUserId = 'test-user-id'
jest.mock('../src/middleware/auth', () => ({
	authMiddleware: (req: any, res: any, next: any) => {
		req.user = { id: mockUserId }
		next()
	}
}))

// Function to set mock user ID for testing
export const setMockUserId = (id: string) => {
	mockUserId = id
}

describe('Users API', () => {
	let app: express.Application
	let testUser: any

	beforeAll(async () => {
		// 確保資料庫連線正常
		try {
			await db.execute('SELECT 1')
		} catch (error) {
			console.error('Database connection failed:', error)
			throw error
		}

		// 為測試創建獨立的 app 實例
		app = express()
		app.use(express.json())
		app.use('/users', userRoutes)
		app.use(errorHandler)
	})

	afterAll(async () => {
		// 清理測試資料
		if (testUser?.id) {
			await db.delete(users).where(eq(users.id, testUser.id))
		}
		await db.delete(users).where(eq(users.email, 'DuplicatedUser@example.com'))
	})

	describe('POST /users/register', () => {
		it('應該成功註冊新用戶', async () => {
			const userData = {
				name: 'Test User',
				email: `test-${Date.now()}@example.com`,
				password: 'testpassword123'
			}

			const response = await request(app)
				.post('/users/register')
				.send(userData)
				.expect(201)

			expect(response.body).toHaveProperty('success', true)
			expect(response.body.data).toHaveProperty('token')
			expect(typeof response.body.data.token).toBe('string')

			// 保存測試用戶以便後續清理
			testUser = await db.select().from(users).where(eq(users.email, userData.email)).limit(1)
			testUser = testUser[0]
		})

		it('應該在重複郵箱時返回錯誤', async () => {
			const userData = {
				name: 'Duplicate User',
				email: `DuplicatedUser@example.com`,
				password: 'testpassword123'
			}

			// 先創建一個用戶
			const res = await request(app)
				.post('/users/register')
				.send(userData)
				.expect(201)

			// 嘗試再次註冊同一個郵箱
			const response = await request(app)
				.post('/users/register')
				.send(userData)
				.expect(409) // 資料庫唯一約束違反

			expect(response.body).toHaveProperty('success', false)
			expect(response.body).toHaveProperty('code', 409)
		})

		it('應該在無效數據時返回驗證錯誤', async () => {
			const invalidData = {
				name: '',
				email: 'invalid-email',
				password: '123'
			}

			const response = await request(app)
				.post('/users/register')
				.send(invalidData)
				.expect(400)

			expect(response.body).toHaveProperty('success', false)
		})
	})

	describe('POST /users/login', () => {
		beforeAll(async () => {
			// 確保有測試用戶可用
			if (!testUser) {
				const userData = {
					name: 'Login Test User',
					email: `login-test-${Date.now()}@example.com`,
					password: 'testpassword123'
				}

				await request(app)
					.post('/users/register')
					.send(userData)
					.expect(201)

				testUser = await db.select().from(users).where(eq(users.email, userData.email)).limit(1)
				testUser = testUser[0]
			}
		})

		it('應該成功登錄並返回token', async () => {
			const loginData = {
				email: testUser.email,
				password: 'testpassword123'
			}

			const response = await request(app)
				.post('/users/login')
				.send(loginData)
				.expect(200)

			expect(response.body).toHaveProperty('success', true)
			expect(response.body.data).toHaveProperty('token')
			expect(typeof response.body.data.token).toBe('string')
		})

		it('應該在錯誤密碼時返回錯誤', async () => {
			const loginData = {
				email: testUser.email,
				password: 'wrongpassword'
			}

			const response = await request(app)
				.post('/users/login')
				.send(loginData)
				.expect(400)

			expect(response.body).toHaveProperty('success', false)
			expect(response.body.message).toContain('密碼錯誤')
		})

		it('應該在不存在的用戶時返回錯誤', async () => {
			const loginData = {
				email: 'nonexistent@example.com',
				password: 'password123'
			}

			const response = await request(app)
				.post('/users/login')
				.send(loginData)
				.expect(400)

			expect(response.body).toHaveProperty('success', false)
			expect(response.body.message).toContain('使用者名稱或密碼錯誤')
		})
	})

	// describe('POST /users/google/login', () => {
	// 	it('應該成功處理Google登錄', async () => {
	// 		const googleData = {
	// 			credential: 'mock-google-credential'
	// 		}

	// 		const response = await request(app)
	// 			.post('/users/google/login')
	// 			.send(googleData)
	// 			.expect(200)

	// 		expect(response.body).toHaveProperty('success', true)
	// 		expect(response.body.data).toHaveProperty('token')
	// 		expect(response.body.data).toHaveProperty('name')
	// 		expect(response.body.data).toHaveProperty('picture')
	// 	})

	// 	it('應該在缺少credential時返回驗證錯誤', async () => {
	// 		const response = await request(app)
	// 			.post('/users/google/login')
	// 			.send({})
	// 			.expect(400)

	// 		expect(response.body).toHaveProperty('success', false)
	// 	})
	// })

	describe('POST /users/password', () => {
		beforeAll(async () => {
			// 設置 mock 用戶 ID 為真實的測試用戶 ID
			if (testUser) {
				setMockUserId(testUser.id)
			}
		})

		it('應該成功更改密碼', async () => {
			const passwordData = {
				oldPassword: 'testpassword123',
				newPassword: 'newpassword123'
			}

			const response = await request(app)
				.post('/users/password')
				.send(passwordData)
				.expect(200)

			expect(response.body).toHaveProperty('success', true)
			expect(response.body.data).toHaveProperty('message', '密碼更新成功')
		})

		it('應該在舊密碼錯誤時返回錯誤', async () => {
			const passwordData = {
				oldPassword: 'wrongoldpassword',
				newPassword: 'newpassword123'
			}

			const response = await request(app)
				.post('/users/password')
				.send(passwordData)
				.expect(400)

			expect(response.body).toHaveProperty('success', false)
			expect(response.body.message).toContain('密碼錯誤')
		})
	})

	describe('GET /users/is-login', () => {
		it('應該返回登錄狀態', async () => {
			const response = await request(app)
				.get('/users/is-login')
				.expect(200)

			expect(response.body).toHaveProperty('success', true)
			expect(response.body.data).toBe(true)
		})
	})
})
