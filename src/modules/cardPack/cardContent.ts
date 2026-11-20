import Joi from 'joi';
import { ServerError } from '../errors';
import { parseAiJson } from '../util';
import type { CardContent, CardSentiment } from '../../types/cardPack';
import type { CompanySnapshot } from './snapshotBuilder';

/** 模型產出的卡片內容：文字只有 zh / en 兩份與走勢偏向，數字一律由程式填（見 CardSignals） */
export interface GeneratedContent {
    sentiment: CardSentiment;
    zh: CardContent;
    en: CardContent;
}

// ---------- 驗證 ----------

// 上限只是擋失控的輸出與版面爆掉，要留得下模型照 prompt 寫出來的長度：
// 英文一句話的標題常超過 60 字元（上線第一次跑就因為 en.headline 超過 60 被整張退回）；
// 英文概述 40～80 個字約 450～560 字元，所以概述上限給 800
const contentSchema = Joi.object({
    headline: Joi.string().trim().max(120).required(),
    summary: Joi.string().trim().max(800).required(),
    points: Joi.array().items(Joi.string().trim().max(200)).min(2).max(4).required(),
    watch: Joi.string().trim().max(250).required(),
});

const modelOutputSchema = Joi.object({
    // 容忍 "Bullish"、前後空白這類大小寫差異，統一轉成小寫；真正不合法的值仍會被拒絕
    sentiment: Joi.string().trim().lowercase().valid('bullish', 'bearish', 'neutral').required(),
    zh: contentSchema.required(),
    en: contentSchema.required(),
});

/** 這是走勢分析，不是投資建議：出現操作建議或保證式的用語就整張重生 */
const FORBIDDEN_PATTERNS = [
    /買進|賣出|加碼|減碼|停損|停利|目標價|保證|必漲|必跌|穩賺/,
    /price target|guarantee|stop[- ]loss|take[- ]profit|(?:should|must|recommend(?:ed)? to) (?:buy|sell)/i,
];

function assertNoAdvice(...contents: CardContent[]) {
    const text = contents.flatMap((c) => [c.headline, c.summary, c.watch, ...c.points]).join('\n');
    const hit = FORBIDDEN_PATTERNS.map((pattern) => pattern.exec(text)?.[0]).find(Boolean);
    if (hit) throw new ServerError(`卡片文字含有投資建議用語「${hit}」`);
}

/** 解析並驗證模型回傳的文字；格式不符或含有投資建議用語時丟出 ServerError */
export function parseCardContent(text: string): GeneratedContent {
    const { error, value } = modelOutputSchema.validate(parseAiJson(text, 'object'), { stripUnknown: true });
    if (error) {
        throw new ServerError(`AI 產生的卡片格式不符: ${error.details.map((d) => d.message).join(', ')}`);
    }
    assertNoAdvice(value.zh, value.en);
    return value as GeneratedContent;
}

// ---------- Prompt ----------

const signed = (n: number | null, unit: string) => (n == null ? '無資料' : `${n > 0 ? '+' : ''}${n}${unit}`);
const times = (n: number | null) => (n == null ? '無資料' : `${n} 倍`);

export function buildPrompt(s: CompanySnapshot): string {
    const { signals: g } = s;
    const rows = s.recent.map((r) => `            ${r.date}　收盤 ${r.close}　漲跌 ${signed(r.chgPct, '%')}`).join('\n');
    const volumeM = `${(g.volume / 1e6).toFixed(1)}M 股`;

    return `
        你是一位謹慎的美股市場分析師，負責為「${s.name}（${s.symbol}）」撰寫一張走勢分析卡。
        資料日期：美東時間 ${s.date} 收盤。

        【數據（程式計算，是唯一可以引用的數字來源）】
            - 收盤價：${g.price} 美元
            - 當日漲跌幅：${signed(g.dayChgPct, '%')}
            - 當日成交量：${volumeM}，為近 10 日平均量的 ${times(g.volumeRatio)}
            - 當日波動幅度為近 20 日平均單日波動的 ${times(g.moveMultiple)}
            - 近 20 日累計漲跌幅：${signed(g.change20dPct, '%')}
            - 近期各交易日：
${rows}

        【任務】
            1. 使用 Google 搜尋了解這家公司近幾天是否有影響股價的消息（財報、產品、產業動態、總體環境）。搜尋只用來理解背景，不得引用搜尋結果裡的股價、漲跌幅、成交量等數字。
            2. 依上方數據與查到的背景，寫一張走勢分析卡。

        【規則】
            - 所有數字只能來自【數據】；不要自行計算或補充其他數字（目標價、本益比、市值、營收預估等一律不寫）
            - 查不到可靠原因時，直接寫「目前未見明確的單一原因」，不要猜測或編造消息
            - 這是走勢分析，不是投資建議。禁止出現「買進、賣出、加碼、減碼、停損、目標價、保證」等字眼；後續觀察用「若…則…」或「值得留意…」的描述
            - sentiment 反映數據顯示的近期走勢偏向（bullish 偏多、bearish 偏空、neutral 中性），不是操作建議
            - zh 用繁體中文，en 為其忠實翻譯，語氣專業中性

        【輸出格式】
        只回傳純 JSON 物件，不加任何說明文字或 markdown：
        {
            "sentiment": "bullish、bearish 或 neutral 其中之一",
            "zh": {
                "headline": "一句話總結（25 字內）",
                "summary": "60～120 字的走勢概述，說明數據顯示什麼、可能的背景",
                "points": ["重點1", "重點2", "重點3"],
                "watch": "後續值得觀察的一件事（一句話，條件式）"
            },
            "en": {
                "headline": "One-sentence summary (under 15 words)",
                "summary": "Trend overview, 40-80 words",
                "points": ["Point 1", "Point 2", "Point 3"],
                "watch": "One thing worth watching next (conditional phrasing)"
            }
        }
    `;
}
