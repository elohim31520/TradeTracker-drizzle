import { geminiModel } from './vertexAi';
import { ServerError } from './errors';
import { bulkCreateSchema } from '../schemas/newsSchema';
import newsService from '../services/newsService';
import redisClient from './redis'
import { db } from '../db/pg'
import { news as newsTable } from '../db/schema'
import { gte, and, eq } from 'drizzle-orm';
import { subDays, startOfDay } from 'date-fns';

const today = new Date().toISOString().split('T')[0];

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
    return `
        你是一位科技新聞編輯，專注於矽谷與全球科技圈的重大事件。

        請根據你對 ${today} 前的最新科技動態的知識，產出近期重要新聞。

        【報導範疇】
            - 人工智慧與大型語言模型（AI/LLM）
            - 機器人與自動化
            - 能源與永續科技（核融合、太陽能、電動車）
            - 太空探索與商業航太
            - 半導體與硬體突破
            - 矽谷重要公司動態（融資、併購、裁員、產品發布

        ${getRecentNewsPromptSection(recentNews)}

        【品質要求】
            - 每則新聞須為真實發生或高度可信的事件，不可捏造
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

function parseGeminiResponse(text: string) {
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
}

async function clearNewsCache() {
    for (let p = 1; p <= 3; p++) {
        await redisClient.del(`cache:/news?page=${p}&size=10`)
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

    const result = await geminiModel.generateContent({
        contents: [{
            role: 'user',
            parts: [{ text: prompt }],
        }],
    });

    const part = result.response.candidates?.[0]?.content?.parts?.[0];

    if (!part?.text) {
        throw new ServerError('AI 未能產生有效的文字內容');
    }

    let extractedData: unknown;
    try {
        extractedData = parseGeminiResponse(part.text);
    } catch (e) {
        throw new ServerError(`AI 回傳內容無法解析為 JSON: ${(e as Error).message}`);
    }

    const { error, value } = bulkCreateSchema.validate(extractedData);
    if (error) {
        throw new ServerError(`AI 產生的資料格式不符: ${error.details.map(d => d.message).join(', ')}`);
    }

    const saved = await newsService.bulkCreateNews(value);

    console.log(`✅ 成功寫入 ${saved.length} 筆新聞`);

    clearNewsCache();
}