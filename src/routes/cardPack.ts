import express from 'express';
import { authMiddleware } from '../middleware/auth';
import cardPackController from '../controller/cardPackController';

const router = express.Router();

// 公開：卡池好了沒、今日異動（給前端跑馬燈與「準備中」提示），沒有抽卡內容
router.get('/today', cardPackController.getToday);

// 以下都要登入：抽卡的次數、排除清單與紀錄都以使用者 id 記在 Redis
router.get('/me', authMiddleware, cardPackController.getMe);
router.post('/draw', authMiddleware, cardPackController.draw);

// 本機測試用的重設，正式環境不註冊這條路由
if (process.env.NODE_ENV !== 'production') {
    router.post('/dev/reset', authMiddleware, cardPackController.devReset);
}

export default router;
