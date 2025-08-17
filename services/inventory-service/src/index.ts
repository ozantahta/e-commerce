import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { InventoryService } from './services/InventoryService';
import { MessageQueueManager, createServiceLogger } from '@e-commerce/shared';

class InventoryServiceApp {
  private app: express.Application;
  private server: any;
  private readonly logger = createServiceLogger('InventoryServiceApp');
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
        service: 'inventory-service',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        messageQueue: this.messageQueue?.isConnected() || false,
        database: mongoose.connection.readyState === 1
      });
    });

    // API routes
    const inventoryService = new InventoryService(this.messageQueue!);

    // Product management
    this.app.post('/api/products', async (req, res) => {
      try {
        const { name, description, price, stockQuantity, category, sku, metadata } = req.body;
        
        if (!name || !description || !price || !stockQuantity || !category || !sku) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: name, description, price, stockQuantity, category, sku'
          });
        }

        const product = await inventoryService.createProduct(
          name,
          description,
          price,
          stockQuantity,
          category,
          sku,
          metadata
        );

        res.status(201).json({
          success: true,
          product
        });
      } catch (error: any) {
        this.logger.error('Error creating product:', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to create product'
        });
      }
    });

    this.app.get('/api/products', async (req, res) => {
      try {
        const products = await inventoryService.getAllProducts();
        res.json(products);
      } catch (error: any) {
        this.logger.error('Error getting products:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get products'
        });
      }
    });

    this.app.get('/api/products/:productId', async (req, res) => {
      try {
        const { productId } = req.params;
        const product = await inventoryService.getProduct(productId);
        
        if (!product) {
          return res.status(404).json({
            success: false,
            error: 'Product not found'
          });
        }

        res.json(product);
      } catch (error: any) {
        this.logger.error('Error getting product:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get product'
        });
      }
    });

    // Stock update endpoint
    this.app.put('/api/products/:productId/stock', async (req, res) => {
      try {
        const { productId } = req.params;
        const { newQuantity, metadata } = req.body;
        
        if (newQuantity === undefined) {
          return res.status(400).json({
            success: false,
            error: 'Missing required field: newQuantity'
          });
        }

        if (typeof newQuantity !== 'number' || newQuantity < 0) {
          return res.status(400).json({
            success: false,
            error: 'newQuantity must be a non-negative number'
          });
        }

        const updatedProduct = await inventoryService.updateProductStock(productId, newQuantity, metadata);
        res.json({
          success: true,
          product: updatedProduct
        });
      } catch (error: any) {
        this.logger.error('Error updating product stock:', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to update product stock'
        });
      }
    });

    // Inventory management
    this.app.post('/api/inventory', async (req, res) => {
      try {
        const { productId, quantity, reserved } = req.body;
        
        if (!productId || quantity === undefined) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: productId, quantity'
          });
        }

        const inventory = await inventoryService.createInventory(productId, quantity, reserved || 0);
        res.status(201).json({
          success: true,
          inventory
        });
      } catch (error: any) {
        this.logger.error('Error creating inventory:', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to create inventory'
        });
      }
    });

    this.app.get('/api/inventory', async (req, res) => {
      try {
        const inventory = await inventoryService.getAllInventory();
        res.json(inventory);
      } catch (error: any) {
        this.logger.error('Error getting inventory:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get inventory'
        });
      }
    });

    this.app.get('/api/inventory/:productId', async (req, res) => {
      try {
        const { productId } = req.params;
        const inventory = await inventoryService.getInventory(productId);
        
        if (!inventory) {
          return res.status(404).json({
            success: false,
            error: 'Inventory not found'
          });
        }

        res.json(inventory);
      } catch (error: any) {
        this.logger.error('Error getting inventory:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get inventory'
        });
      }
    });

    this.app.put('/api/inventory/:productId', async (req, res) => {
      try {
        const { productId } = req.params;
        const { quantity, reserved } = req.body;
        
        if (quantity === undefined) {
          return res.status(400).json({
            success: false,
            error: 'Missing required field: quantity'
          });
        }

        const inventory = await inventoryService.updateInventory(productId, quantity, reserved);
        res.json({
          success: true,
          inventory
        });
      } catch (error: any) {
        this.logger.error('Error updating inventory:', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to update inventory'
        });
      }
    });

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
        queue: 'inventory-service.queue',
        routingKey: 'inventory.*',
        options: {
          durable: true,
          persistent: true,
          deadLetterExchange: 'e-commerce.dlq',
          deadLetterRoutingKey: 'inventory.dlq',
          messageTtl: 30000, // 30 seconds
          maxRetries: 3
        }
      });

      await this.messageQueue.connect();
      this.logger.info('Message queue connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to message queue:', error);
    }
  }

  private async connectDatabase(): Promise<void> {
    try {
      const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/e-commerce';
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

  async start(): Promise<void> {
    try {
      // Connect to database
      await this.connectDatabase();

      // Start server
      const port = process.env.PORT || 3002;
      this.server = this.app.listen(port, () => {
        this.logger.info(`Inventory Service started on port ${port}`);
      });

      // Graceful shutdown
      process.on('SIGTERM', this.gracefulShutdown.bind(this));
      process.on('SIGINT', this.gracefulShutdown.bind(this));

    } catch (error) {
      this.logger.error('Failed to start Inventory Service:', error);
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
const app = new InventoryServiceApp();
app.start().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
