import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { NotificationController } from './controllers/NotificationController';
import { NotificationService } from './services/NotificationService';
import { MessageQueueManager, createServiceLogger } from '@e-commerce/shared';
import { OrderEvent, NotificationEvent } from '@e-commerce/shared';

class NotificationServiceApp {
  private app: express.Application;
  private server: any;
  private readonly logger = createServiceLogger('NotificationServiceApp');
  private messageQueue!: MessageQueueManager;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupMessageQueue();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.'
    });
    this.app.use('/api/', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      this.logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        service: 'notification-service',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        messageQueue: this.messageQueue?.isConnected() || false,
        database: mongoose.connection.readyState === 1
      });
    });

    // API routes
    this.app.get('/api/notifications', NotificationController.getAllNotifications);
    this.app.get('/api/notifications/stats', NotificationController.getNotificationStats);
    this.app.get('/api/notifications/recipient/:recipientId', NotificationController.getNotificationsByRecipient);
    this.app.get('/api/notifications/status/:status', NotificationController.getNotificationsByStatus);
    this.app.post('/api/notifications', NotificationController.sendNotification);
    this.app.post('/api/notifications/:id/retry', NotificationController.retryNotification);
    this.app.get('/api/notifications/:id', NotificationController.getNotification);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Route not found'
      });
    });

    // Global error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.logger.error('Unhandled error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    });
  }

  private async setupMessageQueue(): Promise<void> {
    try {
      this.messageQueue = new MessageQueueManager({
        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
        exchange: 'e-commerce.events',
        queue: 'notification-service-queue',
        routingKey: 'order.*',
        options: {
          durable: true,
          persistent: true,
          deadLetterExchange: 'e-commerce.dlq',
          deadLetterRoutingKey: 'notification-service-dlq',
          messageTtl: 30000, // 30 seconds
          maxRetries: 3
        }
      });

      await this.messageQueue.connect();
      this.logger.info('Message queue connected successfully');

      // Subscribe to order events
      await this.messageQueue.consumeEvents(async (event: any, message: any) => {
        try {
          if (event.type === 'order.created') {
            const orderEvent = event as OrderEvent;
            this.logger.info('Processing order.created event:', orderEvent);
            
            // Send order confirmation notification
            await this.sendOrderConfirmation(orderEvent);
            
            // Publish notification event
            const notificationEvent: NotificationEvent = {
              id: `notif_${Date.now()}`,
              type: 'notification.sent',
              version: '1.0.0',
              timestamp: new Date(),
              source: 'notification-service',
              data: {
                recipientId: orderEvent.data.customerId,
                type: 'email',
                template: 'order_confirmation',
                content: {
                  orderId: orderEvent.data.orderId,
                  message: 'Your order has been confirmed!'
                },
                status: 'pending',
                attempts: 0
              }
            };
            
            await this.messageQueue.publishEvent(notificationEvent, 'notification.sent');
            this.logger.info('Order confirmation notification sent');
          } else if (event.type === 'order.cancelled') {
            const orderEvent = event as OrderEvent;
            this.logger.info('Processing order.cancelled event:', orderEvent);
            
            // Send order cancellation notification
            await this.sendOrderCancellation(orderEvent);
            this.logger.info('Order cancellation notification sent');
          }
        } catch (error: any) {
          this.logger.error('Error processing event:', error);
        }
      });

    } catch (error) {
      this.logger.error('Failed to connect to message queue:', error);
      // In production, you might want to exit the process
      // process.exit(1);
    }
  }

  private async connectDatabase(): Promise<void> {
    try {
      const mongoUrl = process.env.MONGODB_URL || 'mongodb://admin:admin123@mongodb:27017/e-commerce?authSource=admin';
      await mongoose.connect(mongoUrl, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000
      });

      this.logger.info('Connected to MongoDB successfully');
    } catch (error) {
      this.logger.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  // Notification functions
  private async sendOrderConfirmation(orderEvent: OrderEvent): Promise<void> {
    try {
      // Import the Notification model directly
      const { Notification } = await import('./models/Notification');
      
      // Create and store notification directly in database
      const notification = new Notification({
        notificationId: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        recipientId: orderEvent.data.customerId,
        type: 'email',
        template: 'order_confirmation',
        content: {
          orderId: orderEvent.data.orderId,
          message: 'Your order has been confirmed!',
          total: orderEvent.data.total,
          items: orderEvent.data.items
        },
        status: 'pending',
        attempts: 0,
        createdAt: new Date()
      });
      
      await notification.save();
      this.logger.info(`Order confirmation notification sent and stored for customer ${orderEvent.data.customerId} for order ${orderEvent.data.orderId}`);
    } catch (error) {
      this.logger.error(`Error sending order confirmation notification:`, error);
    }
  }

  private async sendOrderCancellation(orderEvent: OrderEvent): Promise<void> {
    try {
      // Import the Notification model directly
      const { Notification } = await import('./models/Notification');
      
      // Create and store notification directly in database
      const notification = new Notification({
        notificationId: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        recipientId: orderEvent.data.customerId,
        type: 'email',
        template: 'order_cancellation',
        content: {
          orderId: orderEvent.data.orderId,
          message: 'Your order has been cancelled.',
          reason: 'Order was cancelled'
        },
        status: 'pending',
        attempts: 0,
        createdAt: new Date()
      });
      
      await notification.save();
      this.logger.info(`Order cancellation notification sent and stored for customer ${orderEvent.data.customerId} for order ${orderEvent.data.orderId}`);
    } catch (error) {
      this.logger.error(`Error sending order cancellation notification:`, error);
    }
  }

  async start(): Promise<void> {
    try {
      // Connect to database
      await this.connectDatabase();

      // Start server
      const port = process.env.PORT || 3003;
      this.server = this.app.listen(port, () => {
        this.logger.info(`Notification Service started on port ${port}`);
      });

      // Graceful shutdown
      process.on('SIGTERM', this.gracefulShutdown.bind(this));
      process.on('SIGINT', this.gracefulShutdown.bind(this));

    } catch (error) {
      this.logger.error('Failed to start Notification Service:', error);
      process.exit(1);
    }
  }

  private async gracefulShutdown(): Promise<void> {
    this.logger.info('Received shutdown signal, starting graceful shutdown...');

    try {
      // Close server
      if (this.server) {
        await new Promise<void>((resolve) => {
          this.server.close(() => resolve());
        });
      }

      // Close message queue connection
      if (this.messageQueue) {
        await this.messageQueue.close();
      }

      // Close database connection
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
      }

      this.logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }
}

// Start the application
const app = new NotificationServiceApp();
app.start().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});

