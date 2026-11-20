import redisClient from '../redis';
import logger from '../logger';
import { ClientError, ConflictError } from '../errors';
import { CARD_PACK_MIN_POOL_SIZE, CARD_PACK_TTL } from '../../constant/cardPack';
import { HOT_COMPANIES } from '../../constant/hotCompanies';
import type { CardPackCard, CardPackPool, CardPackPublishResult } from '../../types/cardPack';
import { parsePublishInput } from './cardContent';
import { collectSnapshots, MarketOpenError } from './marketData';
import { assignRarities } from './signals';
import { cardPackKeys } from './keys';

/**
 * 寫入卡池：當天的池子一定寫；「最新卡池」只在不比現有的舊時才更新。
 * 補傳比較舊的日期時，不要把比較新的 latest 蓋回去。回傳這個池子是否成為最新卡池。
 */
export async function savePool(pool: CardPackPool): Promise<boolean> {
    const payload = JSON.stringify(pool);

    let latestDate: string | null = null;
    try {
        const latest = await redisClient.get(cardPackKeys.poolLatest);
        latestDate = latest ? (JSON.parse(latest) as CardPackPool).date : null;
    } catch {
        // latest 壞掉或讀不到就當作沒有，直接覆蓋
    }

    await redisClient.set(cardPackKeys.pool(pool.date), payload, { EX: CARD_PACK_TTL.pool });
    const isLatest = !latestDate || latestDate <= pool.date;
    if (isLatest) {
        await redisClient.set(cardPackKeys.poolLatest, payload, { EX: CARD_PACK_TTL.pool });
    }
    return isLatest;
}

/**
 * 管理員上傳一個交易日的卡池（POST /card-pack/pool）。卡片的文字由管理員在本機寫好，
 * 伺服器負責其餘的部分：驗證內容 → 抓最近一個收盤日的行情 → 補上名稱與數字（signals）
 * → 在上傳的卡之間依異動分數排名分稀有度 → 寫入 Redis。
 *
 * - 同一天重傳會整包覆蓋，不用另外清 Redis。
 * - 上傳的 date 必須和伺服器目前的行情日期一致：卡片裡的文字是照某一天的數字寫的，日期對不上就退回，
 *   不會把前一天的分析貼到今天的數字上。
 * - 美股盤中的報價是即時價，不是收盤價，所以盤中拒收（409），收盤後再傳。
 * - 行情不完整或過時的公司會被略過並列在回傳的 skipped；剩下的卡不足 CARD_PACK_MIN_POOL_SIZE 就整批不寫入。
 * 內容有問題丟 ClientError（400），日期對不上或盤中丟 ConflictError（409）。
 */
export async function publishCardPack(body: unknown): Promise<CardPackPublishResult> {
    // 先驗證內容再去抓行情：格式有誤的請求不會打 Yahoo 也不會讀資料庫
    const input = parsePublishInput(body);

    const market = await collectSnapshots(HOT_COMPANIES).catch((err) => {
        if (err instanceof MarketOpenError) {
            throw new ConflictError('美股盤中，報價還不是收盤價，請收盤後再上傳');
        }
        throw err;
    });
    if (market.date !== input.date) {
        throw new ConflictError(`目前的行情是美東 ${market.date} 的收盤，上傳的內容是 ${input.date}，請確認日期後重傳`);
    }

    const snapshotBySymbol = new Map(market.snapshots.map((s) => [s.symbol, s]));
    const usable = input.cards.flatMap((card) => {
        const snapshot = snapshotBySymbol.get(card.symbol);
        return snapshot ? [{ card, snapshot }] : [];
    });
    const skipped = input.cards.filter((card) => !snapshotBySymbol.has(card.symbol)).map((card) => card.symbol);
    if (skipped.length) logger.warn(`[CardPack] 這些代號沒有可用的行情，略過：${skipped.join(',')}`);

    if (usable.length < CARD_PACK_MIN_POOL_SIZE) {
        const detail = skipped.length ? `（沒有行情而略過：${skipped.join(',')}）` : '';
        throw new ClientError(`有行情的卡只有 ${usable.length} 張，至少要 ${CARD_PACK_MIN_POOL_SIZE} 張才會寫入${detail}`);
    }

    // 稀有度只在實際寫入的卡之間排名，某一家被略過不會讓某個等級空掉
    const rarities = assignRarities(usable.map(({ snapshot }) => ({ symbol: snapshot.symbol, score: snapshot.signals.score })));
    const cards: CardPackCard[] = usable.map(({ card, snapshot }) => ({
        id: `${market.date}:${snapshot.symbol}`,
        date: market.date,
        symbol: snapshot.symbol,
        name: snapshot.name,
        rarity: rarities.get(snapshot.symbol) ?? 'common',
        sentiment: card.sentiment,
        signals: snapshot.signals,
        zh: card.zh,
        en: card.en,
    }));

    const pool: CardPackPool = { date: market.date, generated_at: new Date().toISOString(), cards };
    const isLatest = await savePool(pool);
    logger.info(`[CardPack] 管理員上傳卡池成功：${market.date}，共 ${cards.length} 張${isLatest ? '' : '（不是最新的日期，沒有更新 latest）'}`);

    return { date: market.date, count: cards.length, skipped, isLatest };
}
