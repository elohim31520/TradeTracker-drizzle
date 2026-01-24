interface ResponseData<T> {
	code: number
	message: string
	success: boolean
	data: T
}

interface FailResponseData extends Omit<ResponseData<null>, 'code'> {
	code: number | null
}

export function success<T>(data: T, message?: string): ResponseData<T> {
	return {
		code: 200,
		success: true,
		data,
		message: '成功',
		...(message ? { message } : {}),
	}
}

export function fail(code: number | null, message: string = 'error'): FailResponseData {
	return {
		success: false,
		data: null,
		code,
		message,
	}
}
