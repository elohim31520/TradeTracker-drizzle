import { CronJob } from 'cron';
import { crawlMarketPriceSnapshots } from './modules/crawler/priceSnapshots'
import { crawlCompanyMetrics } from './modules/crawler/companyMetrics'
import { crawlStockPrices } from './modules/crawler/stockPrices'
import { crawlTechNews } from './modules/crawler/technews'

interface CronConfig {
    schedule: string;
    mission: () => Promise<void> | void;
}

function createCronJob({ schedule, mission }: CronConfig): CronJob {
    if (!schedule) {
        throw new Error('Schedule is required');
    }
    
    const job = new CronJob(
        schedule, 
        mission, 
        null, 
        true, 
        'Asia/Taipei'
    );

    return job;
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
	 * 早上更新 stock prices，原因是爬蟲的網站可能是美東晚上才更新
	 * 週日周一不取 因為周末休市
	 */
	createCronJob({
		schedule: '0 10 * * 2-6',
		mission: crawlStockPrices,
	})

	createCronJob({
		schedule: '41 */6 * * *',
		mission: crawlTechNews,
	})
} else {
	createCronJob({
		schedule: '0 15 * * *',
		mission: crawlCompanyMetrics,
	})

	createCronJob({
		schedule: '*/10 * * * *',
		mission: crawlMarketPriceSnapshots,
	})

	createCronJob({
		schedule: '10 * * * *',
		mission: crawlStockPrices,
	})

	createCronJob({
		schedule: '41 * * * *',
		mission: crawlTechNews,
	})
}
