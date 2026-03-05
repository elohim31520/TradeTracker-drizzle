import amqp from 'amqplib';
import type { Connection, Channel } from 'amqplib';
import 'dotenv/config';

class RabbitMQManager {
    private static instance: RabbitMQManager;
    private connection: Connection | null = null;
    private readonly url: string = process.env.RABBITMQ_URL!;
    private isConnecting: boolean = false;
    private retryCount: number = 0;
    private channels: Map<string, Channel> = new Map();

    private constructor() { }

    public static getInstance(): RabbitMQManager {
        if (!RabbitMQManager.instance) {
            RabbitMQManager.instance = new RabbitMQManager();
        }
        return RabbitMQManager.instance;
    }

    public async connect(): Promise<void> {
        if (this.connection || this.isConnecting) return;

        this.isConnecting = true;

        try {
            this.connection = await amqp.connect(this.url);
            this.retryCount = 0;
            console.log('✅ RabbitMQ Connected');

            // 監聽連線錯誤與斷開
            this.connection.on('error', (err) => {
                console.error('❌ RabbitMQ Connection error:', err);
                this.reconnect();
            });

            this.connection.on('close', () => {
                console.warn('⚠️ RabbitMQ Connection closed');
                this.reconnect();
            });

        } catch (error) {
            console.error('❌ Failed to connect to RabbitMQ:', error);
            this.reconnect();
        } finally {
            this.isConnecting = false;
        }
    }

    private reconnect() {
        if (this.isConnecting) return;

        this.connection = null;
        this.channels.clear();
        const delay = Math.min(30000, Math.pow(2, this.retryCount) * 1000); // 最大延遲 30s
        console.log(`🔄 Attempting to reconnect in ${delay / 1000}s...`);

        setTimeout(() => {
            this.retryCount++;
            this.connect();
        }, delay);
    }

    public async createChannel(): Promise<amqp.Channel> {
        if (!this.connection) {
            await this.connect();
        }

        if (!this.connection) {
            throw new Error('Could not establish RabbitMQ connection');
        }

        const channel: Channel = await this.connection.createChannel();

        channel.on('error', (err: any) => {
            console.error('❌ RabbitMQ Channel error:', err);
        });

        return channel;
    }

    public async getOrCreateChannel(purpose: string): Promise<Channel> {
        const existingChannel = this.channels.get(purpose);
        if (existingChannel) return existingChannel;

        console.log(`🔨 Creating new channel for: ${purpose}`);
        const channel = await this.connection!.createChannel();

        channel.on('error', (err) => {
            console.error(`❌ Channel [${purpose}] error:`, err);
            this.channels.delete(purpose);
        });
        channel.on('close', () => {
            this.channels.delete(purpose);
        });

        this.channels.set(purpose, channel);
        return channel;
    }

    public async publish(exchange: string, routingKey: string, message: any) {
        const channel = await this.getOrCreateChannel('publisher');

        await channel.assertExchange(exchange, 'topic', { durable: true });
        return channel.publish(
            exchange,
            routingKey,
            Buffer.from(JSON.stringify(message)),
            { persistent: true }
        );
    }

    public async consume(
        queue: string,
        onMessage: (msg: amqp.ConsumeMessage | null, channel: amqp.Channel) => Promise<void> | void,
        options?: {
            exchange?: string;
            routingKeys?: string[];
        }
    ) {
        const channel = await this.getOrCreateChannel(`consumer-${queue}`);

        // 如果有 exchange，先設置綁定
        if (options?.exchange) {
            await channel.assertExchange(options.exchange, 'topic', { durable: true });
            await channel.assertQueue(queue, { durable: true });

            for (const key of (options.routingKeys || ['#'])) {
                await channel.bindQueue(queue, options.exchange, key);
            }
        } else {
            await channel.assertQueue(queue, { durable: true });
        }

        await channel.prefetch(1);
        console.log(`🔥 Consumer ready for queue: ${queue}`);

        await channel.consume(queue, async (msg) => {
            if (!msg) return;
            try {
                await onMessage(msg, channel);
                channel.ack(msg);
            } catch (error) {
                console.error(`❌ Error in consumer callback for ${queue}:`, error);
                channel.nack(msg, false, true);
            }
        }, { noAck: false });
    }
}

export const rabbitMQ = RabbitMQManager.getInstance();