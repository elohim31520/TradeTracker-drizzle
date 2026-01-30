import amqp from 'amqplib';
import type { Connection, Channel } from 'amqplib';

class RabbitMQManager {
    private static instance: RabbitMQManager;
    private connection: Connection | null = null;
    private readonly url: string = 'amqp://localhost';
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

    public async init(): Promise<void> {
        if (this.connection || this.isConnecting) return;

        this.isConnecting = true;

        try {
            this.connection = await amqp.connect(this.url);
            this.retryCount = 0;
            console.log('✅ RabbitMQ Connected');

            // 監聽連線錯誤與斷開
            this.connection.on('error', (err) => {
                console.error('❌ RabbitMQ Connection error:', err);
                this.handleReconnect();
            });

            this.connection.on('close', () => {
                console.warn('⚠️ RabbitMQ Connection closed');
                this.handleReconnect();
            });

        } catch (error) {
            console.error('❌ Failed to connect to RabbitMQ:', error);
            this.handleReconnect();
        } finally {
            this.isConnecting = false;
        }
    }

    private handleReconnect() {
        if (this.isConnecting) return;

        this.connection = null;
        this.channels.clear();
        const delay = Math.min(30000, Math.pow(2, this.retryCount) * 1000); // 最大延遲 30s
        console.log(`🔄 Attempting to reconnect in ${delay / 1000}s...`);

        setTimeout(() => {
            this.retryCount++;
            this.init();
        }, delay);
    }

    public async createChannel(): Promise<amqp.Channel> {
        if (!this.connection) {
            await this.init();
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
        if (!this.connection) await this.init();

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