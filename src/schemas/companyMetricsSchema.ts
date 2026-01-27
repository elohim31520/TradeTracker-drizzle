import Joi from 'joi'

const getBySymbolSchema = Joi.object({
	symbol: Joi.string().required().min(1),
})

const getBySymbolWithDaysSchema = Joi.object({
	days: Joi.number().integer().min(1),
})

export { getBySymbolSchema, getBySymbolWithDaysSchema } 