import { db } from '../db/pg';
import { portfolios, companies } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { getZonedDate } from '../modules/date';
import { PortfolioWithCompany, NewPortfolio } from '../types/portfolio';

class PortfolioService {
	async getAllByUserId(userId: string): Promise<PortfolioWithCompany[]> {
		const rows = await db
			.select({
				id: portfolios.id,
				company_id: portfolios.companyId,
				quantity: portfolios.quantity,
				avg: portfolios.averagePrice,
				company: {
					name: companies.name,
					symbol: companies.symbol,
				},
			})
			.from(portfolios)
			.leftJoin(companies, eq(portfolios.companyId, companies.id))
			.where(eq(portfolios.userId, userId));

		return rows.map((row) => ({
			id: row.id,
			company_id: row.company_id,
			quantity: row.quantity,
			avg: row.avg,
			stock_id: row.company?.symbol || '',
			company: row.company,
		})) as unknown as PortfolioWithCompany[];
	}

	async updateByUser(userId: string, data: NewPortfolio): Promise<void> {
		if (!data.company_id) throw new Error('company_id is required for update');

		const now = getZonedDate();

		const result = await db
			.update(portfolios)
			.set({
				...data,
			})
			.where(
				and(
					eq(portfolios.userId, userId),
					eq(portfolios.companyId, data.company_id)
				)
			)
			.returning({ id: portfolios.id });

		if (result.length === 0) {
			throw new Error(`Portfolio not found for userId: ${userId} and company_id ${data.company_id}`);
		}
	}

	async deleteByUser(userId: string, portfolioId: number): Promise<void> {
		await db
			.delete(portfolios)
			.where(
				and(
					eq(portfolios.userId, userId),
					eq(portfolios.id, portfolioId)
				)
			);
	}

	async createByUser(userId: string, data: NewPortfolio): Promise<void> {
		await db.insert(portfolios).values({
			userId: userId,
			companyId: data.company_id!,
			quantity: data.quantity || 0,
			averagePrice: data.average_price || '0.00',
		});
	}
}

export default new PortfolioService();