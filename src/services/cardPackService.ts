import { formatInTimeZone } from 'date-fns-tz';
import redisClient from '../modules/redis';
import logger from '../modules/logger';
import { AppError, ConflictError } from '../modules/errors';
import {
    CARD_PACK_DAILY_OPENS,
    CARD_PACK_HISTORY_LIMIT,
    CARD_PACK_RESET_TIMEZONE,
    CARD_PACK_TTL,
} from '../constant/cardPack';
import { cardPackKeys } from '../modules/cardPack/keys';
import type {
    CardPackCard,
    CardPackDrawResult,
    CardPackHistoryEntry,
    CardPackMe,
    CardPackPool,
    CardPackToday,
} from '../types/cardPack';

/** 重發次數的日期 yyyy-MM-dd（UTC）：次數以它為界，每天 UTC 00:00 重發 */
const resetDay = (now: Date) => formatInTimeZone(now, CARD_PACK_RESET_TIMEZONE, 'yyyy-MM-dd');

/** 目前的卡池；還沒上傳、已過期或內容壞掉都回 null（對外一律是「準備中」） */
export async function getPool(): Promise<CardPackPool | null> {
    const raw = await redisClient.get(cardPackKeys.poolLatest);
    if (!raw) return null;
    try {
        const pool = JSON.parse(raw) as CardPackPool;
        return Array.isArray(pool.cards) && pool.cards.length > 0 ? pool : null;
    } catch {
        logger.error('[CardPack] Redis 裡的卡池不是合法 JSON，視為尚未準備好');
        return null;
    }
}

/**
 * 公開資訊：卡池好了沒，以及各家今日的異動（給跑馬燈）。
 * 只有數字，不含分析文字與稀有度，不會洩漏抽卡內容。
 */
export async function getToday(): Promise<CardPackToday> {
    const pool = await getPool();
    if (!pool) return { date: null, ready: false, dailyOpens: CARD_PACK_DAILY_OPENS, movers: [] };

    const movers = [...pool.cards]
        .sort((a, b) => b.signals.score - a.signals.score || a.symbol.localeCompare(b.symbol))
        .map((card) => ({
            symbol: card.symbol,
            name: card.name,
            dayChgPct: card.signals.dayChgPct,
            volumeRatio: card.signals.volumeRatio,
        }));
    return { date: pool.date, ready: true, dailyOpens: CARD_PACK_DAILY_OPENS, movers };
}

function parseHistory(rows: string[]): CardPackHistoryEntry[] {
    const entries: CardPackHistoryEntry[] = [];
    for (const row of rows) {
        try {
            entries.push(JSON.parse(row) as CardPackHistoryEntry);
        } catch {
            // 壞掉的一筆略過，不影響其他紀錄
        }
    }
    return entries;
}

async function remainingOpens(userId: string, now: Date): Promise<number> {
    const used = Number(await redisClient.get(cardPackKeys.opens(userId, resetDay(now))) ?? 0);
    return Math.max(0, CARD_PACK_DAILY_OPENS - used);
}

/** 使用者自己的狀態：今天還剩幾包、抽卡紀錄（最新的在前） */
export async function getMe(userId: string, now: Date = new Date()): Promise<CardPackMe> {
    const [pool, remaining, rows] = await Promise.all([
        getPool(),
        remainingOpens(userId, now),
        redisClient.lRange(cardPackKeys.history(userId), 0, CARD_PACK_HISTORY_LIMIT - 1),
    ]);
    return {
        date: pool?.date ?? null,
        ready: pool !== null,
        dailyOpens: CARD_PACK_DAILY_OPENS,
        remaining,
        history: parseHistory(rows),
    };
}

export interface DrawOptions {
    now?: Date;
    /** 回 [0, 1)；測試時可注入 */
    random?: () => number;
}

/**
 * 拆一包：從目前的卡池等機率抽一張，排除這個池子裡已經抽過的卡。
 *
 * 順序很重要：先確認卡池存在，再取鎖與檢查次數，最後才一次性寫入「次數 +1、已抽過、紀錄」。
 * 所以卡池還沒準備好（503）或任何一步失敗，都不會扣到次數。
 * 抽完整個池子後（連假期間同一個池子撐很多天）就忽略排除、允許重複，而不是報錯。
 */
export async function draw(userId: string, options: DrawOptions = {}): Promise<CardPackDrawResult> {
    const { now = new Date(), random = Math.random } = options;

    const pool = await getPool();
    if (!pool) throw new AppError('今日卡包準備中', 503);

    const lockKey = cardPackKeys.lock(userId);
    // SET NX：key 不存在才寫入並回 'OK'（這個請求拿到鎖）；key 已存在（同一個人的另一個請求正在抽）回 null
    const acquired = await redisClient.set(lockKey, '1', { NX: true, EX: CARD_PACK_TTL.lockSeconds });
    if (!acquired) throw new ConflictError('抽卡處理中，請稍後再試');

    try {
        const opensKey = cardPackKeys.opens(userId, resetDay(now));
        const used = Number((await redisClient.get(opensKey)) ?? 0);
        if (used >= CARD_PACK_DAILY_OPENS) throw new AppError('今日抽卡次數已用完', 429);

        // 已抽過的清單是「每個池子一份」（key 帶池子日期），不是每天一份：
        // 池子只在美股交易日收盤後由管理員上傳（台北週二到週六早上），週日、週一與休市日沒有新池子，
        // 但次數照樣每天（UTC）重發。例如週五收盤的池子在台北週六早上上傳，週六、週日、週一
        // 每天重發的 5 包都從這同一個池子抽，已抽過的跨天累積（最多 15 張，不重複）；
        // 週二早上週一收盤的新池子出來，是另一個 key，已抽過從空的開始。
        // 池子連假撐太多天、整個抽過一輪時，下面會忽略排除、重新輪一輪。
        const drawnKey = cardPackKeys.drawn(userId, pool.date);
        const drawn = new Set(await redisClient.sMembers(drawnKey));
        let candidates = pool.cards.filter((card) => !drawn.has(card.id));
        if (candidates.length === 0) {
            candidates = pool.cards;
            await redisClient.del(drawnKey);
        }

        const card: CardPackCard = candidates[Math.min(Math.floor(random() * candidates.length), candidates.length - 1)]!;
        const entry: CardPackHistoryEntry = {
            id: card.id,
            date: card.date,
            symbol: card.symbol,
            name: card.name,
            rarity: card.rarity,
            sentiment: card.sentiment,
            headline: { zh: card.zh.headline, en: card.en.headline },
            drawnAt: now.toISOString(),
        };

        const historyKey = cardPackKeys.history(userId);
        await redisClient
            .multi()
            .incr(opensKey)
            .expire(opensKey, CARD_PACK_TTL.opens)
            .sAdd(drawnKey, card.id)
            .expire(drawnKey, CARD_PACK_TTL.drawn)
            .lPush(historyKey, JSON.stringify(entry))
            .lTrim(historyKey, 0, CARD_PACK_HISTORY_LIMIT - 1)
            .expire(historyKey, CARD_PACK_TTL.history)
            .exec();

        return { card, date: pool.date, remaining: CARD_PACK_DAILY_OPENS - used - 1 };
    } finally {
        await redisClient.del(lockKey);
    }
}

/** 開發用：清掉這位使用者今天的次數、目前池子的已抽過清單與紀錄。只在非 production 的路由使用 */
export async function resetUser(userId: string, now: Date = new Date()): Promise<void> {
    const pool = await getPool();
    const keys = [cardPackKeys.opens(userId, resetDay(now)), cardPackKeys.history(userId), cardPackKeys.lock(userId)];
    if (pool) keys.push(cardPackKeys.drawn(userId, pool.date));
    await redisClient.del(keys);
}

export default { getPool, getToday, getMe, draw, resetUser };
