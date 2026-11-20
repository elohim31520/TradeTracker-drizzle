/** @type {import('jest').Config} */
module.exports = {
	// 測試是 TypeScript：沒有這行，jest 預設只用 Babel，會在 `let x: string` 這種型別標註上解析失敗
	preset: 'ts-jest',
	testEnvironment: 'node',
	testPathIgnorePatterns: [
		'/node_modules/',
		// 這幾個是整合測試：會連 .env 指的資料庫（目前是本機開發用的 ur_trade，.env.test 也指同一個）。
		// admin 每個測試前會 TRUNCATE users, admins ... CASCADE，users 會刪使用者。
		// 所以 npm test 預設不跑，免得把開發資料庫清掉。要跑請用 npm run test:integration，
		// 而且請先把 PG_URL 換成專用的測試資料庫。
		'/tests/(admin|users|companyMetrics)\\.test\\.[tj]s$',
	],
};
