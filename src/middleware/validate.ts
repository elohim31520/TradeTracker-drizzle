import _ from 'lodash'
import { ClientError } from '../modules/errors'
import Joi from 'joi'
import { Request, Response, NextFunction } from 'express'

const validate = (schema: Joi.Schema, property: string = 'body') => {
	return (req: Request, res: Response, next: NextFunction) => {
		const obj = req[property as keyof Request]
		const result = schema.validate(obj)
		const { error } = result
		if (error) {
			const errorMessage = _.get(error, 'details[0].message', 'Validation error')
			return next(new ClientError(errorMessage))
		}
		next()
	}
}

export default validate
