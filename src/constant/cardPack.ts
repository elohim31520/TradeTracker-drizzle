/**
 * 每位使用者每天（UTC）可拆的卡包數。
 * 次數只看 UTC 日，跟有沒有新池子無關：沒有新池子的日子（週日、週一、休市日）照樣重發，
 * 所以同一個池子可能被同一個人抽好幾天（已抽過的清單會跨天累積，見 cardPackKeys.drawn）。
 */
export const CARD_PACK_DAILY_OPENS = 5;
/**
 * 一個卡池最少要有幾張卡才收。等於每人每天可拆的包數：再少連一天都抽不滿。
 * 上傳的卡少於這個數量、或有行情的卡少於這個數量，都不寫入。
 */
export const CARD_PACK_MIN_POOL_SIZE = CARD_PACK_DAILY_OPENS;
/** 每位使用者保留的抽卡紀錄筆數（最新的在前） */
export const CARD_PACK_HISTORY_LIMIT = 50;
/** 「每天」的界線：UTC 00:00（台北時間 08:00）重發次數 */
export const CARD_PACK_RESET_TIMEZONE = 'UTC';

const DAY = 60 * 60 * 24;

export const CARD_PACK_TTL = {
    /**
     * 卡池留 5 天。管理員在台北週二到週六早上上傳（對應美股週一到週五的收盤），
     * 週五收盤的池子週六早上上傳，要撐到週二早上的下一個池子（約 72 小時）；
     * 美股週一休市時還要再多一天，所以留 5 天，這段期間前端看到的是前一個交易日的池子。
     */
    pool: DAY * 5,
    /** 次數的 key 帶 UTC 日期，隔天就用不到了 */
    opens: DAY * 2,
    /** 已抽過的卡（依池子日期），池子最長活 5 天，多留 2 天 */
    drawn: DAY * 7,
    history: DAY * 90,
    /** 抽卡的單人鎖：一次抽卡只要幾毫秒，這只是防當機後鎖卡死 */
    lockSeconds: 10,
    /**
     * 啟動時補卡池的鎖：生成要幾分鐘，鎖住這段時間，也讓失敗後的 30 分鐘內不會因為容器反覆重啟
     * 而一直打 Gemini。成功後卡池就在了，下次啟動不會再走到這裡。
     */
    bootstrapLockSeconds: 60 * 30,
} as const;
