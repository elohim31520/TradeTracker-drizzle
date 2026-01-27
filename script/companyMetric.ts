import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000'; // 根據你的實際環境修改

async function testGetCompanyMetrics(symbol: string, days?: number) {
    try {
        console.log(`🚀 正在測試 API: 查詢 ${symbol}, 天數: ${days || '未指定'}...`);

        const response = await axios.get(`${API_BASE_URL}/company-metrics/${symbol}`, {
            params: {
                days: days
            }
        });

        console.log('✅ 測試成功！');
        console.log('📊 資料筆數:', response.data.data.length);
        
        // 印出第一筆資料看看結構
        if (response.data.data.length > 0) {
            console.log('💡 第一筆資料樣本:', response.data.data[0]);
        }

    } catch (error: any) {
        if (error.response) {
            // 伺服器有回傳錯誤 (4xx, 5xx)
            console.error('❌ API 錯誤:', error.response.status, error.response.data);
        } else {
            // 網路問題或其他錯誤
            console.error('❌ 請求失敗:', error.message);
        }
    }
}

// 執行測試
// 測試範例 1: 僅查詢 AAPL
// testGetCompanyMetrics('AAPL');

// 測試範例 2: 查詢 TSLA 並限制 30 天
testGetCompanyMetrics('TSLA', 30);