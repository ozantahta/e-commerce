import { v4 as uuidv4 } from 'uuid';
import { Product, IProduct } from '../models/Product';
import { InventoryEvent, OrderEvent, BaseEvent, OrderItem } from '@e-commerce/shared';
import { createServiceLogger } from '@e-commerce/shared';
import { MessageQueueManager } from '@e-commerce/shared';
import { createRetryHandler } from '@e-commerce/shared';

export class InventoryService {
  private readonly logger = createServiceLogger('InventoryService');
  private readonly retryHandler = createRetryHandler({ maxAttempts: 3, backoffMs: 1000 });

  constructor(private messageQueue: MessageQueueManager) {}

  async createProduct(
    name: string,
    description: string,
    price: number,
    stockQuantity: number,
    category: string,
    sku: string,
    metadata?: Record<string, any>
  ): Promise<IProduct> {
    try {
      // Check if SKU already exists
      const existingProduct = await Product.findOne({ sku });
      if (existingProduct) {
        throw new Error(`Product with SKU ${sku} already exists`);
      }

      const product = new Product({
        productId: uuidv4(),
        name,
        description,
        price,
        stockQuantity,
        reservedQuantity: 0,
        availableQuantity: stockQuantity,
        category,
        sku,
        isActive: true,
        metadata
      });

      const savedProduct = await product.save();
      this.logger.info(`Product created: ${savedProduct.productId}`);

      // Publish inventory updated event
      await this.publishInventoryEvent('inventory.updated', savedProduct);

      return savedProduct;
    } catch (error) {
      this.logger.error('Error creating product:', error);
      throw error;
    }
  }

  async getProduct(productId: string): Promise<IProduct | null> {
    try {
      const product = await Product.findOne({ productId });
      if (!product) {
        this.logger.warn(`Product not found: ${productId}`);
        return null;
      }
      return product;
    } catch (error) {
      this.logger.error(`Error fetching product ${productId}:`, error);
      throw error;
    }
  }

  async updateProductStock(
    productId: string,
    newQuantity: number,
    metadata?: Record<string, any>
  ): Promise<IProduct> {
    try {
      const product = await Product.findOne({ productId });
      if (!product) {
        throw new Error(`Product not found: ${productId}`);
      }

      const oldQuantity = product.stockQuantity;
      await product.updateStock(newQuantity);

      if (metadata) {
        product.metadata = { ...product.metadata, ...metadata };
        await product.save();
      }

      this.logger.info(`Product ${productId} stock updated from ${oldQuantity} to ${newQuantity}`);

      // Publish inventory updated event
      await this.publishInventoryEvent('inventory.updated', product);

      // Check if stock is low
      if (product.availableQuantity <= 10) {
        await this.publishInventoryEvent('inventory.low', product);
      }

      return product;
    } catch (error) {
      this.logger.error(`Error updating product ${productId} stock:`, error);
      throw error;
    }
  }

  async reserveInventory(
    productId: string,
    quantity: number,
    orderId: string
  ): Promise<boolean> {
    try {
      const product = await Product.findOne({ productId });
      if (!product) {
        throw new Error(`Product not found: ${productId}`);
      }

      if (!product.isActive) {
        throw new Error(`Product ${productId} is not active`);
      }

      const success = await product.reserveInventory(quantity, orderId);
      
      if (success) {
        this.logger.info(`Inventory reserved for product ${productId}: ${quantity} units for order ${orderId}`);
        
        // Publish inventory reserved event
        await this.publishInventoryEvent('inventory.reserved', product, { orderId, quantity });
      } else {
        this.logger.warn(`Failed to reserve inventory for product ${productId}: insufficient stock`);
      }

      return success;
    } catch (error) {
      this.logger.error(`Error reserving inventory for product ${productId}:`, error);
      throw error;
    }
  }

  async releaseInventory(
    productId: string,
    quantity: number,
    orderId: string
  ): Promise<void> {
    try {
      const product = await Product.findOne({ productId });
      if (!product) {
        throw new Error(`Product not found: ${productId}`);
      }

      await product.releaseInventory(quantity, orderId);
      
      this.logger.info(`Inventory released for product ${productId}: ${quantity} units from order ${orderId}`);
      
      // Publish inventory released event
      await this.publishInventoryEvent('inventory.released', product, { orderId, quantity });
    } catch (error) {
      this.logger.error(`Error releasing inventory for product ${productId}:`, error);
      throw error;
    }
  }

  async processOrderCreated(orderEvent: OrderEvent): Promise<void> {
    try {
      const { orderId, items } = orderEvent.data;
      this.logger.info(`Processing order created event for order: ${orderId}`);

      // Reserve inventory for all items in the order
      for (const item of items) {
        const success = await this.reserveInventory(item.productId, item.quantity, orderId);
        
        if (!success) {
          this.logger.error(`Failed to reserve inventory for product ${item.productId} in order ${orderId}`);
          // In a production system, you might want to publish an order.failed event
          throw new Error(`Insufficient inventory for product ${item.productId}`);
        }
      }

      this.logger.info(`Successfully reserved inventory for order: ${orderId}`);
    } catch (error) {
      this.logger.error(`Error processing order created event:`, error);
      throw error;
    }
  }

  async processOrderCancelled(orderEvent: OrderEvent): Promise<void> {
    try {
      const { orderId, items } = orderEvent.data;
      this.logger.info(`Processing order cancelled event for order: ${orderId}`);

      // Release inventory for all items in the cancelled order
      for (const item of items) {
        await this.releaseInventory(item.productId, item.quantity, orderId);
      }

      this.logger.info(`Successfully released inventory for cancelled order: ${orderId}`);
    } catch (error) {
      this.logger.error(`Error processing order cancelled event:`, error);
      throw error;
    }
  }

  async getProductsByCategory(category: string): Promise<IProduct[]> {
    try {
      const products = await Product.findByCategory(category);
      return products;
    } catch (error) {
      this.logger.error(`Error fetching products by category ${category}:`, error);
      throw error;
    }
  }

  async getLowStockProducts(threshold: number = 10): Promise<IProduct[]> {
    try {
      const products = await Product.findLowStock(threshold);
      return products;
    } catch (error) {
      this.logger.error(`Error fetching low stock products:`, error);
      throw error;
    }
  }

  async getAvailableProducts(): Promise<IProduct[]> {
    try {
      const products = await Product.findAvailable();
      return products;
    } catch (error) {
      this.logger.error(`Error fetching available products:`, error);
      throw error;
    }
  }

  private async publishInventoryEvent(
    eventType: InventoryEvent['type'],
    product: IProduct,
    additionalData?: Record<string, any>
  ): Promise<void> {
    const event: InventoryEvent = {
      id: uuidv4(),
      type: eventType,
      version: '1.0.0',
      timestamp: new Date(),
      source: 'inventory-service',
      data: {
        productId: product.productId,
        quantity: additionalData?.quantity || 0,
        action: this.getActionFromEventType(eventType),
        orderId: additionalData?.orderId,
        currentStock: product.stockQuantity,
        ...additionalData
      }
    };

    try {
      await this.retryHandler.execute(async () => {
        const success = await this.messageQueue.publishEvent(event);
        if (!success) {
          throw new Error('Failed to publish event');
        }
      }, `Publishing ${eventType} event`);
    } catch (error) {
      this.logger.error(`Failed to publish ${eventType} event:`, error);
    }
  }

  private getActionFromEventType(eventType: InventoryEvent['type']): 'reserve' | 'release' | 'update' | 'alert' {
    switch (eventType) {
      case 'inventory.reserved':
        return 'reserve';
      case 'inventory.released':
        return 'release';
      case 'inventory.updated':
        return 'update';
      case 'inventory.low':
        return 'alert';
      default:
        return 'update';
    }
  }
}
