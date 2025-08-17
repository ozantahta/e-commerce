export interface BaseEvent {
  id: string;
  type: string;
  version: string;
  timestamp: Date;
  source: string;
  correlationId?: string;
  metadata?: Record<string, any>;
}

export interface OrderEvent extends BaseEvent {
  type: 'order.created' | 'order.updated' | 'order.cancelled' | 'order.completed';
  data: {
    orderId: string;
    customerId: string;
    items: OrderItem[];
    total: number;
    status: OrderStatus;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface InventoryEvent extends BaseEvent {
  type: 'inventory.reserved' | 'inventory.released' | 'inventory.updated' | 'inventory.low';
  data: {
    productId: string;
    quantity: number;
    action: 'reserve' | 'release' | 'update' | 'alert';
    orderId?: string;
    currentStock: number;
  };
}

export interface NotificationEvent extends BaseEvent {
  type: 'notification.sent' | 'notification.failed' | 'notification.retry';
  data: {
    recipientId: string;
    type: 'email' | 'sms' | 'push';
    template: string;
    content: Record<string, any>;
    status: 'pending' | 'sent' | 'failed';
    attempts: number;
  };
}

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
  name: string;
}

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled'
}

export interface MessageQueueConfig {
  url: string;
  exchange: string;
  queue: string;
  routingKey: string;
  options?: {
    durable?: boolean;
    persistent?: boolean;
    deadLetterExchange?: string;
    deadLetterRoutingKey?: string;
    messageTtl?: number;
    maxRetries?: number;
  };
}

export interface DatabaseConfig {
  url: string;
  database: string;
  options?: {
    useNewUrlParser?: boolean;
    useUnifiedTopology?: boolean;
    maxPoolSize?: number;
    serverSelectionTimeoutMS?: number;
    socketTimeoutMS?: number;
  };
}

export interface ServiceConfig {
  port: number;
  name: string;
  version: string;
  environment: string;
  messageQueue: MessageQueueConfig;
  database: DatabaseConfig;
  healthCheck: {
    enabled: boolean;
    interval: number;
  };
}

export interface EventHandler<T extends BaseEvent> {
  handle(event: T): Promise<void>;
  validate(event: T): boolean;
  retry(event: T, attempt: number): Promise<boolean>;
}

export interface CircuitBreakerState {
  status: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: number;
  threshold: number;
  timeout: number;
}

export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
  maxBackoffMs: number;
  jitter: boolean;
}

export interface DeadLetterQueueConfig {
  exchange: string;
  routingKey: string;
  maxRetries: number;
  ttl: number;
}
