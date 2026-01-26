import Joi from 'joi'

const createAdminSchema = Joi.object({
	userId: Joi.string().uuid().required(),
});

const deleteUserSchema = createAdminSchema

export { createAdminSchema, deleteUserSchema } 