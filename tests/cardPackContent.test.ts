import { buildPrompt, parseCardContent } from '../src/modules/cardPack/cardContent';
import type { CompanySnapshot } from '../src/modules/cardPack/snapshotBuilder';

const validOutput = {
    sentiment: 'bearish',
    zh: {
        headline: '連兩日大幅震盪後回落',
        summary: '當日收盤下跌，波動明顯高於近期平均，成交量與平常相近。目前未見明確的單一原因。',
        points: ['當日下跌', '前一日曾大幅反彈', '近 20 日整體持平'],
        watch: '若後續幾日波動收斂，震盪可能告一段落。',
    },
    en: {
        headline: 'Pulls back after two volatile sessions',
        summary: 'Closed lower with swings well above its recent average on normal volume. No single clear driver is evident.',
        points: ['Down on the day', 'Sharp rebound the day before', 'Roughly flat over 20 days'],
        watch: 'If volatility settles in the next few sessions, the swings may be fading.',
    },
};

describe('parseCardContent', () => {
    test('合法的 JSON 通過驗證', () => {
        const parsed = parseCardContent(JSON.stringify(validOutput));
        expect(parsed.sentiment).toBe('bearish');
        expect(parsed.zh.points).toHaveLength(3);
        expect(parsed.en.headline).toMatch(/Pulls back/);
    });

    test('容忍 markdown 圍欄與前後說明文字', () => {
        const text = `好的，以下是結果：\n\`\`\`json\n${JSON.stringify(validOutput)}\n\`\`\`\n希望有幫助`;
        expect(parseCardContent(text).sentiment).toBe('bearish');
    });

    test('sentiment 大小寫與空白被容忍，並統一成小寫', () => {
        const parsed = parseCardContent(JSON.stringify({ ...validOutput, sentiment: ' Bullish ' }));
        expect(parsed.sentiment).toBe('bullish');
    });

    test('不合法的 sentiment 被拒絕', () => {
        expect(() => parseCardContent(JSON.stringify({ ...validOutput, sentiment: 'moon' }))).toThrow(/格式不符/);
    });

    test('英文標題與概述照 prompt 寫出來的長度要能通過：一句話的英文標題常超過 60 字元', () => {
        const en = {
            ...validOutput.en,
            headline: 'NVIDIA slides 3.3% on heavy volume as chip names extend a broad semiconductor pullback', // 88 字元
            summary: 'Closed lower with swings well above its recent average. '.repeat(11).trim(), // 約 600 字元
        };
        expect(en.headline.length).toBeGreaterThan(60);
        expect(en.summary.length).toBeGreaterThan(500);
        expect(() => parseCardContent(JSON.stringify({ ...validOutput, en }))).not.toThrow();
    });

    test('標題與概述仍然有上限，失控的長輸出照樣被拒絕', () => {
        const longHeadline = { ...validOutput, en: { ...validOutput.en, headline: 'x'.repeat(121) } };
        expect(() => parseCardContent(JSON.stringify(longHeadline))).toThrow(/格式不符/);
        const longSummary = { ...validOutput, zh: { ...validOutput.zh, summary: '字'.repeat(801) } };
        expect(() => parseCardContent(JSON.stringify(longSummary))).toThrow(/格式不符/);
    });

    test('缺少欄位或重點數量不對被拒絕', () => {
        const noWatch = { ...validOutput, zh: { ...validOutput.zh, watch: undefined } };
        expect(() => parseCardContent(JSON.stringify(noWatch))).toThrow(/格式不符/);

        const onePoint = { ...validOutput, en: { ...validOutput.en, points: ['only one'] } };
        expect(() => parseCardContent(JSON.stringify(onePoint))).toThrow(/格式不符/);
    });

    test('不是 JSON 時丟錯', () => {
        expect(() => parseCardContent('抱歉，我無法回答')).toThrow();
    });

    test.each([
        ['zh', { ...validOutput.zh, watch: '建議在回檔時買進。' }, '買進'],
        ['zh', { ...validOutput.zh, headline: '目標價上看 300 美元' }, '目標價'],
        ['zh', { ...validOutput.zh, points: ['a', '穩賺不賠', 'c'] }, '穩賺'],
    ])('%s 文字含投資建議用語「%s」被拒絕', (_lang, zh, word) => {
        expect(() => parseCardContent(JSON.stringify({ ...validOutput, zh }))).toThrow(word);
    });

    test('英文的投資建議與保證用語被拒絕，但一般市場用語（sell-off、buyback）不受影響', () => {
        const advice = { ...validOutput, en: { ...validOutput.en, watch: 'Investors should buy the dip.' } };
        expect(() => parseCardContent(JSON.stringify(advice))).toThrow(/投資建議/);

        const target = { ...validOutput, en: { ...validOutput.en, summary: 'Analysts set a price target of 300.' } };
        expect(() => parseCardContent(JSON.stringify(target))).toThrow(/投資建議/);

        const normal = {
            ...validOutput,
            en: { ...validOutput.en, summary: 'A broad sell-off hit chip names while the buyback program continued.' },
        };
        expect(() => parseCardContent(JSON.stringify(normal))).not.toThrow();
    });
});

describe('buildPrompt', () => {
    const snapshot: CompanySnapshot = {
        symbol: 'AMD',
        name: 'AMD',
        date: '2026-11-19',
        signals: {
            price: 489.19,
            dayChgPct: -7.72,
            volume: 70_838_807,
            volumeRatio: 1.89,
            moveMultiple: 1.26,
            change20dPct: -3.69,
            score: 3.86,
        },
        recent: [
            { date: '2026-11-18', close: 530.1, chgPct: 1.2 },
            { date: '2026-11-19', close: 489.19, chgPct: -7.72 },
        ],
        todaySource: 'db',
        baselineStale: false,
    };

    test('數據區塊帶入程式算好的數字', () => {
        const prompt = buildPrompt(snapshot);
        expect(prompt).toContain('AMD（AMD）');
        expect(prompt).toContain('2026-11-19');
        expect(prompt).toContain('收盤價：489.19 美元');
        expect(prompt).toContain('當日漲跌幅：-7.72%');
        expect(prompt).toContain('70.8M 股');
        expect(prompt).toContain('近 10 日平均量的 1.89 倍');
        expect(prompt).toContain('近 20 日累計漲跌幅：-3.69%');
        expect(prompt).toContain('2026-11-18　收盤 530.1　漲跌 +1.2%');
    });

    test('沒有基準的欄位寫「無資料」，而不是 null', () => {
        const prompt = buildPrompt({
            ...snapshot,
            signals: { ...snapshot.signals, volumeRatio: null, moveMultiple: null, change20dPct: null },
        });
        expect(prompt).toContain('近 20 日累計漲跌幅：無資料');
        expect(prompt).not.toMatch(/null|undefined|NaN/);
    });

    test('規則區明確要求不給投資建議，且不洩漏稀有度', () => {
        const prompt = buildPrompt(snapshot);
        expect(prompt).toContain('不是投資建議');
        expect(prompt).not.toMatch(/legendary|epic|稀有度/);
    });
});
