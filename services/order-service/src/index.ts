import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { OrderController } from './controllers/OrderController';
import { OrderService } from './services/OrderService';
import { MessageQueueManager, createServiceLogger } from '@e-commerce/shared';

class OrderServiceApp {
  private app: express.Application;
  private server: any;
  private readonly logger = createServiceLogger('OrderServiceApp');
  private messageQueue: MessageQueueManager;

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
        service: 'order-service',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        messageQueue: this.messageQueue?.isConnected() || false,
        database: mongoose.connection.readyState === 1
      });
    });

    // API routes
    const orderController = new OrderController(
      new OrderService(this.messageQueue!)
    );

    this.app.post('/api/orders', (req, res) => orderController.createOrder(req, res));
    this.app.get('/api/orders/:orderId', (req, res) => orderController.getOrder(req, res));
    this.app.put('/api/orders/:orderId/status', (req, res) => orderController.updateOrderStatus(req, res));
    this.app.post('/api/orders/:orderId/cancel', (req, res) => orderController.cancelOrder(req, res));
    this.app.get('/api/customers/:customerId/orders', (req, res) => orderController.getOrdersByCustomer(req, res));
    this.app.get('/api/orders/status/:status', (req, res) => orderController.getOrdersByStatus(req, res));

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
        queue: 'order-service.queue',
        routingKey: 'order.*',
        options: {
          durable: true,
          persistent: true,
          deadLetterExchange: 'e-commerce.dlq',
          deadLetterRoutingKey: 'order.dlq',
          messageTtl: 30000, // 30 seconds
          maxRetries: 3
        }
      });

      await this.messageQueue.connect();
      this.logger.info('Message queue connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to message queue:', error);
      // In production, you might want to exit the process
      // process.exit(1);
    }
  }

  private async connectDatabase(): Promise<void> {
    try {
      const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/e-commerce';
      await mongoose.connect(mongoUrl, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
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

  async start(): Promise<void> {
    try {
      // Connect to database
      await this.connectDatabase();

      // Start server
      const port = process.env.PORT || 3001;
      this.server = this.app.listen(port, () => {
        this.logger.info(`Order Service started on port ${port}`);
      });

      // Graceful shutdown
      process.on('SIGTERM', this.gracefulShutdown.bind(this));
      process.on('SIGINT', this.gracefulShutdown.bind(this));

    } catch (error) {
      this.logger.error('Failed to start Order Service:', error);
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
const app = new OrderServiceApp();
app.start().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
