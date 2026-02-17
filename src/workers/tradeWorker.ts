import { rabbitMQ } from '../modules/rabbitMQManager';
import { db } from '../db/pg';
import tradeService from '../services/tradeService';
import { portfolios, companies } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';

const EXCHANGE_NAME = 'trade_exchange';
const QUEUE_NAME = 'trade_processing_queue';
const TRADE_DLX_NAME = 'trade_dlx';
const TRADE_DLQ_NAME = 'trade_dead_letter_queue';

export const startTradeWorker = async () => {
    const channel = await rabbitMQ.getOrCreateChannel(`consumer-${QUEUE_NAME}`);

    // 確保 Dead Letter Exchange/Queue 存在
    await channel.assertExchange(TRADE_DLX_NAME, 'direct', { durable: true });
    await channel.assertQueue(TRADE_DLQ_NAME, { durable: true });
    await channel.bindQueue(TRADE_DLQ_NAME, TRADE_DLX_NAME, TRADE_DLQ_NAME);
    console.log(`✅ Dead Letter Exchange/Queue ready: ${TRADE_DLX_NAME} → ${TRADE_DLQ_NAME}`);

    // 確保 Trade Exchange 存在
    await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    console.log(`✅ Exchange created: ${EXCHANGE_NAME}`);

    // 確保 Queue 存在，失敗導向 DLX
    await channel.assertQueue(QUEUE_NAME, {
        durable: true,
        arguments: {
            'x-dead-letter-exchange': TRADE_DLX_NAME,
            'x-dead-letter-routing-key': TRADE_DLQ_NAME,
        },
    });
    console.log(`✅ Queue created: ${QUEUE_NAME}`);

    // 綁定 Queue 到 Exchange
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'trade.create.*');
    console.log(`✅ Queue bound to exchange with routing pattern: trade.create.*`);

    await channel.prefetch(1);

    console.log(`🔥 Consumer ready for queue: ${QUEUE_NAME}`);

    await channel.consume(QUEUE_NAME, async (msg) => {
        if (!msg) return;

        try {
            const content = JSON.parse(msg.content.toString());
            const routingKey = msg.fields.routingKey;

            console.log(`📨 Received message with routing key: ${routingKey}`);

            let userId: string;
            let payload: any;

            if (routingKey === 'trade.create.bulk') {
                userId = content[0]?.userId;
                payload = content;
            } else {
                console.warn(`⚠️ Unknown routing key: ${routingKey}`);
                channel.ack(msg);
                return;
            }

            await db.transaction(async (tx) => {
                // symbol 轉成 companyId
                const uniqueSymbols: string[] = Array.from(
                    new Set(payload.map((p: any) => p.stockSymbol))
                ).filter((s): s is string => !!s)

                if (uniqueSymbols.length === 0) return;

                const companyRows = await tx
                    .select({ id: companies.id, symbol: companies.symbol })
                    .from(companies)
                    .where(inArray(companies.symbol, uniqueSymbols));

                const symbolToIdMap = new Map(
                    companyRows.map((row) => [row.symbol, row.id])
                );

                const tradesToInsert = payload.map((item: any) => {
                    const companyId = symbolToIdMap.get(item.stockSymbol);

                    if (!companyId) {
                        throw new Error(`Company not found for symbol: ${item.stockSymbol}`);
                    }

                    return {
                        userId: item.userId,
                        companyId: companyId,
                        tradeType: item.tradeType,
                        quantity: item.quantity,
                        price: item.price,
                        tradeDate: item.tradeDate,
                    };
                });

                const trades = await tradeService.bulkCreate(tradesToInsert, tx)

                for (const trade of trades) {
                    const { companyId, tradeType } = trade;

                    const [portfolio] = await tx
                        .select()
                        .from(portfolios)
                        .where(
                            and(
                                eq(portfolios.userId, userId),
                                eq(portfolios.companyId, companyId)
                            )
                        )
                        .limit(1);

                    const tradeQty = Number(trade.quantity);
                    const tradePrice = Number(trade.price);

                    if (!portfolio) {
                        if (tradeType === 'buy') {
                            await tx.insert(portfolios).values({
                                userId,
                                companyId,
                                quantity: tradeQty.toString(),
                                averagePrice: tradePrice.toFixed(2),
                            });
                        }
                        continue;
                    }

                    // 計算新的數量與成本
                    const currentQty = Number(portfolio.quantity);
                    const currentAvgPrice = Number(portfolio.averagePrice);

                    let newQty: number;
                    let newAvgPrice: number = currentAvgPrice;

                    if (tradeType === 'buy') {
                        newQty = currentQty + tradeQty;
                        newAvgPrice = ((currentQty * currentAvgPrice) + (tradeQty * tradePrice)) / newQty;
                    } else {
                        // 賣出邏輯：減少數量，平均成本通常不變
                        newQty = Math.max(0, currentQty - tradeQty);
                    }

                    // 更新 Portfolio
                    await tx
                        .update(portfolios)
                        .set({
                            quantity: newQty.toString(),
                            averagePrice: newAvgPrice.toFixed(2),
                        })
                        .where(
                            and(
                                eq(portfolios.userId, userId),
                                eq(portfolios.companyId, companyId)
                            )
                        );
                }
            });

            channel.ack(msg);

        } catch (error) {
            // DB 寫入失敗或資料問題，不重試，直接進 trade_dead_letter_queue
            console.error(`❌ [Worker] Error:`, error);
            channel.nack(msg, false, false);
        }
    }, { noAck: false });
};