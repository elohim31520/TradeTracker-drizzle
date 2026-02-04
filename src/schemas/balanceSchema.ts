import Joi from 'joi'

const createBalanceSchema = Joi.object({
	balance: Joi.number().required(),
})

const updateBalanceSchema = Joi.object({
	balance: Joi.number().required(),
})

export { createBalanceSchema, updateBalanceSchema }
