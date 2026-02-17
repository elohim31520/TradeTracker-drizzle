import express from 'express'
import tradeController from '../controller/tradeController'
import { authMiddleware } from '../middleware/auth'
import validate from '../middleware/validate'
import { createSchema, getAllSchema, bulkCreateSchema, imageUploadSchema, aiJobSchema } from '../schemas/tradeSchema'
import checkAiUsageLimit from '../middleware/aiUsageLimiter'
import { uploader } from '../modules/gcsUploader'
import { ClientError } from '../modules/errors'
import { Request, Response, NextFunction } from 'express'

// const memUpload = multer({
//     storage: multer.memoryStorage(),
//     limits: { fileSize: 5 * 1024 * 1024 } // 限制 5MB
// });

const router = express.Router()

// 所有交易路由都需要身份驗證
router.use(authMiddleware)

// 交易 CRUD 操作
router.post('/', validate(createSchema), tradeController.create)
router.post('/bulk', validate(bulkCreateSchema), tradeController.bulkCreate)
router.get('/', validate(getAllSchema, 'query'), tradeController.getAll)  // 獲取用戶的所有交易（分頁）
router.get('/:id', tradeController.getById)
router.put('/:id', tradeController.update)
router.delete('/:id', tradeController.delete)

// 上傳圖片，ai做辨識轉成寫入資料
// router.post(
//     '/analyze-screenshot',
//     checkAiUsageLimit,
//     memUpload.single('image'),
//     validate(imageUploadSchema, 'file'),
//     uploadToGCS,
//     tradeController.handleTradeExtraction,
// );

const convertGcsToImagePart = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const file = req.file as any;

        if (!file) {
            throw new ClientError('找不到圖片資料');
        }

        req.imagePart = {
            fileData: {
                fileUri: file.gcsUri,
                mimeType: file.mimetype
            }
        };
        next();
    } catch (error) {
        next(error);
    }
};


// 改成直接stream到GCS，不經由vm memory
router.post(
    '/analyze-screenshot',
    checkAiUsageLimit,
    uploader.single('image'),
    convertGcsToImagePart,
    tradeController.handleTradeExtraction,
);

router.get('/ai-job/:jobId', validate(aiJobSchema, 'params'), tradeController.getAIJobStatus)

export default router