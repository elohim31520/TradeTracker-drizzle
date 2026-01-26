import Joi from 'joi'

const createAdminSchema = Joi.object({
	userId: Joi.alternatives()
		.try(Joi.number(), Joi.string().pattern(/^\d+$/))
		.required(),
})

const deleteUserSchema = createAdminSchema

export { createAdminSchema, deleteUserSchema } 