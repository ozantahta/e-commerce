import { v4 as uuidv4 } from 'uuid';
import { Order, IOrder } from '../models/Order';
import { OrderStatus, OrderItem, OrderEvent, BaseEvent } from '@e-commerce/shared';
import { createServiceLogger } from '@e-commerce/shared';
import { MessageQueueManager } from '@e-commerce/shared';
import { createRetryHandler } from '@e-commerce/shared';

export class OrderService {
  private readonly logger = createServiceLogger('OrderService');
  private readonly retryHandler = createRetryHandler({ maxAttempts: 3, backoffMs: 1000 });

  constructor(private messageQueue: MessageQueueManager) {}

  async createOrder(
    customerId: string,
    items: OrderItem[],
    metadata?: Record<string, any>
  ): Promise<IOrder> {
    try {
      // Validate items
      if (!items || items.length === 0) {
        throw new Error('Order must contain at least one item');
      }

      // Calculate total
      const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      // Create order
      const order = new Order({
        orderId: uuidv4(),
        customerId,
        items,
        total,
        status: OrderStatus.PENDING,
        metadata
      });

      const savedOrder = await order.save();
      this.logger.info(`Order created: ${savedOrder.orderId}`);

      // Publish order created event
      await this.publishOrderEvent('order.created', savedOrder);

      return savedOrder;
    } catch (error) {
      this.logger.error('Error creating order:', error);
      throw error;
    }
  }

  async getOrder(orderId: string): Promise<IOrder | null> {
    try {
      const order = await Order.findOne({ orderId });
      if (!order) {
        this.logger.warn(`Order not found: ${orderId}`);
        return null;
      }
      return order;
    } catch (error) {
      this.logger.error(`Error fetching order ${orderId}:`, error);
      throw error;
    }
  }

  async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    metadata?: Record<string, any>
  ): Promise<IOrder> {
    try {
      const order = await Order.findOne({ orderId });
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      // Validate status transition
      if (!this.isValidStatusTransition(order.status, newStatus)) {
        throw new Error(`Invalid status transition from ${order.status} to ${newStatus}`);
      }

      // Update order
      order.status = newStatus;
      order.updatedAt = new Date();
      if (metadata) {
        order.metadata = { ...order.metadata, ...metadata };
      }

      const updatedOrder = await order.save();
      this.logger.info(`Order ${orderId} status updated to ${newStatus}`);

      // Publish order updated event
      await this.publishOrderEvent('order.updated', updatedOrder);

      return updatedOrder;
    } catch (error) {
      this.logger.error(`Error updating order ${orderId} status:`, error);
      throw error;
    }
  }

  async cancelOrder(orderId: string, reason?: string): Promise<IOrder> {
    try {
      const order = await Order.findOne({ orderId });
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      if (order.status === OrderStatus.CANCELLED) {
        throw new Error(`Order ${orderId} is already cancelled`);
      }

      if (!this.canCancelOrder(order.status)) {
        throw new Error(`Cannot cancel order in status: ${order.status}`);
      }

      // Update order status
      order.status = OrderStatus.CANCELLED;
      order.updatedAt = new Date();
      order.metadata = {
        ...order.metadata,
        cancellationReason: reason,
        cancelledAt: new Date()
      };

      const cancelledOrder = await order.save();
      this.logger.info(`Order ${orderId} cancelled`);

      // Publish order cancelled event
      await this.publishOrderEvent('order.cancelled', cancelledOrder);

      return cancelledOrder;
    } catch (error) {
      this.logger.error(`Error cancelling order ${orderId}:`, error);
      throw error;
    }
  }

  async getOrdersByCustomer(customerId: string): Promise<IOrder[]> {
    try {
      const orders = await Order.find({ customerId }).sort({ createdAt: -1 });
      return orders;
    } catch (error) {
      this.logger.error(`Error fetching orders for customer ${customerId}:`, error);
      throw error;
    }
  }

  async getOrdersByStatus(status: OrderStatus): Promise<IOrder[]> {
    try {
      const orders = await Order.find({ status }).sort({ createdAt: -1 });
      return orders;
    } catch (error) {
      this.logger.error(`Error fetching orders with status ${status}:`, error);
      throw error;
    }
  }

  private isValidStatusTransition(currentStatus: OrderStatus, newStatus: OrderStatus): boolean {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.CANCELLED]: []
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  private canCancelOrder(status: OrderStatus): boolean {
    return [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING].includes(status);
  }

  private async publishOrderEvent(
    eventType: OrderEvent['type'],
    order: IOrder
  ): Promise<void> {
    const event: OrderEvent = {
      id: uuidv4(),
      type: eventType,
      version: '1.0.0',
      timestamp: new Date(),
      source: 'order-service',
      correlationId: order.orderId,
      data: {
        orderId: order.orderId,
        customerId: order.customerId,
        items: order.items,
        total: order.total,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
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
      // In a production system, you might want to store failed events for retry
    }
  }
}
