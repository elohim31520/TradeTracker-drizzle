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

/**
 * 解析 AI 回傳的 JSON 文字。
 * 先去掉 markdown 圍欄後直接解析；失敗時退而從第一個開頭符號（{ 或 [）開始，
 * 由後往前找能成功解析的結尾符號，容忍模型在前後多加說明文字或 [1] 這類引用。
 * expect 可指定預期是物件或陣列，避免前面說明文字裡的括號被誤認成開頭
 */
export function parseAiJson(text: string, expect?: 'array' | 'object'): unknown {
	const cleaned = text.replace(/```json|```/g, '').trim()
	try {
		return JSON.parse(cleaned)
	} catch {
		const opener = expect === 'array' ? '[' : expect === 'object' ? '{' : undefined
		const start = opener ? cleaned.indexOf(opener) : cleaned.search(/[\[{]/)
		if (start !== -1) {
			const closer = cleaned[start] === '{' ? '}' : ']'
			for (let end = cleaned.lastIndexOf(closer); end > start; end = cleaned.lastIndexOf(closer, end - 1)) {
				try {
					return JSON.parse(cleaned.slice(start, end + 1))
				} catch {
					// 這個結尾符號不是 JSON 的結尾，繼續往前找
				}
			}
		}
		throw new Error('回傳內容中找不到有效的 JSON')
	}
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