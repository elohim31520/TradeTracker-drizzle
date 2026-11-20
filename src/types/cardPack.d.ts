export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary';

/** 走勢偏向：由模型依數據判斷，不是投資建議 */
export type CardSentiment = 'bullish' | 'bearish' | 'neutral';

/** 程式依行情算出的數字（不經過模型），卡面顯示與稀有度排名都用這組 */
export interface CardSignals {
    /** 收盤價（美元） */
    price: number;
    /** 當日漲跌幅（%，-3.53 代表 -3.53%） */
    dayChgPct: number;
    volume: number;
    /** 當日成交量 ÷ 近 10 日平均量（Yahoo 報價的均量）；沒有均量時為 null */
    volumeRatio: number | null;
    /** |當日漲跌幅| ÷ 近 20 日平均 |單日漲跌幅|（資料庫的歷史）；歷史不足或過期時為 null */
    moveMultiple: number | null;
    /** 近 20 個交易日累計漲跌幅（%）；歷史不足時為 null */
    change20dPct: number | null;
    /** 異動分數 = max(moveMultiple, volumeRatio, |dayChgPct| ÷ 2)。稀有度依這個排名 */
    score: number;
}

/** 單一語言的卡片文字（模型產出） */
export interface CardContent {
    headline: string;
    summary: string;
    points: string[];
    /** 後續觀察重點（條件式描述，不是建議） */
    watch: string;
}

export interface CardPackCard {
    /** `${date}:${symbol}`，抽卡時用來排除已抽過的卡 */
    id: string;
    /** 資料所屬的美東交易日 yyyy-MM-dd */
    date: string;
    symbol: string;
    name: string;
    rarity: CardRarity;
    sentiment: CardSentiment;
    signals: CardSignals;
    zh: CardContent;
    en: CardContent;
}

/** 一天的卡池，整包放進 Redis */
export interface CardPackPool {
    date: string;
    generated_at: string;
    cards: CardPackCard[];
}

// ---------- API 回傳 ----------

/** 今日異動（給前端跑馬燈）：只有數字，不含分析文字與稀有度 */
export interface CardPackMover {
    symbol: string;
    name: string;
    dayChgPct: number;
    volumeRatio: number | null;
}

/** GET /card-pack/today（公開） */
export interface CardPackToday {
    /** 卡池所屬的美東交易日；還沒準備好時為 null */
    date: string | null;
    ready: boolean;
    dailyOpens: number;
    /** 依異動分數由高到低 */
    movers: CardPackMover[];
}

/** 抽卡紀錄的一筆（卡片的精簡版，清單用） */
export interface CardPackHistoryEntry {
    id: string;
    date: string;
    symbol: string;
    name: string;
    rarity: CardRarity;
    sentiment: CardSentiment;
    headline: { zh: string; en: string };
    /** ISO 時間 */
    drawnAt: string;
}

/** GET /card-pack/me（需登入） */
export interface CardPackMe {
    date: string | null;
    ready: boolean;
    dailyOpens: number;
    /** 今天（UTC 日）還剩幾包 */
    remaining: number;
    /** 最新的在前 */
    history: CardPackHistoryEntry[];
}

/** POST /card-pack/draw（需登入） */
export interface CardPackDrawResult {
    card: CardPackCard;
    date: string;
    remaining: number;
}
