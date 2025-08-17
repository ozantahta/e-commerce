import amqp, { Connection, Channel, Message, ConsumeMessage, Options } from 'amqplib';
import { MessageQueueConfig, BaseEvent } from '../types';
import { createServiceLogger } from './logger';
import { CircuitBreaker } from './circuit-breaker';

export class MessageQueueManager {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private readonly logger = createServiceLogger('MessageQueue');
  private readonly circuitBreaker: CircuitBreaker;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly reconnectDelay = 5000;

  constructor(private config: MessageQueueConfig) {
    this.circuitBreaker = new CircuitBreaker(3, 30000, this.logger);
  }

  async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to RabbitMQ...');
      
      this.connection = await amqp.connect(this.config.url);
      this.channel = await this.connection.createChannel();
      
      await this.setupExchangesAndQueues();
      
      this.connection.on('error', this.handleConnectionError.bind(this));
      this.connection.on('close', this.handleConnectionClose.bind(this));
      
      this.logger.info('Successfully connected to RabbitMQ');
      this.reconnectAttempts = 0;
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  private async setupExchangesAndQueues(): Promise<void> {
    if (!this.channel) throw new Error('Channel not initialized');

    // Setup main exchange
    await this.channel.assertExchange(this.config.exchange, 'topic', {
      durable: this.config.options?.durable ?? true
    });

    // Setup main queue
    await this.channel.assertQueue(this.config.queue, {
      durable: this.config.options?.durable ?? true,
      deadLetterExchange: this.config.options?.deadLetterExchange,
      deadLetterRoutingKey: this.config.options?.deadLetterRoutingKey,
      messageTtl: this.config.options?.messageTtl
    });

    // Bind queue to exchange
    await this.channel.bindQueue(
      this.config.queue,
      this.config.exchange,
      this.config.routingKey
    );

    // Setup dead letter queue if configured
    if (this.config.options?.deadLetterExchange) {
      await this.channel.assertExchange(
        this.config.options.deadLetterExchange,
        'topic',
        { durable: true }
      );
      
      const dlqName = `${this.config.queue}.dlq`;
      await this.channel.assertQueue(dlqName, { durable: true });
      await this.channel.bindQueue(
        dlqName,
        this.config.options.deadLetterExchange,
        this.config.options.deadLetterRoutingKey || '#'
      );
    }
  }

  async publishEvent(event: BaseEvent, routingKey?: string): Promise<boolean> {
    return this.circuitBreaker.execute(async () => {
      if (!this.channel) {
        throw new Error('Channel not initialized');
      }

      const message = Buffer.from(JSON.stringify(event));
      const key = routingKey || this.config.routingKey;
      
      const success = this.channel.publish(
        this.config.exchange,
        key,
        message,
        {
          persistent: this.config.options?.persistent ?? true,
          messageId: event.id,
          correlationId: event.correlationId,
          timestamp: Date.now(),
          headers: {
            version: event.version,
            source: event.source
          }
        }
      );

      if (success) {
        this.logger.info(`Event published: ${event.type} with ID: ${event.id}`);
      } else {
        this.logger.warn(`Failed to publish event: ${event.type} with ID: ${event.id}`);
      }

      return success;
    });
  }

  async consumeEvents(
    handler: (event: BaseEvent, message: ConsumeMessage) => Promise<void>
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    await this.channel.consume(
      this.config.queue,
      async (message) => {
        if (!message) return;

        try {
          const event: BaseEvent = JSON.parse(message.content.toString());
          this.logger.info(`Processing event: ${event.type} with ID: ${event.id}`);
          
          await handler(event, message);
          
          // Acknowledge the message
          this.channel?.ack(message);
          this.logger.info(`Event processed successfully: ${event.type} with ID: ${event.id}`);
        } catch (error) {
          this.logger.error(`Error processing event:`, error);
          
          // Reject the message and requeue if it's a processing error
          // If it's a validation error, don't requeue
          const shouldRequeue = !(error instanceof Error && error.message.includes('validation'));
          this.channel?.nack(message, false, shouldRequeue);
        }
      },
      {
        noAck: false
      }
    );

    this.logger.info(`Started consuming events from queue: ${this.config.queue}`);
  }

  async publishToDeadLetter(
    event: BaseEvent,
    reason: string,
    originalMessage: ConsumeMessage
  ): Promise<void> {
    if (!this.channel || !this.config.options?.deadLetterExchange) {
      this.logger.warn('Dead letter queue not configured, dropping message');
      return;
    }

    const dlqEvent = {
      ...event,
      metadata: {
        ...event.metadata,
        dlqReason: reason,
        originalTimestamp: event.timestamp,
        originalMessageId: event.id
      }
    };

    await this.channel.publish(
      this.config.options.deadLetterExchange,
      this.config.options.deadLetterRoutingKey || '#',
      Buffer.from(JSON.stringify(dlqEvent)),
      {
        persistent: true,
        messageId: `dlq-${event.id}`,
        timestamp: Date.now()
      }
    );

    this.logger.warn(`Message sent to DLQ: ${event.id}, reason: ${reason}`);
  }

  private handleConnectionError(error: Error): void {
    this.logger.error('RabbitMQ connection error:', error);
    this.scheduleReconnect();
  }

  private handleConnectionClose(): void {
    this.logger.warn('RabbitMQ connection closed');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    this.logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        this.logger.error('Reconnection failed:', error);
      }
    }, delay);
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      
      this.logger.info('Message queue connection closed');
    } catch (error) {
      this.logger.error('Error closing message queue connection:', error);
    }
  }

  isConnected(): boolean {
    return this.connection !== null && this.connection !== undefined;
  }
}
