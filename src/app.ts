import 'reflect-metadata'
import express from 'express'
import userRoutes from './routes/users'
import tradeRoutes from './routes/trade'
import adminRoutes from './routes/admin'
import companyMetrics from './routes/companyMetrics'
import portfolios from './routes/portfolio'
import stockRoutes from './routes/stock'
import newsRoutes from './routes/news'
import marketRoutes from './routes/market'
import balanceRoutes from './routes/balances'
import errorHandler from './middleware/errorHandler'
import 'dotenv/config';
import helmet from 'helmet'
import cors from 'cors'
import logger from './modules/logger'

const app = express()

logger.info(`CORS_ORIGIN environment variable is: ${process.env.CORS_ORIGIN}`)

const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : []

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true)
            } else {
                logger.warn(`CORS blocked for origin: ${origin}`)
                callback(new Error('Not allowed by CORS'))
            }
        },
        optionsSuccessStatus: 200,
        maxAge: 86400,
    })
)
app.use(express.json({ type: ['application/json', 'application/json; charset=UTF-8'] }))
app.use(helmet());

app.use('/user', userRoutes)
app.use('/trade', tradeRoutes)
app.use('/admin', adminRoutes)
app.use('/company-metrics', companyMetrics)
app.use('/portfolio', portfolios)
app.use('/stock', stockRoutes)
app.use('/news', newsRoutes)
app.use('/market', marketRoutes)
app.use('/balance', balanceRoutes)

app.use(errorHandler)

export default app