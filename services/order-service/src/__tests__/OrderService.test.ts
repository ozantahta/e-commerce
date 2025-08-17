import { OrderService } from '../services/OrderService';
import { Order, IOrder } from '../models/Order';
import { OrderStatus, OrderItem } from '@e-commerce/shared';
import { MessageQueueManager } from '@e-commerce/shared';

// Mock the Order model
jest.mock('../models/Order');
const MockedOrder = Order as jest.MockedClass<typeof Order>;

// Mock the MessageQueueManager
jest.mock('@e-commerce/shared', () => ({
  ...jest.requireActual('@e-commerce/shared'),
  MessageQueueManager: jest.fn(),
  createRetryHandler: jest.fn(() => ({
    execute: jest.fn((fn) => fn())
  }))
}));

const MockedMessageQueueManager = MessageQueueManager as jest.MockedClass<typeof MessageQueueManager>;

describe('OrderService', () => {
  let orderService: OrderService;
  let mockMessageQueue: jest.Mocked<MessageQueueManager>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock message queue
    mockMessageQueue = {
      publishEvent: jest.fn().mockResolvedValue(true),
      connect: jest.fn(),
      close: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
      consumeEvents: jest.fn(),
      publishToDeadLetter: jest.fn()
    } as any;
    
    // Create service instance
    orderService = new OrderService(mockMessageQueue);
  });

  describe('createOrder', () => {
    it('should create an order successfully', async () => {
      // Arrange
      const customerId = 'test-customer-123';
      const items: OrderItem[] = [
        {
          productId: 'test-product-123',
          quantity: 2,
          price: 99.99,
          name: 'Test Product'
        }
      ];
      
      const mockOrder = {
        orderId: 'test-order-123',
        customerId,
        items,
        total: 199.98,
        status: OrderStatus.PENDING,
        save: jest.fn().mockResolvedValue({
          orderId: 'test-order-123',
          customerId,
          items,
          total: 199.98,
          status: OrderStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      };
      
      MockedOrder.mockImplementation(() => mockOrder as any);

      // Act
      const result = await orderService.createOrder(customerId, items);

      // Assert
      expect(result.orderId).toBe('test-order-123');
      expect(result.customerId).toBe(customerId);
      expect(result.items).toEqual(items);
      expect(result.total).toBe(199.98);
      expect(result.status).toBe(OrderStatus.PENDING);
      expect(mockOrder.save).toHaveBeenCalled();
      expect(mockMessageQueue.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'order.created',
          data: expect.objectContaining({
            orderId: 'test-order-123'
          })
        })
      );
    });

    it('should throw error when items array is empty', async () => {
      // Arrange
      const customerId = 'test-customer-123';
      const items: OrderItem[] = [];

      // Act & Assert
      await expect(orderService.createOrder(customerId, items))
        .rejects
        .toThrow('Order must contain at least one item');
    });

    it('should throw error when items array is null', async () => {
      // Arrange
      const customerId = 'test-customer-123';
      const items: OrderItem[] = null as any;

      // Act & Assert
      await expect(orderService.createOrder(customerId, items))
        .rejects
        .toThrow('Order must contain at least one item');
    });

    it('should calculate total correctly for multiple items', async () => {
      // Arrange
      const customerId = 'test-customer-123';
      const items: OrderItem[] = [
        { productId: 'prod1', quantity: 2, price: 50, name: 'Product 1' },
        { productId: 'prod2', quantity: 1, price: 100, name: 'Product 2' }
      ];
      
      const mockOrder = {
        orderId: 'test-order-123',
        customerId,
        items,
        total: 200, // 2 * 50 + 1 * 100
        status: OrderStatus.PENDING,
        save: jest.fn().mockResolvedValue({
          orderId: 'test-order-123',
          customerId,
          items,
          total: 200,
          status: OrderStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      };
      
      MockedOrder.mockImplementation(() => mockOrder as any);

      // Act
      const result = await orderService.createOrder(customerId, items);

      // Assert
      expect(result.total).toBe(200);
    });
  });

  describe('getOrder', () => {
    it('should return order when found', async () => {
      // Arrange
      const orderId = 'test-order-123';
      const mockOrder = {
        orderId,
        customerId: 'test-customer-123',
        items: [],
        total: 0,
        status: OrderStatus.PENDING
      };
      
      MockedOrder.findOne = jest.fn().mockResolvedValue(mockOrder);

      // Act
      const result = await orderService.getOrder(orderId);

      // Assert
      expect(result).toEqual(mockOrder);
      expect(MockedOrder.findOne).toHaveBeenCalledWith({ orderId });
    });

    it('should return null when order not found', async () => {
      // Arrange
      const orderId = 'non-existent-order';
      MockedOrder.findOne = jest.fn().mockResolvedValue(null);

      // Act
      const result = await orderService.getOrder(orderId);

      // Assert
      expect(result).toBeNull();
      expect(MockedOrder.findOne).toHaveBeenCalledWith({ orderId });
    });

    it('should throw error when database operation fails', async () => {
      // Arrange
      const orderId = 'test-order-123';
      const dbError = new Error('Database connection failed');
      MockedOrder.findOne = jest.fn().mockRejectedValue(dbError);

      // Act & Assert
      await expect(orderService.getOrder(orderId))
        .rejects
        .toThrow('Database connection failed');
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status successfully', async () => {
      // Arrange
      const orderId = 'test-order-123';
      const newStatus = OrderStatus.CONFIRMED;
      const mockOrder = {
        orderId,
        customerId: 'test-customer-123',
        items: [],
        total: 0,
        status: OrderStatus.PENDING,
        updatedAt: new Date(),
        save: jest.fn().mockResolvedValue({
          orderId,
          status: newStatus,
          updatedAt: new Date()
        })
      };
      
      MockedOrder.findOne = jest.fn().mockResolvedValue(mockOrder);

      // Act
      const result = await orderService.updateOrderStatus(orderId, newStatus);

      // Assert
      expect(result.status).toBe(newStatus);
      expect(mockOrder.save).toHaveBeenCalled();
      expect(mockMessageQueue.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'order.updated',
          data: expect.objectContaining({
            orderId,
            status: newStatus
          })
        })
      );
    });

    it('should throw error when order not found', async () => {
      // Arrange
      const orderId = 'non-existent-order';
      const newStatus = OrderStatus.CONFIRMED;
      MockedOrder.findOne = jest.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(orderService.updateOrderStatus(orderId, newStatus))
        .rejects
        .toThrow('Order not found: non-existent-order');
    });

    it('should throw error for invalid status transition', async () => {
      // Arrange
      const orderId = 'test-order-123';
      const newStatus = OrderStatus.DELIVERED; // Invalid transition from PENDING
      const mockOrder = {
        orderId,
        status: OrderStatus.PENDING,
        items: [],
        total: 0
      };
      
      MockedOrder.findOne = jest.fn().mockResolvedValue(mockOrder);

      // Act & Assert
      await expect(orderService.updateOrderStatus(orderId, newStatus))
        .rejects
        .toThrow('Invalid status transition from pending to delivered');
    });

    it('should allow valid status transitions', async () => {
      // Arrange
      const orderId = 'test-order-123';
      const validTransitions = [
        { from: OrderStatus.PENDING, to: OrderStatus.CONFIRMED },
        { from: OrderStatus.CONFIRMED, to: OrderStatus.PROCESSING },
        { from: OrderStatus.PROCESSING, to: OrderStatus.SHIPPED },
        { from: OrderStatus.SHIPPED, to: OrderStatus.DELIVERED }
      ];

      for (const transition of validTransitions) {
        const mockOrder = {
          orderId,
          status: transition.from,
          items: [],
          total: 0,
          updatedAt: new Date(),
          save: jest.fn().mockResolvedValue({
            orderId,
            status: transition.to,
            updatedAt: new Date()
          })
        };
        
        MockedOrder.findOne = jest.fn().mockResolvedValue(mockOrder);

        // Act
        const result = await orderService.updateOrderStatus(orderId, transition.to);

        // Assert
        expect(result.status).toBe(transition.to);
      }
    });
  });

  describe('cancelOrder', () => {
    it('should cancel order successfully', async () => {
      // Arrange
      const orderId = 'test-order-123';
      const reason = 'Customer request';
      const mockOrder = {
        orderId,
        status: OrderStatus.PENDING,
        items: [],
        total: 0,
        updatedAt: new Date(),
        metadata: {},
        save: jest.fn().mockResolvedValue({
          orderId,
          status: OrderStatus.CANCELLED,
          metadata: { cancellationReason: reason, cancelledAt: expect.any(Date) }
        })
      };
      
      MockedOrder.findOne = jest.fn().mockResolvedValue(mockOrder);

      // Act
      const result = await orderService.cancelOrder(orderId, reason);

      // Assert
      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(mockOrder.save).toHaveBeenCalled();
      expect(mockMessageQueue.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'order.cancelled',
          data: expect.objectContaining({
            orderId,
            status: OrderStatus.CANCELLED
          })
        })
      );
    });

    it('should throw error when order not found', async () => {
      // Arrange
      const orderId = 'non-existent-order';
      MockedOrder.findOne = jest.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(orderService.cancelOrder(orderId))
        .rejects
        .toThrow('Order not found: non-existent-order');
    });

    it('should throw error when order is already cancelled', async () => {
      // Arrange
      const orderId = 'test-order-123';
      const mockOrder = {
        orderId,
        status: OrderStatus.CANCELLED,
        items: [],
        total: 0
      };
      
      MockedOrder.findOne = jest.fn().mockResolvedValue(mockOrder);

      // Act & Assert
      await expect(orderService.cancelOrder(orderId))
        .rejects
        .toThrow('Order test-order-123 is already cancelled');
    });

    it('should throw error when order cannot be cancelled in current status', async () => {
      // Arrange
      const orderId = 'test-order-123';
      const mockOrder = {
        orderId,
        status: OrderStatus.DELIVERED, // Cannot cancel delivered orders
        items: [],
        total: 0
      };
      
      MockedOrder.findOne = jest.fn().mockResolvedValue(mockOrder);

      // Act & Assert
      await expect(orderService.cancelOrder(orderId))
        .rejects
        .toThrow('Cannot cancel order in status: delivered');
    });
  });

  describe('getOrdersByCustomer', () => {
    it('should return customer orders sorted by creation date', async () => {
      // Arrange
      const customerId = 'test-customer-123';
      const mockOrders = [
        { orderId: 'order1', createdAt: new Date('2024-01-02') },
        { orderId: 'order2', createdAt: new Date('2024-01-01') }
      ];
      
      MockedOrder.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockOrders)
      });

      // Act
      const result = await orderService.getOrdersByCustomer(customerId);

      // Assert
      expect(result).toEqual(mockOrders);
      expect(MockedOrder.find).toHaveBeenCalledWith({ customerId });
    });

    it('should throw error when database operation fails', async () => {
      // Arrange
      const customerId = 'test-customer-123';
      const dbError = new Error('Database connection failed');
      MockedOrder.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockRejectedValue(dbError)
      });

      // Act & Assert
      await expect(orderService.getOrdersByCustomer(customerId))
        .rejects
        .toThrow('Database connection failed');
    });
  });

  describe('getOrdersByStatus', () => {
    it('should return orders by status sorted by creation date', async () => {
      // Arrange
      const status = OrderStatus.PENDING;
      const mockOrders = [
        { orderId: 'order1', status, createdAt: new Date('2024-01-02') },
        { orderId: 'order2', status, createdAt: new Date('2024-01-01') }
      ];
      
      MockedOrder.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockOrders)
      });

      // Act
      const result = await orderService.getOrdersByStatus(status);

      // Assert
      expect(result).toEqual(mockOrders);
      expect(MockedOrder.find).toHaveBeenCalledWith({ status });
    });
  });

  describe('private methods', () => {
    describe('isValidStatusTransition', () => {
      it('should validate status transitions correctly', () => {
        // Use reflection to access private method
        const isValidTransition = (orderService as any).isValidStatusTransition;
        
        // Valid transitions
        expect(isValidTransition(OrderStatus.PENDING, OrderStatus.CONFIRMED)).toBe(true);
        expect(isValidTransition(OrderStatus.CONFIRMED, OrderStatus.PROCESSING)).toBe(true);
        expect(isValidTransition(OrderStatus.PROCESSING, OrderStatus.SHIPPED)).toBe(true);
        expect(isValidTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED)).toBe(true);
        
        // Invalid transitions
        expect(isValidTransition(OrderStatus.PENDING, OrderStatus.DELIVERED)).toBe(false);
        expect(isValidTransition(OrderStatus.DELIVERED, OrderStatus.PENDING)).toBe(false);
        expect(isValidTransition(OrderStatus.CANCELLED, OrderStatus.CONFIRMED)).toBe(false);
      });
    });

    describe('canCancelOrder', () => {
      it('should determine if order can be cancelled', () => {
        const canCancel = (orderService as any).canCancelOrder;
        
        // Can cancel
        expect(canCancel(OrderStatus.PENDING)).toBe(true);
        expect(canCancel(OrderStatus.CONFIRMED)).toBe(true);
        expect(canCancel(OrderStatus.PROCESSING)).toBe(true);
        
        // Cannot cancel
        expect(canCancel(OrderStatus.SHIPPED)).toBe(false);
        expect(canCancel(OrderStatus.DELIVERED)).toBe(false);
        expect(canCancel(OrderStatus.CANCELLED)).toBe(false);
      });
    });
  });
});
