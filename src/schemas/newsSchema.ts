import Joi from 'joi'

const ALLOWED_STATUSES = ['draft', 'published', 'archived']

const getAllNewsQuerySchema = Joi.object({
    page: Joi.number()
        .integer()
        .min(1)
        .optional()
        .messages({
            'number.base': 'page 必須是一個數字',
            'number.integer': 'page 必須是一個整數',
            'number.min': 'page 必須大於或等於 1'
        }),

    size: Joi.number()
        .integer()
        .min(1)
        .optional()
        .messages({
            'number.base': 'size 必須是一個數字',
            'number.integer': 'size 必須是一個整數',
            'number.min': 'size 必須大於或等於 1'
        }),

    status: Joi.string()
        .valid(...ALLOWED_STATUSES)
        .optional()
        .messages({
            'string.base': 'status 必須是一個字串',
            'any.only': `status 必須是以下之一: ${ALLOWED_STATUSES.join(', ')}`
        })
});

const createSchema = Joi.object({
	content: Joi.string().trim().required().messages({
		'any.required': '內容為必填項',
		'string.empty': '內容不能為空',
	}),
	contentEn: Joi.string().trim().allow(null, '').optional(),
	status: Joi.string()
		.valid(...ALLOWED_STATUSES)
		.optional()
		.messages({
			'any.only': `狀態必須是以下之一: ${ALLOWED_STATUSES.join(', ')}`,
		}),
	publishedAt: Joi.date().iso().allow(null).optional(),
	viewCount: Joi.number().integer().min(0).optional(),
	isTop: Joi.boolean().optional(),
})

const bulkCreateSchema = Joi.array().items(createSchema).min(1).messages({
	'array.base': '批量創建資料必須是一個陣列',
	'array.min': '批量創建陣列中至少需要一個項目',
})

const updateSchema = Joi.object({
	content: Joi.string().trim().optional().messages({
		'string.empty': '內容不能為空',
	}),
	contentEn: Joi.string().trim().allow(null, '').optional(),
	status: Joi.string()
		.valid(...ALLOWED_STATUSES)
		.optional()
		.messages({
			'any.only': `狀態必須是以下之一: ${ALLOWED_STATUSES.join(', ')}`,
		}),
	publishedAt: Joi.date().iso().allow(null).optional(),
	viewCount: Joi.number().integer().min(0).optional(),
	isTop: Joi.boolean().optional(),
})

const deleteSchema = Joi.object({
	id: Joi.string().required().messages({
		'any.required': 'ID 為必填項',
		'string.empty': 'ID 不能為空',
	}),
})

const idSchema = Joi.object({
	id: Joi.number().integer().positive().required().messages({
		'number.base': 'ID 必須是數字',
		'number.integer': 'ID 必須是整數',
		'number.positive': 'ID 必須是正數',
		'any.required': 'ID 參數不能為空',
	}),
})

export { updateSchema, deleteSchema, createSchema, bulkCreateSchema, idSchema, getAllNewsQuerySchema }
