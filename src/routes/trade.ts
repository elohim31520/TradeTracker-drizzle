import express from 'express'
import tradeController from '../controller/tradeController'
import { authMiddleware } from '../middleware/auth'
import validate from '../middleware/validate'
import { createSchema, getAllSchema, bulkCreateSchema, imageUploadSchema, aiJobSchema } from '../schemas/tradeSchema'
import { uploadToGCS } from '../middleware/uploadToStorage';
import multer from 'multer';

const memUpload = multer({ storage: multer.memoryStorage() });

const router = express.Router()

// 所有交易路由都需要身份驗證
router.use(authMiddleware)

// 交易 CRUD 操作
router.post('/', validate(createSchema), tradeController.create)           // 創建單筆交易
router.post('/bulk', validate(bulkCreateSchema), tradeController.bulkCreate) // 批量創建交易
router.get('/', validate(getAllSchema, 'query'), tradeController.getAll)  // 獲取用戶的所有交易（分頁）
router.get('/:id', tradeController.getById)                               // 獲取單筆交易詳情
router.put('/:id', tradeController.update)                                // 更新交易記錄
router.delete('/:id', tradeController.delete)                             // 刪除交易記錄

// 上傳圖片，ai做辨識轉成寫入資料
router.post(
    '/analyze-screenshot',
    memUpload.single('image'),
    validate(imageUploadSchema, 'file'),
    uploadToGCS,
    tradeController.handleTradeExtraction,
);

router.get('/ai-job/:jobId', validate(aiJobSchema, 'params'), tradeController.getAIJobStatus)

export default router