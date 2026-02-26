import { db } from '../db/pg';
import { portfolios, companies } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { PortfolioWithCompany, NewPortfolio } from '../types/portfolio';

export async function getAllByUserId(userId: string): Promise<PortfolioWithCompany[]> {
	const rows = await db
		.select({
			id: portfolios.id,
			companyId: portfolios.companyId,
			quantity: portfolios.quantity,
			averagePrice: portfolios.averagePrice,
			userId: portfolios.userId,
			createdAt: portfolios.createdAt,
			updatedAt: portfolios.updatedAt,
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
		companyId: row.companyId,
		quantity: row.quantity,
		averagePrice: row.averagePrice,
		userId: row.userId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		stockSymbol: row.company?.symbol || '',
		company: row.company,
	}));
}

export async function updateByUser(userId: string, data: NewPortfolio): Promise<void> {
	if (!data.stockSymbol) throw new Error('stockSymbol is required for update');

	// 根据 stockSymbol 查找 companyId
	const [company] = await db
		.select({ id: companies.id })
		.from(companies)
		.where(eq(companies.symbol, data.stockSymbol))
		.limit(1);

	if (!company) {
		throw new Error(`Company not found for stockSymbol: ${data.stockSymbol}`);
	}

	const updateData: Partial<{
		quantity: string;
		averagePrice: string;
	}> = {};

	if (data.quantity !== undefined) {
		updateData.quantity = data.quantity.toString();
	}
	if (data.averagePrice !== undefined) {
		updateData.averagePrice = data.averagePrice.toString();
	}

	const result = await db
		.update(portfolios)
		.set(updateData)
		.where(
			and(
				eq(portfolios.userId, userId),
				eq(portfolios.companyId, company.id)
			)
		)
		.returning({ id: portfolios.id });

	if (result.length === 0) {
		throw new Error(`Portfolio not found for userId: ${userId} and stockSymbol: ${data.stockSymbol}`);
	}
}

export async function deleteByUser(userId: string, portfolioId: number): Promise<void> {
	const result = await db
		.delete(portfolios)
		.where(and(eq(portfolios.userId, userId), eq(portfolios.id, portfolioId)))
		.returning({ id: portfolios.id });

	if (result.length === 0) {
		throw new Error(`Portfolio not found for userId: ${userId} and portfolioId: ${portfolioId}`);
	}
}

export async function createByUser(userId: string, data: NewPortfolio): Promise<void> {
	// 根据 stockSymbol 查找 companyId
	const [company] = await db
		.select({ id: companies.id })
		.from(companies)
		.where(eq(companies.symbol, data.stockSymbol))
		.limit(1);

	if (!company) {
		throw new Error(`Company not found for stockSymbol: ${data.stockSymbol}`);
	}

	await db.insert(portfolios).values({
		userId: userId,
		companyId: company.id,
		quantity: (data.quantity || 0).toString(),
		averagePrice: (data.averagePrice ?? 0).toFixed(2),
	});
}

export default {
	getAllByUserId,
	updateByUser,
	deleteByUser,
	createByUser,
}