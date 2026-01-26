import request from 'supertest';
import app from '../src/index';
import { db } from '../src/db/pg';
import { users, admins } from '../src/db/schema';
import { generateToken } from '../src/modules/crypto'
import { cleanup } from './helpers';

describe('Admin API Integration Tests (with Auth)', () => {
    let adminToken: string;
    let adminUser: any;

    beforeEach(async () => {
        await cleanup();

        // 1. 建立一個真實的管理員帳號供測試使用
        [adminUser] = await db.insert(users).values({
            name: 'Super Admin',
            email: 'admin@test.com',
            password: 'a123456+'
        }).returning();

        await db.insert(admins).values({ userId: adminUser.id });

        adminToken = generateToken({ id: adminUser.id, email: adminUser.email, name: adminUser.name });
    });

    describe('GET /admins/stats', () => {
        it('帶有正確 Token 時應該回傳 200', async () => {
            const response = await request(app)
                .get('/admins/stats')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('userCount');
            expect(response.body.data).toHaveProperty('adminCount');
        });

        it('未提供 Token 時應該回傳 401 (Auth Error)', async () => {
            const response = await request(app).get('/admins/stats');
            expect(response.status).toBe(401);
        });

        it('普通用戶（非 Admin）存取時應該回傳 401/403 (verifyAdmin 阻擋)', async () => {
            // 建立一個非管理員用戶
            const [normalUser] = await db.insert(users).values({
                name: 'Normal User',
                email: 'user@test.com',
            }).returning();

            const userToken = generateToken({ id: normalUser.id, email: normalUser.email, name: normalUser.name });

            const response = await request(app)
                .get('/admins/stats')
                .set('Authorization', `Bearer ${userToken}`);

            // 這裡會觸發你 verifyAdmin 裡的 "需要管理員權限" 錯誤
            expect(response.status).toBe(401);
            expect(response.body.message).toContain('需要管理員權限');
        });
    });

    describe('POST /admins/set-admin', () => {
        it('管理員應該能將其他用戶設為管理員', async () => {
            const [targetUser] = await db.insert(users).values({
                name: 'Target',
                email: 'target@test.com',
            }).returning();

            const response = await request(app)
                .post('/admins/set-admin')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ userId: targetUser.id });

            expect(response.status).toBe(201);

            // 驗證資料庫
            const check = await db.query.admins.findFirst({
                where: (admins, { eq }) => eq(admins.userId, targetUser.id)
            });
            expect(check).toBeDefined();
        });
    });
});