import axios, { AxiosResponse } from 'axios'
import { faker } from '@faker-js/faker'

// 配置
const BASE_URL = 'http://localhost:3000'
const TRADE_API_BASE = `${BASE_URL}/trades`

// 類型定義
interface LoginRequest {
	email: string
	password: string
}

interface RegisterRequest {
	name: string
	email: string
	password: string
}

interface LoginResponse {
	data: {
		token: string
	}
}

interface TradeRequest {
	companyId: number
	tradeType: 'buy' | 'sell'
	quantity: number
	price: number
	tradeDate: string
}

interface BulkTradeRequest extends Array<TradeRequest> { }

interface TradeResponse {
	data: any
}

interface PaginatedTradesResponse {
	data: {
		trades: any[]
		pagination: {
			page: number
			size: number
			total: number
			totalPages: number
		}
	}
}

// 全局變數
let authToken: string = ''
let createdTradeIds: number[] = []

// 工具函數
function logRequest(method: string, url: string, data?: any) {
	console.log(`\n🚀 ${method} ${url}`)
	if (data) {
		console.log('📤 Request Data:', JSON.stringify(data, null, 2))
	}
}

function logResponse(response: AxiosResponse) {
	console.log(`📥 Response Status: ${response.status}`)
	console.log('📥 Response Data:', JSON.stringify(response.data, null, 2))
}

function logError(error: any) {
	if (error.response) {
		console.log(`❌ Response Status: ${error.response.status}`)
		console.log('❌ Response Data:', JSON.stringify(error.response.data, null, 2))
	} else if (error.request) {
		console.log('❌ Network Error:', error.message)
	} else {
		console.log('❌ Error:', error.message)
	}
}

// 創建隨機交易資料
function createRandomTrade(): TradeRequest {
	return {
		companyId: Math.floor(Math.random() * 416) + 1,
		tradeType: faker.helpers.arrayElement(['buy', 'sell']),
		quantity: faker.number.int({ min: 1, max: 1000 }),
		price: parseFloat(faker.commerce.price({ min: 1, max: 1000, dec: 2 })),
		tradeDate: faker.date.recent().toISOString().split('T')[0]
	}
}

// 創建多筆交易資料
function createBulkTrades(count: number = 3): BulkTradeRequest {
	return Array.from({ length: count }, () => createRandomTrade())
}

// 測試函數
async function register(): Promise<void> {
	try {
		logRequest('POST', `${BASE_URL}/users/register`)

		const registerData: RegisterRequest = {
			name: 'Test User',
			email: 'test@example.com',
			password: 'password123'
		}

		const response: AxiosResponse<LoginResponse> = await axios.post(`${BASE_URL}/users/register`, registerData)
		logResponse(response)

		authToken = response.data.data.token
		console.log('✅ 註冊成功，取得 Token')

		// 設置全局 axios 預設值
		axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`

	} catch (error: any) {
		// 如果用戶已存在，嘗試登入
		if (error.response?.status === 409 || error.response?.data?.message?.includes('已被註冊')) {
			console.log('ℹ️ 用戶已存在，嘗試登入...')
			await login()
		} else {
			logError(error)
			throw new Error('註冊失敗')
		}
	}
}

async function login(): Promise<void> {
	try {
		logRequest('POST', `${BASE_URL}/users/login`)

		const loginData: LoginRequest = {
			email: 'test@example.com', // 請確保資料庫中有這個用戶
			password: 'password123'
		}

		const response: AxiosResponse<LoginResponse> = await axios.post(`${BASE_URL}/users/login`, loginData)
		logResponse(response)

		authToken = response.data.data.token
		console.log('✅ 登入成功，取得 Token')

		// 設置全局 axios 預設值
		axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`

	} catch (error) {
		logError(error)
		throw new Error('登入失敗')
	}
}

async function testCreateTrade(): Promise<void> {
	try {
		logRequest('POST', TRADE_API_BASE)

		const tradeData = createRandomTrade()
		const response: AxiosResponse<TradeResponse> = await axios.post(TRADE_API_BASE, tradeData)
		logResponse(response)

		if (response.data.data && response.data.data.id) {
			createdTradeIds.push(response.data.data.id)
			console.log('✅ 創建單筆交易成功')
		}

	} catch (error) {
		logError(error)
		throw new Error('創建單筆交易失敗')
	}
}

async function testBulkCreateTrades(): Promise<void> {
	try {
		logRequest('POST', `${TRADE_API_BASE}/bulk`)

		const bulkTradeData = createBulkTrades(3)
		const response: AxiosResponse<TradeResponse> = await axios.post(`${TRADE_API_BASE}/bulk`, bulkTradeData)
		logResponse(response)

		if (response.data.data && Array.isArray(response.data.data)) {
			createdTradeIds.push(...response.data.data.map((trade: any) => trade.id))
			console.log('✅ 批量創建交易成功')
		}

	} catch (error) {
		logError(error)
		throw new Error('批量創建交易失敗')
	}
}

async function testGetAllTrades(): Promise<void> {
	try {
		logRequest('GET', `${TRADE_API_BASE}?page=1&size=10`)

		const response: AxiosResponse<PaginatedTradesResponse> = await axios.get(`${TRADE_API_BASE}?page=1&size=10`)
		logResponse(response)

		console.log('✅ 獲取所有交易成功')

	} catch (error) {
		logError(error)
		throw new Error('獲取所有交易失敗')
	}
}

async function testGetTradeById(): Promise<void> {
	if (createdTradeIds.length === 0) {
		console.log('⚠️ 沒有可用的交易ID，跳過此測試')
		return
	}

	try {
		const tradeId = createdTradeIds[0]
		logRequest('GET', `${TRADE_API_BASE}/${tradeId}`)

		const response: AxiosResponse<TradeResponse> = await axios.get(`${TRADE_API_BASE}/${tradeId}`)
		logResponse(response)

		console.log('✅ 獲取單筆交易成功')

	} catch (error) {
		logError(error)
		throw new Error('獲取單筆交易失敗')
	}
}

async function testUpdateTrade(): Promise<void> {
	if (createdTradeIds.length === 0) {
		console.log('⚠️ 沒有可用的交易ID，跳過此測試')
		return
	}

	try {
		const tradeId = createdTradeIds[0]
		const updateData = {
			quantity: 999,
			price: 999.99
		}

		logRequest('PUT', `${TRADE_API_BASE}/${tradeId}`, updateData)

		const response: AxiosResponse<TradeResponse> = await axios.put(`${TRADE_API_BASE}/${tradeId}`, updateData)
		logResponse(response)

		console.log('✅ 更新交易成功')

	} catch (error) {
		logError(error)
		throw new Error('更新交易失敗')
	}
}

async function testDeleteTrade(): Promise<void> {
	if (createdTradeIds.length === 0) {
		console.log('⚠️ 沒有可用的交易ID，跳過此測試')
		return
	}

	try {
		const tradeId = createdTradeIds[createdTradeIds.length - 1] // 刪除最後一個創建的
		logRequest('DELETE', `${TRADE_API_BASE}/${tradeId}`)

		const response: AxiosResponse = await axios.delete(`${TRADE_API_BASE}/${tradeId}`)
		logResponse(response)

		// 從數組中移除已刪除的ID
		createdTradeIds = createdTradeIds.filter(id => id !== tradeId)
		console.log('✅ 刪除交易成功')

	} catch (error) {
		logError(error)
		throw new Error('刪除交易失敗')
	}
}

// 測試無效請求
async function testInvalidRequests(): Promise<void> {
	console.log('\n🧪 測試無效請求...')

	// 測試無效的交易ID
	try {
		logRequest('GET', `${TRADE_API_BASE}/999999`)
		await axios.get(`${TRADE_API_BASE}/999999`)
	} catch (error) {
		logError(error)
		console.log('✅ 正確處理無效交易ID')
	}

	// 測試無效的創建資料
	try {
		logRequest('POST', TRADE_API_BASE, {
			companyId: 'invalid',
			tradeType: 'invalid',
			quantity: -1,
			price: -100,
			tradeDate: 'invalid-date'
		})
		await axios.post(TRADE_API_BASE, {
			companyId: 'invalid',
			tradeType: 'invalid',
			quantity: -1,
			price: -100,
			tradeDate: 'invalid-date'
		})
	} catch (error) {
		logError(error)
		console.log('✅ 正確驗證請求資料')
	}
}

// 主測試函數
async function runAllTests() {
	console.log('🧪 開始測試 Trade APIs...')
	console.log('='.repeat(50))

	try {
		// 1. 註冊或登入獲取 Token
		await register()

		// 2. 測試創建單筆交易
		await testCreateTrade()

		// 3. 測試批量創建交易
		await testBulkCreateTrades()

		// 4. 測試獲取所有交易
		await testGetAllTrades()

		// 5. 測試獲取單筆交易
		await testGetTradeById()

		// 6. 測試更新交易
		await testUpdateTrade()

		// 7. 測試刪除交易
		await testDeleteTrade()

		// 8. 測試無效請求
		await testInvalidRequests()

		console.log('\n🎉 所有測試完成!')
		console.log('='.repeat(50))

	} catch (error) {
		console.error('\n💥 測試失敗:', error instanceof Error ? error.message : error)
		process.exit(1)
	}
}

// 如果直接運行此腳本
if (require.main === module) {
	runAllTests()
}

export { runAllTests }
