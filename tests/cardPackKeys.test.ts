import { cardPackKeys } from '../src/modules/cardPack/keys';

// 這些 key 的格式是程式與 Redis 裡既有資料之間的約定：改了格式，線上已經存在的次數、紀錄就對不上。
// 所以把格式固定在測試裡，要改的時候會看到這裡失敗，提醒自己要處理舊資料。
describe('cardPackKeys', () => {
    test('卡池', () => {
        expect(cardPackKeys.poolLatest).toBe('cardpack:pool:latest');
        expect(cardPackKeys.pool('2026-11-19')).toBe('cardpack:pool:2026-11-19');
    });

    test('使用者的次數、已抽過、紀錄', () => {
        expect(cardPackKeys.opens('u1', '2026-11-20')).toBe('cardpack:opens:u1:2026-11-20');
        expect(cardPackKeys.drawn('u1', '2026-11-19')).toBe('cardpack:drawn:u1:2026-11-19');
        expect(cardPackKeys.history('u1')).toBe('cardpack:history:u1');
    });

    test('兩把鎖：單人抽卡鎖與啟動補生成鎖不在同一個命名空間，不會撞名', () => {
        expect(cardPackKeys.lock('u1')).toBe('cardpack:lock:u1');
        expect(cardPackKeys.bootstrapLock).toBe('cardpack:bootstrap-lock');
        // 就算有人的 id 剛好叫 bootstrap-lock，也不會踩到啟動補生成的鎖
        expect(cardPackKeys.lock('bootstrap-lock')).not.toBe(cardPackKeys.bootstrapLock);
    });

    test('同一個使用者不同日期的 key 不同；不同使用者的 key 不同', () => {
        expect(cardPackKeys.opens('u1', '2026-11-20')).not.toBe(cardPackKeys.opens('u1', '2026-11-21'));
        expect(cardPackKeys.opens('u1', '2026-11-20')).not.toBe(cardPackKeys.opens('u2', '2026-11-20'));
        expect(cardPackKeys.drawn('u1', '2026-11-19')).not.toBe(cardPackKeys.drawn('u1', '2026-11-20'));
    });
});
