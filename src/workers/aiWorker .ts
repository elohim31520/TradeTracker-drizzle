import { rabbitMQ } from '../modules/rabbitMQManager';
import { geminiModel } from '../modules/vertexAi';
import { ServerError } from '../modules/errors';
import { bulkCreateSchema } from '../schemas/tradeSchema'
import redisClient from '../modules/redis';

const AI_EXCHANGE_NAME = 'ai_exchange';
const AI_QUEUE_NAME = 'ai_processing_queue';
const AI_DLX_NAME = 'ai_dlx';
const AI_DLQ_NAME = 'ai_dead_letter_queue';

const PROMPT = `
    請分析圖片中的交易紀錄，並將其中文字轉換為以下 JSON 陣列格式 createSchema[]。

    const createSchema = Joi.object({
        companyId: Joi.number().required(),
        tradeType: Joi.string().valid('buy', 'sell').required(),
        quantity: Joi.number().integer().positive().required(),
        price: Joi.number().precision(2).positive().required(),
        tradeDate: Joi.date().iso().required(),
    })

    上述是拿JOI驗證的格式給你參考，到時候API接收的資料屬性就是長這樣
    最終幫我拼湊出完整的 createSchema[]
    如果沒資料返回[]
。`

const parseGeminiResponse = (text: string): any[] => {
    let extractedData;

    try {
        extractedData = JSON.parse(
            text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
        );
    } catch (e) {
        throw new Error('AI 回傳格式錯誤，無法解析 JSON');
    }

    if (!Array.isArray(extractedData)) extractedData = [extractedData];

    if (!extractedData.length) {
        throw new ServerError('AI 回傳格式錯誤，無法解析 JSON，請確保截圖裡的文字正確');
    }

    return extractedData;
};

const updateJobStatus = async (jobId: string, status: 'success' | 'failed', message?: string) => {
    try {
        await redisClient.set(`ai:trade:extraction:${jobId}`, JSON.stringify({
            status,
            ...(message && { message }),
        }), { EX: 300 });
    } catch (err) {
        console.error(`Failed to update job status for ${jobId}:`, err);
    }
};

export const startAiWorker = async () => {
    const channel = await rabbitMQ.getOrCreateChannel(`consumer-${AI_QUEUE_NAME}`);

    // 1. 確保 Dead Letter Exchange 存在（AI 失敗不重試，導到 DLX）
    await channel.assertExchange(AI_DLX_NAME, 'direct', { durable: true });
    await channel.assertQueue(AI_DLQ_NAME, { durable: true });
    await channel.bindQueue(AI_DLQ_NAME, AI_DLX_NAME, AI_DLQ_NAME);
    console.log(`✅ Dead Letter Exchange/Queue ready: ${AI_DLX_NAME} → ${AI_DLQ_NAME}`);

    // 2. 確保 AI Exchange 存在
    await channel.assertExchange(AI_EXCHANGE_NAME, 'topic', { durable: true });
    console.log(`✅ Exchange created: ${AI_EXCHANGE_NAME}`);

    // 3. 確保 AI Queue 存在，失敗導向 DLX
    await channel.assertQueue(AI_QUEUE_NAME, {
        durable: true,
        arguments: {
            'x-dead-letter-exchange': AI_DLX_NAME,
            'x-dead-letter-routing-key': AI_DLQ_NAME,
        },
    });
    console.log(`✅ Queue created: ${AI_QUEUE_NAME}`);

    // 4. 綁定 Queue 到 Exchange
    await channel.bindQueue(AI_QUEUE_NAME, AI_EXCHANGE_NAME, 'ai.extract.*');
    console.log(`✅ Queue bound to exchange with routing pattern: ai.extract.*`);

    // 5. AI 呼叫限制並發，避免打爆 Gemini quota
    await channel.prefetch(3);

    // 6. 開始消費
    console.log(`🔥 Consumer ready for queue: ${AI_QUEUE_NAME}`);

    await channel.consume(AI_QUEUE_NAME, async (msg) => {
        if (!msg) return;

        const { imagePart, userId, jobId } = JSON.parse(msg.content.toString());

        console.log(`📨 [AI Worker] Received extraction request for user: ${userId}`);

        try {
            console.log(`🤖 [AI Worker] Calling Gemini...`);
            // 呼叫 Gemini
            const result = await geminiModel.generateContent({
                contents: [{
                    role: 'user',
                    parts: [
                        { text: PROMPT },
                        imagePart,
                    ],
                }],
            });

            const part = result.response.candidates?.[0]?.content?.parts?.[0];

            if (!part?.text) {
                throw new Error('AI 未能產生有效的文字內容');
            }

            const extractedData = parseGeminiResponse(part.text);

            // 驗證每筆資料
            const { error, value } = bulkCreateSchema.validate(extractedData);
            if (error) {
                // AI 解析出來的資料格式不對，重試也沒用，直接放棄這筆
                console.warn(`⚠️ [AI Worker] Validation failed for user: ${userId}`, error.details);
                await updateJobStatus(jobId, 'failed', 'AI 解析的資料格式不正確，請確保截圖清晰');
                channel.ack(msg); // ack 掉，不進 DLQ
                return;
            }

            // 驗證通過才丟給 tradeWorker
            await rabbitMQ.publish('trade_exchange', 'trade.create.bulk',
                extractedData.map((item: any) => ({ ...item, userId }))
            );

            console.log(`✅ [AI Worker] Extraction success for user: ${userId}, ${extractedData.length} trades queued`);
            await updateJobStatus(jobId, 'success');
            channel.ack(msg);

        } catch (error) {
            // AI 相關失敗不重試，直接進 DLQ，避免無限 loop
            console.error(`❌ [AI Worker] Extraction failed for user: ${userId}`, error);
            await updateJobStatus(jobId, 'failed', 'AI 服務暫時無法使用，請稍後再試');
            channel.nack(msg, false, false);
        }
    }, { noAck: false });
};