import { CronJob } from 'cron';
import { crawlMarketPriceSnapshots } from './modules/crawler/priceSnapshots'
import { crawlStockPrices } from './modules/crawler/yStockPrices'
import { generateAndSaveNews } from './modules/aiNewsGenerator';
import { generateAndCacheMarketSummary } from './modules/marketSummarizer'
import { connectRedis } from './modules/redis';
import { crawlCompanyMetrics } from './modules/crawler/yfiance'
import logger from './modules/logger'

interface CronConfig {
	schedule: string;
	mission: () => Promise<void> | void;
}

connectRedis()

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
}
