export default {
	MISSING_PARAMS: { code: 400, message: '缺少參數' },
	UNAUTHORIZED: { code: 401, message: '請先登入' },
	MISSING_REQUIRED_PARAM: { code: 400, message: '缺少必要參數' },
	SERVER_ERROR: { code: 500, message: '伺服器錯誤' },
	DUPLICATE_ACCOUNT: { code: 409, message: '帳號已存在' },
	TOO_MANY_REQUESTS: { code: 429, message: 'Too Many Requests' },
	WRONG_VALUE_FOR_FIELD: { code: 500, message: '欄位值格式錯誤' },
}
