import express from 'express'
import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth'
import marketController from '../controller/marketPriceSnapshots'
import validate from '../middleware/validate'
import { getLastOneSchema, getByDaysSchema } from '../schemas/marketPriceSnapshotsSchema'
import redisCache from '../middleware/redisCache'
import redisConditionalCache from '../middleware/redisConditionalCache'
import { DAILY_UPDATE_CACHE_TTL, HOUR_CACHE_TTL } from '../constant/cache'

const router = express.Router()

const momentumRangeCacheCondition = (req: Request) => {
	const days = parseInt(req.params.days as string, 10)
	return [7, 30, 60].includes(days)
}

// 路由應由最具體到最通用排序，以避免動態路由攔截靜態路由

// ------ 靜態路由 ------

router.get('/', marketController.getAll)

router.get('/momentum', authMiddleware, marketController.getMomentum)
router.get('/weights', authMiddleware, redisCache(DAILY_UPDATE_CACHE_TTL), marketController.getWeights)
router.get('/quotes', marketController.getQuotes)

// 當 days 為 1 時，不需驗證 token 並強制快取，這是前端的需求, 1小時快取
router.get(
	'/momentum/range/1',
	// 手動設定 params.days 以便後續的 validate 和 controller 能正確取值
	(req, res, next) => {
		req.params.days = '1';
		return next();
	},
	validate(getByDaysSchema, 'params'),
	redisCache(HOUR_CACHE_TTL),
	marketController.getMarketIndicesByDays
)

router.get(
	'/momentum/range/3',
	(req, res, next) => {
		req.params.days = '3';
		return next();
	},
	validate(getByDaysSchema, 'params'),
	redisCache(DAILY_UPDATE_CACHE_TTL), //快取1天
	marketController.getMarketIndicesByDays
)


// ------ 動態路由 ------

router.get('/last/:symbol', validate(getLastOneSchema, 'params'), marketController.getLastSnapshotBySymbol)

router.get(
	'/momentum/range/:days',
	authMiddleware,
	validate(getByDaysSchema, 'params'),
	redisConditionalCache(DAILY_UPDATE_CACHE_TTL, momentumRangeCacheCondition),
	marketController.getMarketIndicesByDays
)

// 這個最通用的動態路由必須放在最後
router.get('/:symbol', marketController.getMarketDataBySymbol)

export default router 