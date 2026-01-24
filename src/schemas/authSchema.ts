import Joi from 'joi'

export const registerSchema = Joi.object({
	name: Joi.string().min(2).max(50).required().messages({
		'string.empty': '姓名不能為空',
		'string.min': '姓名至少需要 {#limit} 個字符',
		'string.max': '姓名不能超過 {#limit} 個字符',
		'any.required': '姓名是必填項'
	}),
	email: Joi.string().email().required().messages({
		'string.email': '請輸入有效的郵箱地址',
		'any.required': '郵箱是必填項'
	}),
	password: Joi.string().min(6).max(100).required().messages({
		'string.min': '密碼至少需要 {#limit} 個字符',
		'string.max': '密碼不能超過 {#limit} 個字符',
		'any.required': '密碼是必填項'
	})
})

export const loginSchema = Joi.object({
	email: Joi.string().email().required().messages({
		'string.email': '請輸入有效的郵箱地址',
		'any.required': '郵箱是必填項'
	}),
	password: Joi.string().required().messages({
		'any.required': '密碼是必填項'
	})
})

export const changePasswordSchema = Joi.object({
	oldPassword: Joi.string().required().messages({
		'any.required': '舊密碼是必填項'
	}),
	newPassword: Joi.string().min(6).max(100).required().messages({
		'string.min': '新密碼至少需要 {#limit} 個字符',
		'string.max': '新密碼不能超過 {#limit} 個字符',
		'any.required': '新密碼是必填項'
	})
})

export const googleLoginSchema = Joi.object({
	credential: Joi.string().required().messages({
		'any.required': 'Google credential 是必填項'
	})
})
