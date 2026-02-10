import { Request, Response, NextFunction } from 'express';
import { Storage } from '@google-cloud/storage';

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME as string

export const uploadToGCS = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.file) {
            return next(new Error('找不到上傳的檔案'));
        }

        const fileName = `${Date.now()}-${req.user?.email || 'anonymous'}-${req.file.originalname}`;
        const blob = storage.bucket(bucketName).file(fileName);

        await blob.save(req.file.buffer, {
            contentType: req.file.mimetype,
            resumable: false,
        });

        const bucket = storage.bucket(bucketName);
        const gcsUri = `gs://${bucket.name}/${fileName}`;

        req.imagePart = {
            fileData: {
                fileUri: gcsUri,
                mimeType: req.file.mimetype
            }
        };

        next();
    } catch (error) {
        console.error('GCS Upload Error:', error);
        next(error);
    }
};