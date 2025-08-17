import { Request, Response } from 'express';
import { OrderController } from '../controllers/OrderController';
import { OrderService } from '../services/OrderService';
import { OrderStatus } from '@e-commerce/shared';

// Mock the OrderService
jest.mock('../services/OrderService');

describe('OrderController', () => {
  let orderController: OrderController;
  let mockOrderService: jest.Mocked<OrderService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockStatus: jest.MockedFunction<any>;
  let mockJson: jest.MockedFunction<any>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock service with proper mocking
    mockOrderService = {
      createOrder: jest.fn(),
      getOrder: jest.fn(),
      updateOrderStatus: jest.fn(),
      cancelOrder: jest.fn(),
      getOrdersByCustomer: jest.fn(),
      getOrdersByStatus: jest.fn()
    } as any;

    // Create mock request and response
    mockRequest = {
      body: {},
      params: {},
      query: {}
    };

    mockStatus = jest.fn().mockReturnThis();
    mockJson = jest.fn().mockReturnThis();

    mockResponse = {
      status: mockStatus,
      json: mockJson
    };

    // Create controller instance
    orderController = new OrderController(mockOrderService);
  });

  describe('createOrder', () => {
    it('should create order successfully', async () => {
      // Arrange
      const orderData = {
        customerId: 'test-customer-123',
        items: [
          {
            productId: 'test-product-123',
            quantity: 2,
            price: 99.99,
            name: 'Test Product'
          }
        ]
      };

      const mockOrder = {
        orderId: 'test-order-123',
        customerId: 'test-customer-123',
        items: orderData.items,
        total: 199.98,
        status: OrderStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      } as any;

      mockRequest.body = orderData;
      mockOrderService.createOrder.mockResolvedValue(mockOrder);

      // Act
      await orderController.createOrder(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockOrderService.createOrder).toHaveBeenCalledWith(
        orderData.customerId,
        orderData.items,
        undefined
      );
      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: mockOrder,
        message: 'Order created successfully'
      });
    });

    it('should handle validation errors', async () => {
      // Arrange
      const invalidOrderData = {
        customerId: 'test-customer-123'
        // Missing items array
      };

      mockRequest.body = invalidOrderData;

      // Act
      await orderController.createOrder(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Validation error',
        details: ['"items" is required']
      });
    });

    it('should handle service errors', async () => {
      // Arrange
      const orderData = {
        customerId: 'test-customer-123',
        items: [
          {
            productId: 'test-product-123',
            quantity: 2,
            price: 99.99,
            name: 'Test Product'
          }
        ]
      };

      mockRequest.body = orderData;
      mockOrderService.createOrder.mockRejectedValue(new Error('Database connection failed'));

      // Act
      await orderController.createOrder(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error',
        message: 'Database connection failed'
      });
    });
  });

  describe('getOrder', () => {
    it('should get order successfully', async () => {
      // Arrange
      const mockOrder = {
        orderId: 'test-order-123',
        customerId: 'test-customer-123',
        items: [
          {
            productId: 'test-product-123',
            quantity: 2,
            price: 99.99,
            name: 'Test Product'
          }
        ],
        total: 199.98,
        status: OrderStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      } as any;

      mockRequest.params = { orderId: 'test-order-123' };
      mockOrderService.getOrder.mockResolvedValue(mockOrder);

      // Act
      await orderController.getOrder(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockOrderService.getOrder).toHaveBeenCalledWith('test-order-123');
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: mockOrder
      });
    });

    it('should handle missing order ID', async () => {
      // Arrange
      mockRequest.params = {};

      // Act
      await orderController.getOrder(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Order ID is required'
      });
    });

    it('should handle order not found', async () => {
      // Arrange
      mockRequest.params = { orderId: 'non-existent-order' };
      mockOrderService.getOrder.mockResolvedValue(null);

      // Act
      await orderController.getOrder(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Order not found'
      });
    });

    it('should handle service errors', async () => {
      // Arrange
      mockRequest.params = { orderId: 'test-order-123' };
      mockOrderService.getOrder.mockRejectedValue(new Error('Database connection failed'));

      // Act
      await orderController.getOrder(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error',
        message: 'Database connection failed'
      });
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status successfully', async () => {
      // Arrange
      const mockOrder = {
        orderId: 'test-order-123',
        customerId: 'test-customer-123',
        items: [
          {
            productId: 'test-product-123',
            quantity: 2,
            price: 99.99,
            name: 'Test Product'
          }
        ],
        total: 199.98,
        status: OrderStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      } as any;

      mockRequest.params = { orderId: 'test-order-123' };
      mockRequest.body = { status: OrderStatus.PROCESSING };
      mockOrderService.updateOrderStatus.mockResolvedValue(mockOrder);

      // Act
      await orderController.updateOrderStatus(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockOrderService.updateOrderStatus).toHaveBeenCalledWith(
        'test-order-123',
        OrderStatus.PROCESSING,
        undefined
      );
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: mockOrder,
        message: 'Order status updated successfully'
      });
    });

    it('should handle missing order ID', async () => {
      // Arrange
      mockRequest.params = {};
      mockRequest.body = { status: OrderStatus.PROCESSING };

      // Act
      await orderController.updateOrderStatus(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Order ID is required'
      });
    });

    it('should handle invalid status transition', async () => {
      // Arrange
      mockRequest.params = { orderId: 'test-order-123' };
      mockRequest.body = { status: OrderStatus.DELIVERED };
      mockOrderService.updateOrderStatus.mockRejectedValue(
        new Error('Invalid status transition from pending to delivered')
      );

      // Act
      await orderController.updateOrderStatus(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid status transition',
        message: 'Invalid status transition from pending to delivered'
      });
    });

    it('should handle order not found', async () => {
      // Arrange
      mockRequest.params = { orderId: 'non-existent-order' };
      mockRequest.body = { status: OrderStatus.PROCESSING };
      mockOrderService.updateOrderStatus.mockRejectedValue(
        new Error('Order not found: non-existent-order')
      );

      // Act
      await orderController.updateOrderStatus(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Order not found'
      });
    });
  });

  describe('cancelOrder', () => {
    it('should cancel order successfully', async () => {
      // Arrange
      const mockOrder = {
        orderId: 'test-order-123',
        customerId: 'test-customer-123',
        items: [
          {
            productId: 'test-product-123',
            quantity: 2,
            price: 99.99,
            name: 'Test Product'
          }
        ],
        total: 199.98,
        status: OrderStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      } as any;

      mockRequest.params = { orderId: 'test-order-123' };
      mockRequest.body = { reason: 'Customer request' };
      mockOrderService.cancelOrder.mockResolvedValue(mockOrder);

      // Act
      await orderController.cancelOrder(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockOrderService.cancelOrder).toHaveBeenCalledWith('test-order-123', 'Customer request');
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: mockOrder,
        message: 'Order cancelled successfully'
      });
    });

    it('should handle missing order ID', async () => {
      // Arrange
      mockRequest.params = {};
      mockRequest.body = { reason: 'Customer request' };

      // Act
      await orderController.cancelOrder(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Order ID is required'
      });
    });

    it('should handle order not found', async () => {
      // Arrange
      mockRequest.params = { orderId: 'non-existent-order' };
      mockRequest.body = { reason: 'Customer request' };
      mockOrderService.cancelOrder.mockRejectedValue(
        new Error('Order not found: non-existent-order')
      );

      // Act
      await orderController.cancelOrder(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Order not found'
      });
    });

    it('should handle invalid cancellation', async () => {
      // Arrange
      mockRequest.params = { orderId: 'test-order-123' };
      mockRequest.body = { reason: 'Customer request' };
      mockOrderService.cancelOrder.mockRejectedValue(
        new Error('Cannot cancel order in status: delivered')
      );

      // Act
      await orderController.cancelOrder(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot cancel order',
        message: 'Cannot cancel order in status: delivered'
      });
    });
  });

  describe('getOrdersByCustomer', () => {
    it('should return customer orders successfully', async () => {
      // Arrange
      const customerId = 'test-customer-123';
      const orders = [
        { orderId: 'order1', customerId, status: OrderStatus.PENDING },
        { orderId: 'order2', customerId, status: OrderStatus.CONFIRMED }
      ];
      
      mockRequest = {
        params: { customerId }
      };
      
      mockOrderService.getOrdersByCustomer.mockResolvedValue(orders as any);

      // Act
      await orderController.getOrdersByCustomer(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockOrderService.getOrdersByCustomer).toHaveBeenCalledWith(customerId);
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: orders,
        count: orders.length
      });
    });

    it('should handle empty customer orders', async () => {
      // Arrange
      const customerId = 'test-customer-123';
      
      mockRequest = {
        params: { customerId }
      };
      
      mockOrderService.getOrdersByCustomer.mockResolvedValue([]);

      // Act
      await orderController.getOrdersByCustomer(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: [],
        count: 0
      });
    });
  });

  describe('getOrdersByStatus', () => {
    it('should return orders by status successfully', async () => {
      // Arrange
      const status = OrderStatus.PENDING;
      const orders = [
        { orderId: 'order1', status: OrderStatus.PENDING },
        { orderId: 'order2', status: OrderStatus.PENDING }
      ];
      
      mockRequest = {
        params: { status }
      };
      
      mockOrderService.getOrdersByStatus.mockResolvedValue(orders as any);

      // Act
      await orderController.getOrdersByStatus(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockOrderService.getOrdersByStatus).toHaveBeenCalledWith(status);
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: orders,
        count: orders.length
      });
    });

    it('should handle empty status results', async () => {
      // Arrange
      const status = OrderStatus.DELIVERED;
      
      mockRequest = {
        params: { status }
      };
      
      mockOrderService.getOrdersByStatus.mockResolvedValue([]);

      // Act
      await orderController.getOrdersByStatus(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: [],
        count: 0
      });
    });
  });

  describe('error handling', () => {
    it('should handle missing required parameters', async () => {
      // Arrange
      const invalidOrderData = {
        // Missing customerId and items
      };

      mockRequest.body = invalidOrderData;

      // Act
      await orderController.createOrder(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Validation error',
        details: ['"customerId" is required']
      });
    });

    it('should handle malformed request body', async () => {
      // Arrange
      mockRequest.body = 'invalid json';

      // Act
      await orderController.createOrder(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Validation error',
        details: ['"value" must be of type object']
      });
    });
  });
});
