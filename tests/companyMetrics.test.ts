import request from 'supertest';
import app from '../src/index';

describe('Company Metrics Integration Test', () => {
    const testSymbol = 'TSLA';

    test('GET /company-metrics/:symbol should return metrics with success structure', async () => {
        const response = await request(app)
            .get(`/company-metrics/${testSymbol}`)
            .query({ days: 30 });

        expect(response.status).toBe(200);

        expect(response.body).toHaveProperty('data');
        
        if (response.body.data.length > 0) {
            const firstItem = response.body.data[0];
            expect(firstItem).toHaveProperty('sb', testSymbol);
            expect(firstItem).toHaveProperty('pr');
            expect(firstItem).toHaveProperty('ct');
        }
    });

    test('GET /company-metrics/:symbol should return empty array for non-existent symbol', async () => {
        const response = await request(app).get('/company-metrics/NON_EXISTENT_STOCK');
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual([]);
    });
});