const _ = require('lodash')
const fs = require('fs')
const path = require('path')
import iconv from 'iconv-lite'

export function generateRandomID(): string {
	return Math.random().toString(36).slice(2)
}

export function uuidv4(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		var r = (Math.random() * 16) | 0,
			v = c == 'x' ? r : (r & 0x3) | 0x8
		return v.toString(16)
	})
}

export function deleteFolderRecursive(myPath: string): void {
	if (fs.existsSync(myPath)) {
		fs.readdirSync(myPath).forEach((file: string, index: number) => {
			const curPath = path.join(myPath, file)
			if (fs.lstatSync(curPath).isDirectory()) {
				deleteFolderRecursive(curPath)
			} else {
				fs.unlinkSync(curPath)
			}
		})
		fs.rmdirSync(myPath)
		console.log('deleted: ', myPath)
	}
}

export function decodeBuffer(buffer: Buffer | ArrayBuffer, encoding: string = 'utf-8'): string {
	return iconv.decode(Buffer.from(buffer), encoding)
}
