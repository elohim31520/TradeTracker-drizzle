const _ = require('lodash')
const fs = require('fs')
const path = require('path')
import iconv from 'iconv-lite'
import redisClient from '../modules/redis';

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
	const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
	return iconv.decode(buf, encoding);
}


export const updateJobStatus = async (jobId: string, status: 'success' | 'failed' | 'pending', message?: string) => {
	try {
		await redisClient.set(`ai:trade:extraction:${jobId}`, JSON.stringify({
			status,
			...(message && { message }),
		}), { EX: 300 });
	} catch (err) {
		console.error(`Failed to update job status for ${jobId}:`, err);
	}
};