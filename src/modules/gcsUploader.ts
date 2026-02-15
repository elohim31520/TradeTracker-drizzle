import { Storage } from '@google-cloud/storage';
import { Request } from 'express';
import multer from 'multer';

const storage = new Storage();
const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);

// 這就是現代的「自定義引擎」做法
const gcsStorage = {
    _handleFile: (req: Request, file: Express.Multer.File, cb: (err?: any, info?: any) => void) => {
        const fileName = `${Date.now()}-${file.originalname}`;
        const gcsFile = bucket.file(fileName);

        // 建立一個通往 GCS 的寫入流 (Write Stream)
        const stream = gcsFile.createWriteStream({
            resumable: false, // 截圖小，關閉 resumable 效率更高
            contentType: file.mimetype,
            metadata: {
                cacheControl: 'public, max-age=31536000',
            }
        });

        // 關鍵！直接將 Multer 提供的檔案串流導向 GCS
        file.stream.pipe(stream);

        stream.on('error', (err) => cb(err));
        stream.on('finish', () => {
            cb(null, {
                filename: fileName,
                gcsUri: `gs://${bucket.name}/${fileName}`,
                publicUrl: `https://storage.googleapis.com/${bucket.name}/${fileName}`
            });
        });
    },
    _removeFile: (req: Request, file: Express.Multer.File, cb: (err: Error | null) => void) => {
        // 如果發生錯誤需要清理 GCS 上的檔案，可以在這裡寫
        cb(null);
    }
};

export const uploader = multer({
    storage: gcsStorage as any,
    limits: { fileSize: 5 * 1024 * 1024 }
});