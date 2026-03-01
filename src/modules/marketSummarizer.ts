import { geminiModel } from './vertexAi';
import { ServerError } from './errors';
import redisClient from './redis';
import type { MarketSummary } from '../types/marketSummary'
import logger from './logger'

const REDIS_KEY_LATEST = 'market:summary:latest';
const getSummaryDatekey = (date: string) => `market:summary:${date}`;
const TTL_SECONDS = 60 * 60 * 25;

export async function generateAndCacheMarketSummary(): Promise<void> {
    try {
        const today = new Date().toISOString().split('T')[0];

        const prompt = `
            你是一位專業的美國市場金融分析師，請根據今日（${today}）的市場狀況
            只回傳以下 JSON，不要多餘文字：
            {
                "date": "${today}",
                "generated_at": "${new Date().toISOString()}",
                "zh": {
                    "headline": "一句話總結今日市場（繁體中文）",
                    "sentiment": "bullish | bearish | neutral",
                    "highlights": ["重點1", "重點2", "重點3"],
                    "summary": "200字以內的市場概述（繁體中文）",
                    "sectors": [
                        { "name": "科技", "change": "+1.2%", "note": "簡短說明" }
                    ]
                },
                "en": {
                    "headline": "One-sentence market summary (English)",
                    "sentiment": "bullish | bearish | neutral",
                    "highlights": ["Highlight 1", "Highlight 2", "Highlight 3"],
                    "summary": "Market overview within 200 words (English)",
                    "sectors": [
                        { "name": "Technology", "change": "+1.2%", "note": "Brief note" }
                    ]
                }
            }
        `;

        const result = await geminiModel.generateContent({
            contents: [{
                role: 'user',
                parts: [
                    { text: prompt }
                ],
            }],
        });
        const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

        const cleaned = text.replace(/```json|```/g, '').trim();
        JSON.parse(cleaned); // 只是驗證，不用接變數

        await Promise.all([
            redisClient.set(getSummaryDatekey(today), cleaned, { EX: TTL_SECONDS }),
            redisClient.set(REDIS_KEY_LATEST, cleaned, { EX: TTL_SECONDS }),
        ]);

        console.log(`[MarketSummary] ✅ 寫入 Redis 成功：${today}`);
    } catch (err) {
        console.error('[MarketSummary] ❌ 生成失敗', err);
        logger.error('[MarketSummary] 市場摘要生成失敗', err);
    }
}

export async function getMarketSummary(date?: string): Promise<MarketSummary> {
    try {
        const key = date ? getSummaryDatekey(date) : REDIS_KEY_LATEST;
        const cached = await redisClient.get(key);

        if (!cached) {
            throw new ServerError('查無市場摘要，可能尚未生成或已過期');
        }

        return JSON.parse(cached) as MarketSummary;
    } catch (err) {
        if (err instanceof ServerError) throw err;
        console.error('[MarketSummary] ❌ 讀取 Redis 失敗', err);
        throw new ServerError('讀取市場摘要失敗');
    }
}