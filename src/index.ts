import 'reflect-metadata'
import express, { Request, Response } from 'express'
import { db } from './db/pg'
import userRoutes from './routes/users'
import tradeRoutes from './routes/trade'
import errorHandler from './middleware/errorHandler'
import 'dotenv/config';

const app = express()
const port = Number(process.env.PORT)
app.use(express.json({ type: ['application/json', 'application/json; charset=UTF-8'] }))

function setupRoutes() {
	app.use('/users', userRoutes)
	app.use('/trades', tradeRoutes)
}

async function bootstrap() {
	try {
		await db.execute('SELECT 1')
		console.log('📊 資料庫連線成功')

		setupRoutes()

		app.use(errorHandler)

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

// Export app for testing
export { app, setupRoutes }

bootstrap()
