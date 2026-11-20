import express from 'express';
import { authMiddleware } from '../middleware/auth';
import { verifyAdmin } from '../middleware/adminAuth';
import cardPackController from '../controller/cardPackController';

const router = express.Router();

// 公開：卡池好了沒、今日異動（給前端跑馬燈與「準備中」提示），沒有抽卡內容
router.get('/today', cardPackController.getToday);

// 以下都要登入：抽卡的次數、排除清單與紀錄都以使用者 id 記在 Redis
router.get('/me', authMiddleware, cardPackController.getMe);
router.post('/draw', authMiddleware, cardPackController.draw);

// 管理員上傳卡池：文字由管理員在本機寫好 POST 上來，伺服器補行情數字與稀有度（沒有任何排程會自動生成）
router.post('/pool', authMiddleware, verifyAdmin, cardPackController.publishPool);

// 本機測試用的重設，正式環境不註冊這條路由
if (process.env.NODE_ENV !== 'production') {
    router.post('/dev/reset', authMiddleware, cardPackController.devReset);
}

export default router;
