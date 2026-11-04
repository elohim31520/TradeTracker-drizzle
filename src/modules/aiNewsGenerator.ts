import { ai, geminiConfig } from './vertexAi';
import { ServerError } from './errors';
import { parseAiJson } from './util';
import { bulkCreateSchema } from '../schemas/newsSchema';
import newsService from '../services/newsService';
import redisClient from './redis'
import { db } from '../db/pg'
import { news as newsTable } from '../db/schema'
import { gte, and, eq } from 'drizzle-orm';
import { subDays, startOfDay } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import logger from './logger';

const NEWS_TIMEZONE = 'Asia/Taipei';

function getRecentNewsPromptSection(recentNews: { content: string }[]): string {
    if (recentNews.length === 0) return '';

    const newsList = recentNews.map((n, i) => `${i + 1}. ${n.content}`).join('\n');

    return `
        【近期已發布新聞（請勿重複或高度相似）】
            以下是過去 3 天已發布的新聞，請略過與這些主題高度相似的內容：
            ${newsList}
        `;
}

function buildPrompt(recentNews: { content: string }[]): string {
    // 每次產生 prompt 時才計算日期，cron 容器長時間運行，不能在模組載入時算一次
    const now = new Date();
    const today = formatInTimeZone(now, NEWS_TIMEZONE, 'yyyy-MM-dd');
    const sevenDaysAgo = formatInTimeZone(subDays(now, 7), NEWS_TIMEZONE, 'yyyy-MM-dd');

    return `
        你是一位科技新聞編輯，專注於矽谷與全球科技圈的重大事件。
        現在的日期是 ${today}。

        【核心任務】
            請使用 Google 搜尋查找最新資訊，產出發生在「${sevenDaysAgo} 到 ${today}」這段期間內的近期重要新聞。
            **嚴格禁止**輸出早於 ${sevenDaysAgo} 的任何舊事件或舊傳聞。

        【報導範疇】
            - 人工智慧與大型語言模型（AI/LLM）
            - 機器人與自動化
            - 能源與永續科技（核融合、太陽能、電動車）
            - 太空探索與商業航太
            - 半導體與硬體突破
            - 矽谷重要公司動態（融資、併購、裁員、產品發布）

        ${getRecentNewsPromptSection(recentNews)}

        【品質要求】
            - **事實查核機制**：如果無法確定某事件的真實性，或該事件尚未發生（只是傳聞），請絕對不要輸出。寧可回傳空陣列 []，也不要編造。
            - **具體細節**：必須包含具體的主體（公司名）、動作（發布、併購）與影響。避免籠統的描述（如「AI 持續發展」）。
            - **拒絕過時資訊**：即便該新聞很重要，若發生時間超過一週，請略過。
            - 內容簡潔精準，100～200字為佳
            - 英文版（contentEn）為 content 的忠實翻譯，語氣專業
            - 筆數依實際重要事件決定，通常 1～8 筆，避免濫竽充數

        【輸出格式】
        只回傳純 JSON 陣列，不加任何說明文字或 markdown：
        [
            {
                "content": "（繁體中文內容）",
                "contentEn": "（English content）",
                "status": "published"
            }
        ]
    `;
}

// 快取 key 是 `cache:${完整 URL}`（見 redisConditionalCache），query 參數的順序或 lang 都會產生不同的 key，
// 所以用 pattern 掃描刪除，而不是列舉固定的 key。快取清除失敗不該讓整個任務失敗
async function clearNewsCache() {
    try {
        for await (const keys of redisClient.scanIterator({ MATCH: 'cache:/news*', COUNT: 100 })) {
            if (keys.length) await redisClient.del(keys);
        }
    } catch (e) {
        logger.error('⚠️ 清除新聞快取失敗', e);
    }
}

async function fetchRecentNews(): Promise<{ content: string }[]> {
    const threeDaysAgo = startOfDay(subDays(new Date(), 3));

    return db
        .select({ content: newsTable.content })
        .from(newsTable)
        .where(
            and(
                gte(newsTable.createdAt, threeDaysAgo),
                eq(newsTable.status, 'published')
            )
        );
}

export async function generateAndSaveNews() {
    const recentNews = await fetchRecentNews();

    const prompt = buildPrompt(recentNews);

    const result = await ai.models.generateContent({
        ...geminiConfig,
        contents: [{
            role: 'user',
            parts: [{ text: prompt }],
        }],
    });

    const text = result.text;

    if (!text) {
        throw new ServerError('AI 未能產生有效的文字內容');
    }

    let extractedData: unknown;
    try {
        extractedData = parseAiJson(text, 'array');
    } catch (e) {
        throw new ServerError(`AI 回傳內容無法解析為 JSON: ${(e as Error).message}`);
    }

    // prompt 要求「不確定就回傳空陣列」，這是正常結果，不是錯誤
    if (Array.isArray(extractedData) && extractedData.length === 0) {
        console.log('ℹ️ AI 判斷近期沒有可信的新聞，本次不寫入');
        return;
    }

    const { error, value } = bulkCreateSchema.validate(extractedData);
    if (error) {
        throw new ServerError(`AI 產生的資料格式不符: ${error.details.map(d => d.message).join(', ')}`);
    }

    const saved = await newsService.bulkCreateNews(value);

    console.log(`✅ 成功寫入 ${saved.length} 筆新聞`);

    await clearNewsCache();
}