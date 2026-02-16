import 'reflect-metadata'
import { db } from './db/pg'
import 'dotenv/config';
import { startTradeWorker } from './workers/tradeWorker';
import { startAiWorker } from './workers/aiWorker '
import { connectRedis } from './modules/redis';
import app from './app'

const port = Number(process.env.PORT)

let server: any;

async function bootstrap() {
	try {
		await Promise.all([
			db.execute('SELECT 1'),
			connectRedis()
		]);

		console.log('📊 資料庫連線成功')

		if (process.env.NODE_ENV == 'test') return
		await startTradeWorker();
		await startAiWorker();

		console.log('🔧 正在啟動 HTTP 伺服器...')
		server = app.listen(port, () => {
			console.log(`🚀 Server is running at ${port}`)
		})

		server.on('error', (error: any) => {
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

const shutdown = async (signal: string) => {
	console.log(`\n收到了 ${signal} 訊號，正在啟動優雅關閉...`);

	// 設定 5 秒強制結束定時器，避免程序卡死
	const forceExitTimeout = setTimeout(() => {
		console.error('❌ 關閉超時，強制結束程序');
		process.exit(1);
	}, 5000);

	try {
		// A. 停止接收新的 HTTP 請求
		if (server) {
			await new Promise((resolve) => server.close(resolve));
			console.log('✅ HTTP 伺服器已停止');
		}

		// B. 關閉 Redis 連線 (假設你在 redis 模組有導出 quit)
		const { default: redisClient } = await import('./modules/redis');
		if (redisClient.isOpen) {
			await redisClient.quit();
			console.log('✅ Redis 連線已關閉');
		}

		console.log('👋 服務已完全關閉');
		clearTimeout(forceExitTimeout);
		process.exit(0);
	} catch (err) {
		console.error('❌ 關閉過程中發生錯誤:', err);
		process.exit(1);
	}
};

if (process.env.NODE_ENV !== 'test') {
	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (process.env.NODE_ENV !== 'test') {
	bootstrap();
}

export { app, bootstrap, shutdown };