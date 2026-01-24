import Joi from 'joi'

const createSchema = Joi.object({
	companyId: Joi.number().required(),
	tradeType: Joi.string().valid('buy', 'sell').required(),
	quantity: Joi.number().integer().positive().required(),
	price: Joi.number().precision(2).positive().required(),
	tradeDate: Joi.date().iso().required(),
})

const getAllSchema = Joi.object({
	page: Joi.number().integer().min(1).default(1),
	size: Joi.number().integer().min(1).max(100).default(10),
})

const bulkCreateSchema = Joi.array().items(createSchema).min(1).messages({
	'array.base': '批量創建資料必須是一個陣列',
	'array.min': '批量創建陣列中至少需要一個項目',
})

export { createSchema, getAllSchema, bulkCreateSchema }
