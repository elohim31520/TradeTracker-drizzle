"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setMockUserId = void 0;
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const pg_ts_1 = require("../pg.ts");
const index_ts_1 = require("../schema/index.ts");
const users_1 = __importDefault(require("../routes/users"));
const errorHandler_1 = __importDefault(require("../middleware/errorHandler"));
const drizzle_orm_1 = require("drizzle-orm");
// Mock Google auth service for testing
jest.mock('../services/googleAuthService', () => {
    const mockService = {
        handleGoogleCredential: jest.fn().mockResolvedValue({
            token: 'mock-google-token',
            picture: 'https://example.com/picture.jpg',
            name: 'Google User'
        })
    };
    return mockService;
});
// Mock auth middleware for testing
let mockUserId = 'test-user-id';
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req, res, next) => {
        req.user = { id: mockUserId };
        next();
    }
}));
// Function to set mock user ID for testing
const setMockUserId = (id) => {
    mockUserId = id;
};
exports.setMockUserId = setMockUserId;
describe('Users API', () => {
    let app;
    let testUser;
    beforeAll(async () => {
        // 確保資料庫連線正常
        try {
            await pg_ts_1.db.execute('SELECT 1');
        }
        catch (error) {
            console.error('Database connection failed:', error);
            throw error;
        }
        // 為測試創建獨立的 app 實例
        app = (0, express_1.default)();
        app.use(express_1.default.json());
        app.use('/users', users_1.default);
        app.use(errorHandler_1.default);
    });
    afterAll(async () => {
        // 清理測試資料
        if (testUser?.id) {
            await pg_ts_1.db.delete(index_ts_1.users).where((0, drizzle_orm_1.eq)(index_ts_1.users.id, testUser.id));
        }
        await pg_ts_1.db.delete(index_ts_1.users).where((0, drizzle_orm_1.eq)(index_ts_1.users.email, 'DuplicatedUser@example.com'));
    });
    describe('POST /users/register', () => {
        it('應該成功註冊新用戶', async () => {
            const userData = {
                name: 'Test User',
                email: `test-${Date.now()}@example.com`,
                password: 'testpassword123'
            };
            const response = await (0, supertest_1.default)(app)
                .post('/users/register')
                .send(userData)
                .expect(201);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toHaveProperty('token');
            expect(typeof response.body.data.token).toBe('string');
            // 保存測試用戶以便後續清理
            testUser = await pg_ts_1.db.select().from(index_ts_1.users).where((0, drizzle_orm_1.eq)(index_ts_1.users.email, userData.email)).limit(1);
            testUser = testUser[0];
        });
        it('應該在重複郵箱時返回錯誤', async () => {
            const userData = {
                name: 'Duplicate User',
                email: `DuplicatedUser@example.com`,
                password: 'testpassword123'
            };
            // 先創建一個用戶
            const res = await (0, supertest_1.default)(app)
                .post('/users/register')
                .send(userData)
                .expect(201);
            // 嘗試再次註冊同一個郵箱
            const response = await (0, supertest_1.default)(app)
                .post('/users/register')
                .send(userData)
                .expect(409); // 資料庫唯一約束違反
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('code', 409);
        });
        it('應該在無效數據時返回驗證錯誤', async () => {
            const invalidData = {
                name: '',
                email: 'invalid-email',
                password: '123'
            };
            const response = await (0, supertest_1.default)(app)
                .post('/users/register')
                .send(invalidData)
                .expect(400);
            expect(response.body).toHaveProperty('success', false);
        });
    });
    describe('POST /users/login', () => {
        beforeAll(async () => {
            // 確保有測試用戶可用
            if (!testUser) {
                const userData = {
                    name: 'Login Test User',
                    email: `login-test-${Date.now()}@example.com`,
                    password: 'testpassword123'
                };
                await (0, supertest_1.default)(app)
                    .post('/users/register')
                    .send(userData)
                    .expect(201);
                testUser = await pg_ts_1.db.select().from(index_ts_1.users).where((0, drizzle_orm_1.eq)(index_ts_1.users.email, userData.email)).limit(1);
                testUser = testUser[0];
            }
        });
        it('應該成功登錄並返回token', async () => {
            const loginData = {
                email: testUser.email,
                password: 'testpassword123'
            };
            const response = await (0, supertest_1.default)(app)
                .post('/users/login')
                .send(loginData)
                .expect(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toHaveProperty('token');
            expect(typeof response.body.data.token).toBe('string');
        });
        it('應該在錯誤密碼時返回錯誤', async () => {
            const loginData = {
                email: testUser.email,
                password: 'wrongpassword'
            };
            const response = await (0, supertest_1.default)(app)
                .post('/users/login')
                .send(loginData)
                .expect(400);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body.message).toContain('密碼錯誤');
        });
        it('應該在不存在的用戶時返回錯誤', async () => {
            const loginData = {
                email: 'nonexistent@example.com',
                password: 'password123'
            };
            const response = await (0, supertest_1.default)(app)
                .post('/users/login')
                .send(loginData)
                .expect(400);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body.message).toContain('使用者名稱或密碼錯誤');
        });
    });
    describe('POST /users/google/login', () => {
        it('應該成功處理Google登錄', async () => {
            const googleData = {
                credential: 'mock-google-credential'
            };
            const response = await (0, supertest_1.default)(app)
                .post('/users/google/login')
                .send(googleData)
                .expect(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toHaveProperty('token');
            expect(response.body.data).toHaveProperty('name');
            expect(response.body.data).toHaveProperty('picture');
        });
        it('應該在缺少credential時返回驗證錯誤', async () => {
            const response = await (0, supertest_1.default)(app)
                .post('/users/google/login')
                .send({})
                .expect(400);
            expect(response.body).toHaveProperty('success', false);
        });
    });
    describe('POST /users/password', () => {
        beforeAll(async () => {
            // 設置 mock 用戶 ID 為真實的測試用戶 ID
            if (testUser) {
                (0, exports.setMockUserId)(testUser.id);
            }
        });
        it('應該成功更改密碼', async () => {
            const passwordData = {
                oldPassword: 'testpassword123',
                newPassword: 'newpassword123'
            };
            const response = await (0, supertest_1.default)(app)
                .post('/users/password')
                .send(passwordData)
                .expect(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toHaveProperty('message', '密碼更新成功');
        });
        it('應該在舊密碼錯誤時返回錯誤', async () => {
            const passwordData = {
                oldPassword: 'wrongoldpassword',
                newPassword: 'newpassword123'
            };
            const response = await (0, supertest_1.default)(app)
                .post('/users/password')
                .send(passwordData)
                .expect(400);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body.message).toContain('密碼錯誤');
        });
    });
    describe('GET /users/is-login', () => {
        it('應該返回登錄狀態', async () => {
            const response = await (0, supertest_1.default)(app)
                .get('/users/is-login')
                .expect(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toBe(true);
        });
    });
});
