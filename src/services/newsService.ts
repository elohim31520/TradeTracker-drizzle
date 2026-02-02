import { db } from '../db/pg'
import { news as newsTable } from '../db/schema'
import { NewNews } from '../types/news'
import { eq, desc, count } from 'drizzle-orm'
import crypto from 'crypto'

class NewsService {
	private generateHash(content: string): string {
		return crypto.createHash('md5').update(content).digest('hex')
	}

	async getAllNews({ page, size, status }: any) {
		const offset = (page - 1) * size
		const whereClause = status ? eq(newsTable.status, status) : undefined

		const [data, totalResult] = await Promise.all([
			db.select()
				.from(newsTable)
				.where(whereClause)
				.limit(size)
				.offset(offset)
				.orderBy(desc(newsTable.createdAt)),
			db.select({ total: count() })
				.from(newsTable)
				.where(whereClause)
		])

		return {
			count: totalResult[0].total,
			rows: data
		}
	}

	async getNewsById(id: number) {
		const result = await db.select().from(newsTable).where(eq(newsTable.id, id))
		return result[0] || null
	}

	async createNews(newsData: NewNews) {
		const newsWithHash = {
			...newsData,
			contentHash: this.generateHash(newsData.content)
		} as typeof newsTable.$inferInsert;

		const result = await db.insert(newsTable)
			.values(newsWithHash)
			.returning()

		return result[0]
	}

	async bulkCreateNews(newsList: NewNews[]) {
		const newsWithHashes = newsList.map(item => ({
			...item,
			contentHash: this.generateHash(item.content)
		})) as (typeof newsTable.$inferInsert)[];

		return await db.insert(newsTable)
			.values(newsWithHashes)
			.returning()
	}

	async updateNews(id: number, news: Partial<NewNews>) {
		let updateData = { ...news }

		if (news.content) {
			updateData.contentHash = this.generateHash(news.content)
		}

		const result = await db.update(newsTable)
			.set(updateData)
			.where(eq(newsTable.id, id))
			.returning()

		return result[0] || null
	}

	async deleteNews(id: number) {
		const result = await db.delete(newsTable)
			.where(eq(newsTable.id, id))
			.returning({ deletedId: newsTable.id })

		return result.length > 0
	}
}

export default new NewsService()