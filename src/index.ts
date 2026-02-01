import 'reflect-metadata'
import express, { Request, Response } from 'express'
import { db } from './db/pg'
import userRoutes from './routes/users'
import tradeRoutes from './routes/trade'
import adminRoutes from './routes/admin'
import companyMetrics from './routes/companyMetrics'
import portfolios from './routes/portfolio'
import stockRoutes from './routes/stock'
import errorHandler from './middleware/errorHandler'
import 'dotenv/config';
import { startTradeWorker } from './workers/tradeWorker';

const app = express()
const port = Number(process.env.PORT)
app.use(express.json({ type: ['application/json', 'application/json; charset=UTF-8'] }))

app.use('/users', userRoutes)
app.use('/trades', tradeRoutes)
app.use('/admins', adminRoutes)
app.use('/company-metrics', companyMetrics)
app.use('/portfolio', portfolios)
app.use('/stock', stockRoutes)

app.use(errorHandler)

async function bootstrap() {
	try {
		await db.execute('SELECT 1')
		console.log('📊 資料庫連線成功')

		if (process.env.NODE_ENV == 'test') return

		startTradeWorker();

		console.log('🔧 正在啟動 HTTP 伺服器...')
		const server = app.listen(port, 'localhost', () => {
			console.log(`🚀 Server is running at http://localhost:${port}`)
		})

		server.on('error', (error) => {
			console.error('❌ 伺服器啟動錯誤:', error)
		})

		server.on('listening', () => {
			console.log('✅ 伺服器成功監聽端口', port)
		})
	} catch (error) {
		console.error('❌ 伺服器啟動失敗:', error)
		process.exit(1)
	}
}

bootstrap()

export default app