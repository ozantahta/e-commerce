import { Request, Response } from 'express';
import Joi from 'joi';
import { OrderService } from '../services/OrderService';
import { OrderStatus, OrderItem } from '@e-commerce/shared';
import { createServiceLogger } from '@e-commerce/shared';

export class OrderController {
  private readonly logger = createServiceLogger('OrderController');

  constructor(private orderService: OrderService) {}

  // Validation schemas
  private readonly createOrderSchema = Joi.object({
    customerId: Joi.string().required(),
    items: Joi.array().items(
      Joi.object({
        productId: Joi.string().required(),
        quantity: Joi.number().integer().min(1).required(),
        price: Joi.number().positive().required(),
        name: Joi.string().required()
      })
    ).min(1).required(),
    metadata: Joi.object().optional()
  });

  private readonly updateStatusSchema = Joi.object({
    status: Joi.string().valid(...Object.values(OrderStatus)).required(),
    metadata: Joi.object().optional()
  });

  private readonly cancelOrderSchema = Joi.object({
    reason: Joi.string().optional()
  });

  async createOrder(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const { error, value } = this.createOrderSchema.validate(req.body);
      if (error) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.details.map(d => d.message)
        });
        return;
      }

      const { customerId, items, metadata } = value;

      // Create order
      const order = await this.orderService.createOrder(customerId, items, metadata);

      res.status(201).json({
        success: true,
        data: order,
        message: 'Order created successfully'
      });
    } catch (error) {
      this.logger.error('Error in createOrder controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getOrder(req: Request, res: Response): Promise<void> {
    try {
      const { orderId } = req.params;

      if (!orderId) {
        res.status(400).json({
          success: false,
          error: 'Order ID is required'
        });
        return;
      }

      const order = await this.orderService.getOrder(orderId);

      if (!order) {
        res.status(404).json({
          success: false,
          error: 'Order not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: order
      });
    } catch (error) {
      this.logger.error('Error in getOrder controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async updateOrderStatus(req: Request, res: Response): Promise<void> {
    try {
      const { orderId } = req.params;

      if (!orderId) {
        res.status(400).json({
          success: false,
          error: 'Order ID is required'
        });
        return;
      }

      // Validate request body
      const { error, value } = this.updateStatusSchema.validate(req.body);
      if (error) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.details.map(d => d.message)
        });
        return;
      }

      const { status, metadata } = value;

      const updatedOrder = await this.orderService.updateOrderStatus(orderId, status, metadata);

      res.status(200).json({
        success: true,
        data: updatedOrder,
        message: 'Order status updated successfully'
      });
    } catch (error) {
      this.logger.error('Error in updateOrderStatus controller:', error);
      
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Order not found'
        });
        return;
      }

      if (error instanceof Error && error.message.includes('Invalid status transition')) {
        res.status(400).json({
          success: false,
          error: 'Invalid status transition',
          message: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async cancelOrder(req: Request, res: Response): Promise<void> {
    try {
      const { orderId } = req.params;

      if (!orderId) {
        res.status(400).json({
          success: false,
          error: 'Order ID is required'
        });
        return;
      }

      // Validate request body
      const { error, value } = this.cancelOrderSchema.validate(req.body);
      if (error) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.details.map(d => d.message)
        });
        return;
      }

      const { reason } = value;

      const cancelledOrder = await this.orderService.cancelOrder(orderId, reason);

      res.status(200).json({
        success: true,
        data: cancelledOrder,
        message: 'Order cancelled successfully'
      });
    } catch (error) {
      this.logger.error('Error in cancelOrder controller:', error);
      
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Order not found'
        });
        return;
      }

      if (error instanceof Error && error.message.includes('already cancelled')) {
        res.status(400).json({
          success: false,
          error: 'Order already cancelled'
        });
        return;
      }

      if (error instanceof Error && error.message.includes('Cannot cancel order')) {
        res.status(400).json({
          success: false,
          error: 'Cannot cancel order',
          message: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getOrdersByCustomer(req: Request, res: Response): Promise<void> {
    try {
      const { customerId } = req.params;

      if (!customerId) {
        res.status(400).json({
          success: false,
          error: 'Customer ID is required'
        });
        return;
      }

      const orders = await this.orderService.getOrdersByCustomer(customerId);

      res.status(200).json({
        success: true,
        data: orders,
        count: orders.length
      });
    } catch (error) {
      this.logger.error('Error in getOrdersByCustomer controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getOrdersByStatus(req: Request, res: Response): Promise<void> {
    try {
      const { status } = req.params;

      if (!status) {
        res.status(400).json({
          success: false,
          error: 'Status is required'
        });
        return;
      }

      if (!Object.values(OrderStatus).includes(status as OrderStatus)) {
        res.status(400).json({
          success: false,
          error: 'Invalid status',
          validStatuses: Object.values(OrderStatus)
        });
        return;
      }

      const orders = await this.orderService.getOrdersByStatus(status as OrderStatus);

      res.status(200).json({
        success: true,
        data: orders,
        count: orders.length
      });
    } catch (error) {
      this.logger.error('Error in getOrdersByStatus controller:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
