import { ai, geminiConfig } from '../vertexAi';
import redisClient from '../redis';
import logger from '../logger';
import { ServerError } from '../errors';
import { CARD_PACK_DAILY_OPENS, CARD_PACK_TTL } from '../../constant/cardPack';
import { HOT_COMPANIES, type HotCompany } from '../../constant/hotCompanies';
import type { CardPackCard, CardPackPool } from '../../types/cardPack';
import { buildPrompt, parseCardContent, type GeneratedContent } from './cardContent';
import { getLastClosedTradingDate } from '../marketSummarizer';
import { collectSnapshots, MarketOpenError, type CompanySnapshot } from './marketData';
import { assignRarities } from './signals';
import { cardPackKeys } from './keys';
import { mapLimit } from './mapLimit';

/**
 * 成功的卡少於這個數量就不寫入。等於每人每天可拆的包數（目前 5）：再少連一天都抽不滿。
 * 取捨：湊到這個數量就會上線，殘缺的新池子會取代前一個交易日完整的池子；而且當天之後的重跑會因為
 * 「池子已存在」而略過，補不滿。還沒上線時先放寬，上線後如果常常湊不滿，再考慮「有舊池子時要求更多」。
 */
export const MIN_POOL_SIZE = CARD_PACK_DAILY_OPENS;
const GEMINI_CONCURRENCY = 3;
const GEMINI_ATTEMPTS = 2;

async function requestContent(snapshot: CompanySnapshot): Promise<GeneratedContent> {
    const result = await ai.models.generateContent({
        ...geminiConfig,
        contents: [{ role: 'user', parts: [{ text: buildPrompt(snapshot) }] }],
    });
    return parseCardContent(result.text ?? '');
}

/** 單家失敗（額度、格式不符、含投資建議用語）重試一次；仍失敗就丟出，由呼叫端略過這一家 */
async function generateContentWithRetry(snapshot: CompanySnapshot): Promise<GeneratedContent> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= GEMINI_ATTEMPTS; attempt++) {
        try {
            return await requestContent(snapshot);
        } catch (err) {
            lastError = err;
            logger.warn(`[CardPack] ${snapshot.symbol} 第 ${attempt} 次生成失敗: ${(err as Error).message}`);
        }
    }
    throw lastError;
}

async function savePool(pool: CardPackPool): Promise<void> {
    const payload = JSON.stringify(pool);

    let latestDate: string | null = null;
    try {
        const latest = await redisClient.get(cardPackKeys.poolLatest);
        latestDate = latest ? (JSON.parse(latest) as CardPackPool).date : null;
    } catch {
        // latest 壞掉或讀不到就當作沒有，直接覆蓋
    }

    await redisClient.set(cardPackKeys.pool(pool.date), payload, { EX: CARD_PACK_TTL.pool });
    // 補跑舊日期的池子時，不要把比較新的 latest 蓋回去
    if (!latestDate || latestDate <= pool.date) {
        await redisClient.set(cardPackKeys.poolLatest, payload, { EX: CARD_PACK_TTL.pool });
    }
}

/** 給 cron 用的包裝：函式名稱會成為排程任務名稱，回傳值用不到 */
export async function generateAndCacheCardPack(): Promise<void> {
    await generateCardPack();
}

/**
 * cron 容器啟動時呼叫：如果還沒有卡池（第一次部署、Redis 被清掉、排程連續失敗到卡池過期），
 * 就補生成一次，不用等到下一個排程。已經有卡池就什麼都不做，所以每次重啟都呼叫也不會多花 Gemini 費用。
 *
 * - 用 SET NX 的鎖擋住「同時啟動多個實例」與「失敗後容器反覆重啟」的重複生成（鎖住 30 分鐘）。
 * - 用 force：latest 不見了就必須寫回來，就算同一個交易日的池子 key 還在也一樣。
 * - 盤中（美股還在交易）時 generateCardPack 會自己略過，等下一個排程。
 * 生成失敗（成功的卡不足）會丟出錯誤，由呼叫端記錄。
 */
export async function ensureCardPackPool(): Promise<void> {
    if (await redisClient.exists(cardPackKeys.poolLatest)) {
        logger.info('[CardPack] 啟動檢查：已有卡池，不補生成');
        return;
    }

    // SET NX：沒人持有才寫入並回 'OK'（拿到鎖）；已被持有回 null
    const acquired = await redisClient.set(cardPackKeys.bootstrapLock, '1', {
        NX: true,
        EX: CARD_PACK_TTL.bootstrapLockSeconds,
    });
    if (!acquired) {
        logger.info('[CardPack] 啟動檢查：沒有卡池，但補生成已在進行中或剛失敗過，略過');
        return;
    }

    logger.warn('[CardPack] 啟動檢查：找不到卡池，補生成一次');
    await generateCardPack({ force: true });
}

export interface GenerateOptions {
    /** 只處理這些公司（測試用）；預設是整份熱門名單 */
    companies?: HotCompany[];
    /** 當天的池子已經存在時，預設略過（省 AI 額度、cron 重跑也安全）；force 強制重生 */
    force?: boolean;
    /** 是否寫入 Redis；false 時只回傳結果，不碰 Redis */
    write?: boolean;
    /** 現在時間，只給測試用（用來算「最近一個收盤日」） */
    now?: Date;
}

/**
 * 產生今天的卡池並寫入 Redis。
 * 流程：先用本地算的「最近一個收盤日」查 Redis，已有就直接略過（連 Yahoo 與資料庫都不碰）
 * → 取行情與訊號 → 逐家請 Gemini 寫分析 → 在成功的卡之間依異動排名分稀有度 → 寫入。
 * 回傳 null 表示這次沒有產生（盤中、池子已存在）。其餘失敗直接丟出，由 cron 的 errorHandler 記錄。
 */
export async function generateCardPack(options: GenerateOptions = {}): Promise<CardPackPool | null> {
    const { companies = HOT_COMPANIES, force = false, write = true, now = new Date() } = options;

    // 預檢：最近一個收盤日的池子已經在 Redis，就不用抓行情了（重跑、重試排程、啟動補生成都走這裡）。
    // 這個日期只看週末與美東 16:00，不認得國定假日；假日時預檢會落空，下面抓到行情後會用「實際的交易日」再檢查一次
    if (write && !force) {
        const expectedDate = getLastClosedTradingDate(now);
        if (await redisClient.exists(cardPackKeys.pool(expectedDate))) {
            logger.info(`[CardPack] ${expectedDate} 的卡池已存在，略過（連行情都不用抓；要重生請加 force）`);
            return null;
        }
    }

    // 美股還在盤中是預期情況（等下一個排程），其他失敗照樣丟出
    const market = await collectSnapshots(companies).catch((err) => {
        if (err instanceof MarketOpenError) return null;
        throw err;
    });
    if (!market) {
        logger.warn('[CardPack] 美股盤中（marketState=REGULAR），略過本次生成');
        return null;
    }
    const { date, snapshots } = market;

    if (write && !force && (await redisClient.exists(cardPackKeys.pool(date)))) {
        logger.info(`[CardPack] ${date} 的卡池已存在，略過（要重生請加 force）`);
        return null;
    }

    const results = await mapLimit(snapshots, GEMINI_CONCURRENCY, async (snapshot) => {
        try {
            return { snapshot, content: await generateContentWithRetry(snapshot) };
        } catch (err) {
            logger.error(`[CardPack] ${snapshot.symbol} 生成失敗，這一家略過`, err);
            return null;
        }
    });
    const generated = results.filter((r): r is NonNullable<typeof r> => r !== null);

    // 稀有度在「成功的卡」之間排名，某一家失敗不會讓某個等級空掉
    const rarities = assignRarities(
        generated.map(({ snapshot }) => ({ symbol: snapshot.symbol, score: snapshot.signals.score }))
    );
    const cards: CardPackCard[] = generated.map(({ snapshot, content }) => ({
        id: `${date}:${snapshot.symbol}`,
        date,
        symbol: snapshot.symbol,
        name: snapshot.name,
        rarity: rarities.get(snapshot.symbol) ?? 'common',
        sentiment: content.sentiment,
        signals: snapshot.signals,
        zh: content.zh,
        en: content.en,
    }));

    const pool: CardPackPool = { date, generated_at: new Date().toISOString(), cards };

    if (write) {
        if (cards.length < MIN_POOL_SIZE) {
            throw new ServerError(`[CardPack] 只有 ${cards.length} 張卡生成成功（至少 ${MIN_POOL_SIZE}），不寫入 Redis`);
        }
        await savePool(pool);
        logger.info(`[CardPack] 寫入 Redis 成功：${date}，共 ${cards.length} 張`);
    }
    return pool;
}
