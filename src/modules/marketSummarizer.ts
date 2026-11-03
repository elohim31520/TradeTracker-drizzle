import Joi from 'joi';
import { format, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { ai, geminiConfig } from './vertexAi';
import { AppError, ServerError } from './errors';
import redisClient from './redis';
import { parseAiJson } from './util';
import type { MarketSummary } from '../types/marketSummary'
import logger from './logger'

const REDIS_KEY_LATEST = 'market:summary:latest';
const REDIS_KEY_COOLDOWN = 'cooldown:market:summary';
const getSummaryDatekey = (date: string) => `market:summary:${date}`;
const TTL_SECONDS = 60 * 60 * 25;
// 生成失敗後的冷卻時間：期間內由使用者請求觸發的重新生成會直接回錯誤，
// 避免 AI 異常時（額度、權限、模型）每個請求都再打一次
const FAILURE_COOLDOWN_SECONDS = 60 * 5;

const MARKET_TIMEZONE = 'America/New_York';
const MARKET_CLOSE_HOUR = 16;

/**
 * 最近一個已收盤的美股交易日（美東時間 yyyy-MM-dd）。
 * 美東 16:00 前，當天還沒收盤，算前一天；遇到週末往前推到週五。國定假日不處理，由 prompt 要求模型說明休市
 */
export function getLastClosedTradingDate(now: Date = new Date()): string {
    let d = toZonedTime(now, MARKET_TIMEZONE);
    if (d.getHours() < MARKET_CLOSE_HOUR) d = subDays(d, 1);
    while (d.getDay() === 0 || d.getDay() === 6) d = subDays(d, 1);
    return format(d, 'yyyy-MM-dd');
}

// 模型只負責 zh / en 內容；date 與 generated_at 由程式填入
const sectorSchema = Joi.object({
    name: Joi.string().trim().required(),
    change: Joi.string().trim().allow('').default(''),
    note: Joi.string().trim().allow('').default(''),
});

const contentSchema = Joi.object({
    headline: Joi.string().trim().required(),
    // 容忍 "Bullish"、前後空白這類大小寫差異，統一轉成小寫；真正不合法的值仍會被拒絕
    sentiment: Joi.string().trim().lowercase().valid('bullish', 'bearish', 'neutral').required(),
    highlights: Joi.array().items(Joi.string().trim()).min(1).required(),
    summary: Joi.string().trim().required(),
    sectors: Joi.array().items(sectorSchema).default([]),
});

const modelOutputSchema = Joi.object({
    zh: contentSchema.required(),
    en: contentSchema.required(),
});

function buildPrompt(tradingDate: string): string {
    return `
        你是一位專業的美國市場金融分析師。
        請使用 Google 搜尋，查找美東時間 ${tradingDate} 美股收盤的市場表現（道瓊工業、S&P 500、那斯達克，以及主要類股），並據此撰寫市場摘要。

        【資料要求】
            - 所有數字（指數、類股漲跌幅等）必須來自搜尋結果，不得憑印象或推測填寫
            - 查不到漲跌幅的類股請不要列入 sectors，sectors 可以是空陣列 []
            - 若該日休市（例如國定假日），sentiment 填 "neutral"，並在 summary 中說明休市
            - highlights 列出 3 個重點

        【輸出格式】
        只回傳以下結構的純 JSON 物件，不加任何說明文字或 markdown，欄位內容依實際搜尋結果填寫：
        {
            "zh": {
                "headline": "一句話總結當日市場（繁體中文）",
                "sentiment": "bullish、bearish 或 neutral 其中之一",
                "highlights": ["重點1", "重點2", "重點3"],
                "summary": "200字以內的市場概述（繁體中文）",
                "sectors": [
                    { "name": "類股名稱（繁體中文）", "change": "漲跌幅，含正負號與 %", "note": "簡短說明" }
                ]
            },
            "en": {
                "headline": "One-sentence market summary (English)",
                "sentiment": "bullish, bearish or neutral",
                "highlights": ["Highlight 1", "Highlight 2", "Highlight 3"],
                "summary": "Market overview within 200 words (English)",
                "sectors": [
                    { "name": "Sector name (English)", "change": "Change with sign and %", "note": "Brief note" }
                ]
            }
        }
    `;
}

async function startFailureCooldown() {
    try {
        await redisClient.set(REDIS_KEY_COOLDOWN, '1', { EX: FAILURE_COOLDOWN_SECONDS });
    } catch {
        // 失敗常常就是 Redis 本身的問題，設不了冷卻也不該讓呼叫端再出錯
    }
}

export async function generateAndCacheMarketSummary(): Promise<void> {
    try {
        const tradingDate = getLastClosedTradingDate();

        const result = await ai.models.generateContent({
            ...geminiConfig,
            contents: [{
                role: 'user',
                parts: [{ text: buildPrompt(tradingDate) }],
            }],
        });

        const { error, value } = modelOutputSchema.validate(
            parseAiJson(result.text ?? '', 'object'),
            { stripUnknown: true },
        );
        if (error) {
            throw new ServerError(`AI 產生的市場摘要格式不符: ${error.details.map(d => d.message).join(', ')}`);
        }

        const summary: MarketSummary = {
            date: tradingDate,
            generated_at: new Date().toISOString(),
            zh: value.zh,
            en: value.en,
        };
        const payload = JSON.stringify(summary);

        await Promise.all([
            redisClient.set(getSummaryDatekey(tradingDate), payload, { EX: TTL_SECONDS }),
            redisClient.set(REDIS_KEY_LATEST, payload, { EX: TTL_SECONDS }),
            redisClient.del(REDIS_KEY_COOLDOWN),
        ]);

        console.log(`[MarketSummary] ✅ 寫入 Redis 成功：${tradingDate}`);
    } catch (err) {
        console.error('[MarketSummary] ❌ 生成失敗', err);
        logger.error('[MarketSummary] 市場摘要生成失敗', err);
        await startFailureCooldown();
    }
}

let isGenerating = false; // 放在模組層級的變數

export async function getMarketSummary(date?: string): Promise<MarketSummary> {
    const key = date ? getSummaryDatekey(date) : REDIS_KEY_LATEST;
    let cached = await redisClient.get(key);

    if (!cached) {
        if (date) throw new ServerError(`查無 ${date} 的歷史資料`);

        // 剛失敗過就不再重試。這個路由未登入也未限流，不能讓每個請求都去打 AI
        if (await redisClient.exists(REDIS_KEY_COOLDOWN)) {
            throw new AppError('市場摘要暫時無法產生，請稍後再試', 503);
        }

        // 如果已經有人在生成了，不要重複觸發，否則額度耗盡
        if (isGenerating) {
            throw new ServerError('市場摘要正在更新中，請稍後再試');
        }

        try {
            isGenerating = true; // 上鎖
            logger.warn('[MarketSummary] 快取遺失，觸發生成...');
            await generateAndCacheMarketSummary();
            cached = await redisClient.get(REDIS_KEY_LATEST);
        } finally {
            isGenerating = false; // 釋放鎖
        }

        if (!cached) throw new ServerError('生成失敗');
    }

    return JSON.parse(cached);
}
