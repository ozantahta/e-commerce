import { MessageQueueManager } from '../utils/message-queue';
import { MessageQueueConfig, BaseEvent } from '../types';

// Mock amqplib
jest.mock('amqplib', () => ({
  connect: jest.fn()
}));

// Mock the CircuitBreaker
jest.mock('../utils/circuit-breaker', () => ({
  CircuitBreaker: jest.fn().mockImplementation(() => ({
    execute: jest.fn((fn) => fn())
  }))
}));

describe('MessageQueueManager', () => {
  let messageQueueManager: MessageQueueManager;
  let mockConnection: any;
  let mockChannel: any;
  let mockAmqp: any;

  const mockConfig: MessageQueueConfig = {
    url: 'amqp://localhost:5672',
    exchange: 'test.events',
    queue: 'test.queue',
    routingKey: 'test.*',
    options: {
      durable: true,
      persistent: true,
      deadLetterExchange: 'test.dlq',
      deadLetterRoutingKey: 'test.dlq',
      messageTtl: 30000,
      maxRetries: 3
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock connection and channel
    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue({}),
      assertQueue: jest.fn().mockResolvedValue({}),
      bindQueue: jest.fn().mockResolvedValue({}),
      publish: jest.fn().mockReturnValue(true),
      consume: jest.fn().mockResolvedValue({}),
      ack: jest.fn(),
      nack: jest.fn(),
      close: jest.fn().mockResolvedValue({})
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      on: jest.fn(),
      close: jest.fn().mockResolvedValue({})
    };

    // Mock amqplib.connect
    const amqp = require('amqplib');
    amqp.connect.mockResolvedValue(mockConnection);

    messageQueueManager = new MessageQueueManager(mockConfig);
  });

  describe('connect', () => {
    it('should connect successfully and setup exchanges and queues', async () => {
      // Act
      await messageQueueManager.connect();

      // Assert
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'test.events',
        'topic',
        { durable: true }
      );
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'test.queue',
        {
          durable: true,
          deadLetterExchange: 'test.dlq',
          deadLetterRoutingKey: 'test.dlq',
          messageTtl: 30000
        }
      );
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'test.queue',
        'test.events',
        'test.*'
      );
    });

    it('should setup dead letter queue when configured', async () => {
      // Act
      await messageQueueManager.connect();

      // Assert
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'test.dlq',
        'topic',
        { durable: true }
      );
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'test.queue.dlq',
        { durable: true }
      );
    });

    it('should handle connection errors', async () => {
      // Arrange
      const connectionError = new Error('Connection failed');
      mockConnection.createChannel.mockRejectedValue(connectionError);

      // Act & Assert
      await expect(messageQueueManager.connect()).rejects.toThrow('Connection failed');
    });

    it('should add event listeners to connection', async () => {
      // Act
      await messageQueueManager.connect();

      // Assert
      expect(mockConnection.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockConnection.on).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  describe('publishEvent', () => {
    beforeEach(async () => {
      await messageQueueManager.connect();
    });

    it('should publish event successfully', async () => {
      // Arrange
      const event: BaseEvent = {
        id: 'test-event-123',
        type: 'test.event',
        version: '1.0.0',
        timestamp: new Date(),
        source: 'test-service'
      };

      // Act
      const result = await messageQueueManager.publishEvent(event);

      // Assert
      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'test.events',
        'test.*',
        expect.any(Buffer),
        {
          persistent: true,
          messageId: 'test-event-123',
          correlationId: undefined,
          timestamp: expect.any(Number),
          headers: {
            version: '1.0.0',
            source: 'test-service'
          }
        }
      );
    });

    it('should publish event with custom routing key', async () => {
      // Arrange
      const event: BaseEvent = {
        id: 'test-event-123',
        type: 'test.event',
        version: '1.0.0',
        timestamp: new Date(),
        source: 'test-service'
      };
      const customRoutingKey = 'custom.routing.key';

      // Act
      const result = await messageQueueManager.publishEvent(event, customRoutingKey);

      // Assert
      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'test.events',
        customRoutingKey,
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should handle publish failures', async () => {
      // Arrange
      const event: BaseEvent = {
        id: 'test-event-123',
        type: 'test.event',
        version: '1.0.0',
        timestamp: new Date(),
        source: 'test-service'
      };
      mockChannel.publish.mockReturnValue(false);

      // Act
      const result = await messageQueueManager.publishEvent(event);

      // Assert
      expect(result).toBe(false);
    });

    it('should throw error when channel not initialized', async () => {
      // Arrange
      const event: BaseEvent = {
        id: 'test-event-123',
        type: 'test.event',
        version: '1.0.0',
        timestamp: new Date(),
        source: 'test-service'
      };
      
      // Reset connection without calling connect
      (messageQueueManager as any).channel = null;

      // Act & Assert
      await expect(messageQueueManager.publishEvent(event))
        .rejects
        .toThrow('Channel not initialized');
    });
  });

  describe('consumeEvents', () => {
    beforeEach(async () => {
      await messageQueueManager.connect();
    });

    it('should start consuming events', async () => {
      // Arrange
      const mockHandler = jest.fn().mockResolvedValue(undefined);

      // Act
      await messageQueueManager.consumeEvents(mockHandler);

      // Assert
      expect(mockChannel.consume).toHaveBeenCalledWith(
        'test.queue',
        expect.any(Function),
        { noAck: false }
      );
    });

    it('should process events successfully and acknowledge', async () => {
      // Arrange
      const mockHandler = jest.fn().mockResolvedValue(undefined);
      const mockMessage = {
        content: Buffer.from(JSON.stringify({
          id: 'test-event-123',
          type: 'test.event',
          version: '1.0.0',
          timestamp: new Date(),
          source: 'test-service'
        }))
      };

      await messageQueueManager.consumeEvents(mockHandler);

      // Get the consumer callback
      const consumerCallback = mockChannel.consume.mock.calls[0][1];

      // Act
      await consumerCallback(mockMessage);

      // Assert
      expect(mockHandler).toHaveBeenCalled();
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
    });

    it('should handle processing errors and reject message', async () => {
      // Arrange
      const mockHandler = jest.fn().mockRejectedValue(new Error('Processing failed'));
      const mockMessage = {
        content: Buffer.from(JSON.stringify({
          id: 'test-event-123',
          type: 'test.event',
          version: '1.0.0',
          timestamp: new Date(),
          source: 'test-service'
        }))
      };

      await messageQueueManager.consumeEvents(mockHandler);

      // Get the consumer callback
      const consumerCallback = mockChannel.consume.mock.calls[0][1];

      // Act
      await consumerCallback(mockMessage);

      // Assert
      expect(mockHandler).toHaveBeenCalled();
      expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, true);
    });

    it('should not requeue validation errors', async () => {
      // Arrange
      const validationError = new Error('validation: Invalid event format');
      const mockHandler = jest.fn().mockRejectedValue(validationError);
      const mockMessage = {
        content: Buffer.from(JSON.stringify({
          id: 'test-event-123',
          type: 'test.event',
          version: '1.0.0',
          timestamp: new Date(),
          source: 'test-service'
        }))
      };

      await messageQueueManager.consumeEvents(mockHandler);

      // Get the consumer callback
      const consumerCallback = mockChannel.consume.mock.calls[0][1];

      // Act
      await consumerCallback(mockMessage);

      // Assert
      expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, false);
    });

    it('should throw error when channel not initialized', async () => {
      // Arrange
      const mockHandler = jest.fn();
      (messageQueueManager as any).channel = null;

      // Act & Assert
      await expect(messageQueueManager.consumeEvents(mockHandler))
        .rejects
        .toThrow('Channel not initialized');
    });
  });

  describe('publishToDeadLetter', () => {
    beforeEach(async () => {
      await messageQueueManager.connect();
    });

    it('should publish to dead letter queue successfully', async () => {
      // Arrange
      const event: BaseEvent = {
        id: 'test-event-123',
        type: 'test.event',
        version: '1.0.0',
        timestamp: new Date(),
        source: 'test-service'
      };
      const reason = 'Processing failed';
      const originalMessage = { content: 'original' };

      // Act
      await messageQueueManager.publishToDeadLetter(event, reason, originalMessage);

      // Assert
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'test.dlq',
        'test.dlq',
        expect.any(Buffer),
        {
          persistent: true,
          messageId: 'dlq-test-event-123',
          timestamp: expect.any(Number)
        }
      );
    });

    it('should handle missing dead letter configuration', async () => {
      // Arrange
      const event: BaseEvent = {
        id: 'test-event-123',
        type: 'test.event',
        version: '1.0.0',
        timestamp: new Date(),
        source: 'test-service'
      };
      const reason = 'Processing failed';
      const originalMessage = { content: 'original' };

      // Remove DLQ configuration
      (messageQueueManager as any).config.options.deadLetterExchange = undefined;

      // Act
      await messageQueueManager.publishToDeadLetter(event, reason, originalMessage);

      // Assert - should not throw error, just log warning
      expect(mockChannel.publish).not.toHaveBeenCalled();
    });
  });

  describe('connection management', () => {
    it('should handle connection errors and schedule reconnection', async () => {
      // Arrange
      await messageQueueManager.connect();
      
      // Get the error handler
      const errorHandler = mockConnection.on.mock.calls.find((call: any[]) => call[0] === 'error')[1];
      
      // Mock setTimeout
      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      // Act
      errorHandler(new Error('Connection error'));

      // Assert
      expect(setTimeoutSpy).toHaveBeenCalled();
      
      jest.useRealTimers();
    });

    it('should handle connection close and schedule reconnection', async () => {
      // Arrange
      await messageQueueManager.connect();
      
      // Get the close handler
      const closeHandler = mockConnection.on.mock.calls.find((call: any[]) => call[0] === 'close')[1];
      
      // Mock setTimeout
      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      // Act
      closeHandler();

      // Assert
      expect(setTimeoutSpy).toHaveBeenCalled();
      
      jest.useRealTimers();
    });

    it('should limit reconnection attempts', async () => {
      // Arrange
      await messageQueueManager.connect();
      
      // Get the error handler
      const errorHandler = mockConnection.on.mock.calls.find((call: any[]) => call[0] === 'error')[1];
      
      // Mock setTimeout
      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      // Act - trigger multiple errors
      for (let i = 0; i < 15; i++) {
        errorHandler(new Error(`Connection error ${i}`));
      }

      // Assert - should stop scheduling reconnections after max attempts
      expect(setTimeoutSpy).toHaveBeenCalledTimes(10); // maxReconnectAttempts
      
      jest.useRealTimers();
    });
  });

  describe('close', () => {
    it('should close connections gracefully', async () => {
      // Arrange
      await messageQueueManager.connect();

      // Act
      await messageQueueManager.close();

      // Assert
      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      // Arrange
      await messageQueueManager.connect();
      mockChannel.close.mockRejectedValue(new Error('Close failed'));

      // Act
      await messageQueueManager.close();

      // Assert - should not throw error and should still close connection
      expect(mockChannel.close).toHaveBeenCalled();
      // The connection.close should still be called even if channel.close fails
      expect(mockConnection.close).toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('should return true when connected', async () => {
      // Arrange
      await messageQueueManager.connect();

      // Act
      const isConnected = messageQueueManager.isConnected();

      // Assert
      expect(isConnected).toBe(true);
    });

    it('should return false when not connected', () => {
      // Act
      const isConnected = messageQueueManager.isConnected();

      // Assert
      expect(isConnected).toBe(false);
    });
  });
});
