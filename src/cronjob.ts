import { CronJob } from 'cron';
import { crawlMarketPriceSnapshots } from './modules/crawler/yPriceSnapshots'
import { crawlStockPrices } from './modules/crawler/yStockPrices'
import { generateAndSaveNews } from './modules/aiNewsGenerator';
import { generateAndCacheMarketSummary } from './modules/marketSummarizer'
import { ensureCardPackPool, generateAndCacheCardPack } from './modules/cardPack/cardPackGenerator'
import { connectRedis } from './modules/redis';
import { crawlCompanyMetrics } from './modules/crawler/yfiance'
import logger from './modules/logger'

interface CronConfig {
	schedule: string;
	mission: () => Promise<void> | void;
}

const redisReady = connectRedis()

function createCronJob({ schedule, mission }: CronConfig): CronJob {
	if (!schedule) {
		throw new Error('Schedule is required');
	}

	const name = mission.name || schedule;

	return CronJob.from({
		cronTime: schedule,
		onTick: mission,
		start: true,
		timeZone: 'Asia/Taipei',
		name,
		// mission throw / reject 時，cron 套件預設只會 console.error，不會進 logs/，
		// 也就不會被 backup_logs.sh 同步到 GCS。改走 winston，寫進 logs/application-*.log
		errorHandler: (err) => logger.error(`[Cron] ${name} 執行失敗`, err),
	});
}

if (process.env.NODE_ENV === 'production') {
	// 週日周一不取 因為周末休市，eps fpe 數值不會變
	createCronJob({
		schedule: '0 15 * * 2-6',
		mission: crawlCompanyMetrics,
	})

	createCronJob({
		schedule: '*/10 * * * *',
		mission: crawlMarketPriceSnapshots,
	})

	/**
	 * 美股收盤後更新 stock prices（收盤時間：台北冬令 05:00、夏令 04:00，台北沒有夏令時間）。
	 * quote() 是即時報價，收盤後 regularMarketPrice 就固定為收盤價，不需等 Yahoo 批次更新；
	 * 06:00 留 1~2 小時緩衝，且爬蟲遇到盤中（marketState=REGULAR）會整批略過，不會把盤中價當收盤價。
	 * 爬完會清掉 /stock/today、/stock/breadth 的快取。
	 * 週日周一不取 因為周末休市
	 */
	createCronJob({
		schedule: '0 6 * * 2-6',
		mission: crawlStockPrices,
	})

	createCronJob({
		schedule: '55 11 * * *',
		mission: generateAndSaveNews,
	})

	createCronJob({
		schedule: '50 7 * * *',
		mission: generateAndCacheMarketSummary,
	})

	/**
	 * 卡包的卡池：美股收盤後，台北週二到週六 06:30（對應美股週一到週五的收盤，與股價爬蟲同一組日子）。
	 * 自己從 Yahoo 取行情，不依賴 06:00 的股價爬蟲；盤中會自動略過，當天已有池子也會略過，重跑安全。
	 */
	createCronJob({
		schedule: '30 6 * * 2-6',
		mission: generateAndCacheCardPack,
	})

	// 容器啟動時如果還沒有卡池（第一次部署、Redis 被清掉、排程連續失敗到過期），補生成一次，不用等到下一個排程。
	// 在背景跑，不擋住上面的排程；已經有卡池就什麼都不做。開發環境不補（要生成請用 script/generateCardPack.ts）
	redisReady.then(ensureCardPackPool).catch((err) => logger.error('[CardPack] 啟動時補生成卡池失敗', err))
} else {
	createCronJob({
		schedule: '09 17 * * *',
		mission: crawlCompanyMetrics,
	})

	createCronJob({
		schedule: '*/10 * * * *',
		mission: crawlMarketPriceSnapshots,
	})

	createCronJob({
		schedule: '59 * * * *',
		mission: crawlStockPrices,
	})

	createCronJob({
		schedule: '24 10 * * *',
		mission: generateAndSaveNews,
	})

	createCronJob({
		schedule: '25 21 * * *',
		mission: generateAndCacheMarketSummary,
	})

	createCronJob({
		schedule: '45 21 * * *',
		mission: generateAndCacheCardPack,
	})
}
