export class AppError extends Error {
	public statusCode: number
	public status: string

	constructor(message: string, statusCode: number) {
		super(message)
		this.statusCode = statusCode
		this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error'

		Error.captureStackTrace(this, this.constructor)
	}
}

export class ClientError extends AppError {
	constructor(message: string) {
		super(message, 400)
	}
}

export class AuthError extends AppError {
	constructor(message: string = 'Unauthorized') {
		super(message, 401)
	}
}

export class ServerError extends AppError {
	constructor(message: string) {
		super(message, 500)
	}
}

export class NotFoundError extends AppError {
	constructor(message: string = 'Page Not Found') {
		super(message, 404)
	}
}

export class ForbiddenError extends AppError {
	constructor(message: string = 'Forbidden!') {
		super(message, 403)
	}
}

export class ConflictError extends AppError {
	constructor(message: string = 'Conflict') {
		super(message, 409)
	}
}
