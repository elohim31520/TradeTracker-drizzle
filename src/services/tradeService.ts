import { db } from '../db/pg'
import { stockTrades, companies } from '../db/schema'
import { NewTrade, Trade, TradeWithCompany, GetAllTradesParams, PaginatedTrades } from '../types/trade'
import { ClientError } from '../modules/errors'
import { eq, and, desc, sql } from 'drizzle-orm'

class TradeService {
	async create(data: NewTrade, tx: any = db): Promise<Trade[]> {
		return await tx.insert(stockTrades).values(data).returning()
	}

	async bulkCreate(data: NewTrade[], tx: any = db): Promise<Trade[]> {
		return await tx.insert(stockTrades).values(data).returning()
	}

	async getAll({ userId, page, size }: GetAllTradesParams): Promise<PaginatedTrades> {
		const offset = (page - 1) * size

		// 獲取總數
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)` })
			.from(stockTrades)
			.where(eq(stockTrades.userId, userId))

		// 獲取分頁數據
		const trades = await db
			.select({
				id: stockTrades.id,
				company_id: stockTrades.companyId,
				quantity: stockTrades.quantity,
				price: stockTrades.price,
				type: stockTrades.tradeType,
				date: stockTrades.tradeDate,
				company_name: companies.name,
				company_symbol: companies.symbol,
			})
			.from(stockTrades)
			.leftJoin(companies, eq(stockTrades.companyId, companies.id))
			.where(eq(stockTrades.userId, userId))
			.orderBy(desc(stockTrades.tradeDate))
			.limit(size)
			.offset(offset)

		const data: TradeWithCompany[] = trades.map((trade) => ({
			id: trade.id,
			company_id: trade.company_id,
			quantity: trade.quantity,
			price: trade.price,
			type: trade.type,
			date: trade.date,
			stock_id: trade.company_symbol || '',
			company: trade.company_name && trade.company_symbol ? {
				name: trade.company_name,
				symbol: trade.company_symbol,
			} : null,
		}))

		const totalPages = Math.ceil(count / size)

		return {
			data,
			total: count,
			page,
			size,
			totalPages,
		}
	}

	async getById(id: number): Promise<Trade | null> {
		const [trade] = await db.select().from(stockTrades).where(eq(stockTrades.id, id)).limit(1)
		return trade || null
	}

	async update(id: number, data: Partial<NewTrade>): Promise<Trade> {
		const [updatedTrade] = await db
			.update(stockTrades)
			.set(data)
			.where(eq(stockTrades.id, id))
			.returning()

		if (!updatedTrade) {
			throw new ClientError('找不到交易紀錄，請確認id參數')
		}

		return updatedTrade
	}

	async delete(id: number, userId: string): Promise<void> {
		const result = await db
			.delete(stockTrades)
			.where(and(eq(stockTrades.id, id), eq(stockTrades.userId, userId)))
			.returning()

		if (result.length === 0) {
			throw new ClientError('找不到交易紀錄，或紀錄已被刪除')
		}
	}
}

export default new TradeService()
