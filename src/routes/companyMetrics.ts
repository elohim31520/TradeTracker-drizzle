import express, { Router } from 'express'
import companyMetricsController from '../controller/companyMetrics'
import validate from '../middleware/validate'
import { getBySymbolSchema, getBySymbolWithDaysSchema } from '../schemas/companyMetricsSchema'
import redisCache from '../middleware/redisCache'
import { DAILY_UPDATE_CACHE_TTL } from '../constant/cache'

const router: Router = express.Router()

router.get(
    '/:symbol',
    validate(getBySymbolSchema, 'params'),
    validate(getBySymbolWithDaysSchema, 'query'),
    redisCache(DAILY_UPDATE_CACHE_TTL),
    companyMetricsController.getBySymbol
)

export default router 