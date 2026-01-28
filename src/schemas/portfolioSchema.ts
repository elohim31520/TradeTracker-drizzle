import Joi from 'joi'

// company_id 與 user_id 是唯一索引，不會重複，所以不用傳入 portfolio的id
const updateSchema = Joi.object({
	company_id: Joi.number().required(),
	quantity: Joi.number().precision(2).optional(),
    average_price: Joi.number().precision(2).optional(),
})

const createSchema = Joi.object({
	company_id: Joi.number().required(),
	quantity: Joi.number().precision(2).optional(),
    average_price: Joi.number().precision(2).optional(),
})

const deleteSchema = Joi.object({
	id: Joi.string().required(),
})

export { updateSchema, deleteSchema, createSchema }
