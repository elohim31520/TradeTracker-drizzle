const fs = require('fs')
const path = require('path')
const privateKEY = fs.readFileSync(path.join(process.cwd(), 'secrets', 'private.key'), 'utf8')
const jwt = require('jsonwebtoken')
const cryptoJS = require('crypto-js')

interface TokenOption {
	algorithm?: string
	expiresIn?: string
}

interface payload {
	name: string
	id: string
	email: string
}

export function generateToken(payload: payload, option: TokenOption = {}): string {
	const { algorithm = 'RS256', expiresIn = '24h' } = option
	const token = jwt.sign(payload, privateKEY, { algorithm, expiresIn })
	return token
}

export function generateSalt(): string {
	// 生成一個16字節（128位）的隨機salt
	var salt = cryptoJS.lib.WordArray.random(16)
	// 輸出16進位格式的salt
	return salt.toString(cryptoJS.enc.Hex)
}

export function sha256(pwd: string, salt: string): string {
	let message = pwd + salt
	return cryptoJS.SHA256(message).toString()
}

export function md5Encode(message: string): string {
	var hash = cryptoJS.MD5(message)
	return hash.toString(cryptoJS.enc.Hex)
}
