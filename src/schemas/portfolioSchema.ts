import Joi from 'joi'

// company_id 與 user_id 是唯一索引，不會重複，所以不用傳入 portfolio的id
const updateSchema = Joi.object({
	stockSymbol: Joi.string().required(),
	quantity: Joi.number().precision(2).optional(),
	averagePrice: Joi.number().precision(2).optional(),
})

const createSchema = Joi.object({
	stockSymbol: Joi.string().required(),
	quantity: Joi.number().precision(2).optional(),
	averagePrice: Joi.number().precision(2).optional(),
})

const deleteSchema = Joi.object({
	id: Joi.string().required(),
})

export { updateSchema, deleteSchema, createSchema }
