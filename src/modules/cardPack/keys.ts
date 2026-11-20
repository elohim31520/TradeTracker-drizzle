/**
 * 卡包的 Redis key 命名。只有字串組合、沒有任何依賴，服務、生成器與測試都從這裡取，
 * 不在別處手寫 key。各 key 的過期時間在 constant/cardPack.ts 的 CARD_PACK_TTL。
 */
export const cardPackKeys = {
    /** 最新的卡池（整包 JSON） */
    poolLatest: 'cardpack:pool:latest',
    /** 指定交易日的卡池 */
    pool: (date: string) => `cardpack:pool:${date}`,
    /** 使用者當天已拆的包數（整數） */
    opens: (userId: string, day: string) => `cardpack:opens:${userId}:${day}`,
    /**
     * 使用者在某個池子裡已抽過的卡片 id（Set）。依「池子日期」分開，不是依抽卡的日期：
     * 沒有新池子的日子（週日、週一、休市日）次數照樣重發，同一個池子的已抽過會跨天累積，
     * 換新池子才從空的開始。
     */
    drawn: (userId: string, poolDate: string) => `cardpack:drawn:${userId}:${poolDate}`,
    /** 抽卡紀錄（List，最新的在前） */
    history: (userId: string) => `cardpack:history:${userId}`,
    /** 抽卡中的單人鎖，防連點同時抽 */
    lock: (userId: string) => `cardpack:lock:${userId}`,
    /** 啟動時補卡池的鎖（不和使用者的鎖放在同一個命名空間，避免撞名） */
    bootstrapLock: 'cardpack:bootstrap-lock',
} as const;
