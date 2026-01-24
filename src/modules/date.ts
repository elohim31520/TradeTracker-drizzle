import {
	format,
	subMonths,
	subDays,
	intervalToDuration,
	isWithinInterval,
	parse,
	differenceInMilliseconds,
	differenceInSeconds,
	differenceInMinutes,
	differenceInHours,
	differenceInDays,
	differenceInWeeks,
	differenceInMonths,
	differenceInYears,
	isValid,
	setMonth,
	startOfDay,
	endOfDay,
} from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import _ from 'lodash'

const DEFAULT_TIME_ZONE = 'UTC'
const EST_TIME_ZONE = 'America/New_York'

export function convertToEST(dateString: string | number | Date): string {
	const date = normalizeDate(dateString)
	if (!date) {
		throw new Error('Invalid date provided to convertToEST')
	}

	const estDate = toZonedTime(date, EST_TIME_ZONE)
	return format(estDate, 'yyyy-MM-dd HH:mm:ss')
}

export function getCurrentDateTime() {
	return format(getZonedDate(), 'yyyy/MM/dd HH:mm:ss')
}

export function getCurrentDate() {
	return format(getZonedDate(), 'yyyy/MM/dd')
}

export function getCurrentTime() {
	return format(getZonedDate(), 'HH:mm:ss')
}
export function subtractMonths(date: Date, month: number) {
	return subMonths(date, month)
}

export function subtractDays(date: Date, days: number) {
	return subDays(date, days)
}

const defaultOptions = {
	showDay: true,
	showTotalHours: false,
	hideZeroHours: false,
}

export class Countdown {
	deadline: Date
	options: {
		showDay: boolean
		showTotalHours: boolean
		hideZeroHours: boolean
	}
	constructor(
		deadline: string | Date,
		options: Partial<typeof defaultOptions> = {}
	) {
		if (typeof deadline == 'string') {
			this.deadline = parse(deadline, 'yyyy-MM-dd HH:mm:ss', getZonedDate())
		} else if (_.isDate(deadline)) {
			this.deadline = getZonedDate(deadline)
		} else {
			throw new Error('deadline must be a type of string or date!')
		}
		this.options = {
			...defaultOptions,
			...options,
		}
	}

	get() {
		const now = getZonedDate()
		const remainingSeconds = differenceInSeconds(this.deadline, now)
		if (remainingSeconds <= 0) return null //倒時結束
		const duration = intervalToDuration({
			start: now,
			end: this.deadline,
		})

		let hours: number

		// 計算總小時數或常規小時數
		if (this.options.showTotalHours) {
			hours = Math.floor(remainingSeconds / 3600)
		} else {
			hours = duration.hours ?? 0
		}

		const minutes = duration.minutes ?? 0
		const seconds = duration.seconds ?? 0

		const days =
			this.options.showDay && !this.options.showTotalHours
				? `${_.defaultTo(duration.days, 0)}天 `
				: ''

		// 判斷是否在小時為零時隱藏小時部分
		const hoursDisplay =
			this.options.hideZeroHours && hours === 0
				? ''
				: `${padZero(hours)}:`

		const result = `${days}${hoursDisplay}${padZero(minutes)}:${padZero(
			seconds
		)}`
		return result
	}
}

export function padZero(str: string | number) {
	return _.padStart(String(str), 2, '0')
}

/**
 * 檢查當前時間是否在指定的時間範圍內
 *
 * @param {number|string} startTime - 開始時間的時間戳
 * @param {number|string} endTime - 結束時間的時間戳
 * @returns {boolean}
 */
export function isBetween(
	startTime: string | number | Date,
	endTime: string | number | Date
) {
	const start = normalizeDate(startTime)
	const end = normalizeDate(endTime)
	if (!start || !end) return false
	return isWithinInterval(getZonedDate(), {
		start,
		end,
	})
}

/**
 * 將時間戳格式化為指定格式的日期字串
 *
 * @param {number|string} timestamp - 要格式化的時間戳 (不只有timestamp，有定義在 patterns的 都支持)
 * @param {string} [formatString='yyyy年MM月dd日'] - 可選的日期格式字串，預設值為 'yyyy年MM月dd日'
 * @returns {string} 格式化後的日期字串
 */
export function formatDate(
	timestamp: string | number | Date,
	formatString = 'yyyy年MM月dd日',
	options = {}
) {
	const date = normalizeDate(timestamp)
	if (!date) {
		if (typeof timestamp === 'string') return timestamp
		return ''
	}
	return format(date, formatString, options)
}

export function formatTimeAgo(dateString: string | number | Date) {
	const now = getZonedDate()
	const pastDate = normalizeDate(dateString)
	if (!pastDate) return ''
	const milliseconds = differenceInMilliseconds(now, pastDate)

	if (milliseconds < 60000) {
		return '刚刚'
	} else if (milliseconds < 3600000) {
		const minutes = differenceInMinutes(now, pastDate)
		return `${minutes}分钟前`
	} else if (milliseconds < 86400000) {
		const hours = differenceInHours(now, pastDate)
		return `${hours}小时前`
	} else if (milliseconds < 604800000) {
		const days = differenceInDays(now, pastDate)
		return `${days}天前`
	} else if (milliseconds < 2592000000) {
		const weeks = differenceInWeeks(now, pastDate)
		return `${weeks}周前`
	} else if (milliseconds < 31536000000) {
		const months = differenceInMonths(now, pastDate)
		return `${months}个月前`
	} else {
		const years = differenceInYears(now, pastDate)
		return `${years}年前`
	}
}

const patterns = [
	'yyyy-MM-dd HH:mm:ss',
	'yyyy-MM-dd HH:mm',
	'yyyy-MM-dd',
	'yyyy/MM/dd HH:mm:ss',
	'yyyy/MM/dd HH:mm',
	'yyyy/MM/dd',
	'MMM/dd',
]

/**
 * 轉換成 date物件， input 可以 timestamp 或者 符合patterns中預設的
 */
export function normalizeDate(input: string | number | Date): Date | null {
	if (!input) return null
	if (input instanceof Date) {
		return getZonedDate(input)
	}

	const timestamp = Number(input)
	if (typeof input === 'number') {
		return getZonedDate(timestamp)
	}

	if (typeof input === 'string') {
		if (/^\d+$/.test(input) && String(timestamp) === input) {
			return getZonedDate(timestamp)
		}

		for (const pattern of patterns) {
			const parsedDate = parse(input, pattern, new Date())
			if (isValid(parsedDate)) {
				return getZonedDate(parsedDate)
			}
		}
	}
	return null
}

/**
 * 將指定的時間轉換為特定時區的 Date
 * @param {number|string|Date} dateString 時間字符串
 * @param {string} [timeZone='Asia/Shanghai'] 時區，默認值為 'Asia/Shanghai'
 * @returns {Date} 解析後的 Date
 */
export function createZonedDateFromInput(
	dateString: string | number | Date,
	timeZone = DEFAULT_TIME_ZONE
) {
	const date = normalizeDate(dateString)
	if (!date) throw new Error('Invalid dateString for parseDate')
	return fromZonedTime(date, timeZone)
}

//取得時區的 date object
export function getZonedDate(
	timestamp?: Date | number,
	{ timeZone = DEFAULT_TIME_ZONE } = {}
) {
	const date = timestamp ? new Date(timestamp) : new Date()
	return toZonedTime(date, timeZone)
}

export function getZonedYear() {
	return getZonedDate().getFullYear()
}

/**
 * 從年月日直接創建帶時區的日期對象
 * @param {number} year - 年份
 * @param {number} month - 月份
 * @param {number} day - 日
 * @param {Object} options - 選項
 * @param {string} [options.timeZone='Asia/Shanghai'] - 時區
 * @returns {Date} 帶時區的日期對象
 */
export function createZonedDate(
	year: number,
	month: number,
	day: number,
	{ timeZone = DEFAULT_TIME_ZONE } = {}
) {
	const utcDate = new Date(Date.UTC(year, month - 1, day))
	return toZonedTime(utcDate, timeZone)
}

/**
 * Parses a date string in a specific format as a UTC date.
 * @param dateString The date string to parse.
 * @param formatString The format of the date string (e.g., 'yyyy-MM-dd HH:mm').
 * @returns A Date object if parsing is successful, otherwise null.
 */
export function parseUtcDateTimeString(
	dateString: string,
	formatString: string
): Date | null {
	// We append 'Z' to treat the string as UTC and use 'X' in the format
	// to handle the ISO-8601 UTC indicator.
	const parsedDate = parse(dateString + 'Z', formatString + 'X', new Date())
	return isValid(parsedDate) ? parsedDate : null
}

export function getStartOfToday(): Date {
	return startOfDay(getZonedDate())
}

export function getEndOfToday(): Date {
	return endOfDay(getZonedDate())
}

// --- Functions migrated from util.js ---

export function getCurrentDateTimeForFilename(): string {
	return format(getZonedDate(), 'yyyy-MM-dd HH_mm_ss')
}

export function fileNameToDateTimeString(fileName: string): string {
	if (!fileName) return ''
	// yyyy-MM-dd HH_mm_ss -> yyyy-MM-dd HH:mm:ss
	return fileName.replace(/_/g, ':')
}

export function dateTimeStringToFileName(dateTimeString: string): string {
	if (!dateTimeString) return ''
	// yyyy-MM-dd HH:mm:ss -> yyyy-MM-dd HH_mm_ss
	return dateTimeString.replace(/:/g, '_')
}

/**
 * Parses a Chinese date string into a standard format.
 * e.g., '2023 年 07 月 26 日 9:45' -> '2023-07-26 09:45'
 */
export function zhTimeStringToStandard(dateString: string): string {
	if (!dateString) return ''
	const dateRegex = /(\d{4}) 年 (\d{2}) 月 (\d{2}) 日 (\d{1,2}):(\d{2})/
	const match = dateString.match(dateRegex)

	if (match) {
		const [, year, month, day, hours, minutes] = match
		const stdHours = String(hours).padStart(2, '0')
		return `${year}-${month}-${day} ${stdHours}:${minutes}`
	}
	return dateString
}

/**
 * Returns a list of month abbreviations (e.g., "Jan", "Feb").
 */
export function getMonthList(): string[] {
	const months: string[] = []
	const today = new Date()
	for (let i = 0; i < 12; i++) {
		months.push(format(setMonth(today, i), 'MMM'))
	}
	return months
}

/**
 * Parses a Chinese date string (e.g., "2023 年 08 月 16 日") into a Date object.
 */
export function parseChineseDate(dateString: string): Date | null {
	const regex = /(\d{4}) 年 (\d{1,2}) 月 (\d{1,2}) 日/
	const match = dateString.match(regex)

	if (match) {
		const [, year, month, day] = match
		// new Date() month is 0-indexed
		return new Date(Number(year), Number(month) - 1, Number(day))
	}

	return null
}
