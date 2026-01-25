import { CronJob } from 'cron'; // 只需要這行
// import { crawlMarketIndex } from './modules/crawler/marketIndex'
import { crawlCompanyMetrics } from './modules/crawler/companyMetrics'
// import { crawlStockPrices } from './modules/crawler/stockPrices'
// import { crawlTechNews } from './modules/crawler/technews'

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
	createCronJob({
		schedule: '0 15 * * *',
		mission: crawlCompanyMetrics,
	})

	// createCronJob({
	// 	schedule: '*/10 * * * *',
	// 	mission: crawlMarketIndex,
	// })

	// // 早上更新 stock prices，原因是爬蟲的網站可能是美東晚上才更新
	// createCronJob({
	// 	schedule: '0 10 * * *',
	// 	mission: crawlStockPrices,
	// })

	// createCronJob({
	// 	schedule: '41 */6 * * *',
	// 	mission: crawlTechNews,
	// })
} else {
	createCronJob({
		schedule: '9 * * * *',
		mission: crawlCompanyMetrics,
	})

	// createCronJob({
	// 	schedule: '* * * * *',
	// 	mission: crawlMarketIndex,
	// })

	// createCronJob({
	// 	schedule: '0 * * * *',
	// 	mission: crawlStockPrices,
	// })

	// createCronJob({
	// 	schedule: '41 * * * *',
	// 	mission: crawlTechNews,
	// })
}
