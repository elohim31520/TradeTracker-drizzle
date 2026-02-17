import Joi from 'joi'

const createSchema = Joi.object({
	stockSymbol: Joi.string().required(),
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

const imageUploadSchema = Joi.object({
	fieldname: Joi.string().required(),
	originalname: Joi.string().required(),
	encoding: Joi.string().required(),
	mimetype: Joi.string().valid('image/jpeg', 'image/png', 'image/webp').required(),
	size: Joi.number().max(5 * 1024 * 1024).required(), // 限制 5MB
	buffer: Joi.any().required()
}).unknown(); // 允許其他 Multer 產生的欄位

const aiJobSchema = Joi.object({
	jobId: Joi.string().uuid().required(),
})

export { createSchema, getAllSchema, bulkCreateSchema, imageUploadSchema, aiJobSchema }
