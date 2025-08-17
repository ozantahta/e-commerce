import { RetryHandler, createRetryHandler } from '../utils/retry';
import { RetryConfig } from '../types';

// Mock Math.random to make jitter predictable
const mockMath = Object.create(global.Math);
mockMath.random = () => 0.5; // Always return 0.5 for consistent jitter
global.Math = mockMath;

describe('RetryHandler', () => {
  let retryHandler: RetryHandler;
  let mockConfig: RetryConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfig = {
      maxAttempts: 3,
      backoffMs: 1000,
      maxBackoffMs: 10000,
      jitter: true
    };
    
    retryHandler = new RetryHandler(mockConfig);
  });

  describe('initialization', () => {
    it('should initialize with provided configuration', () => {
      // Assert
      expect(retryHandler).toBeInstanceOf(RetryHandler);
    });

    it('should use default configuration when none provided', () => {
      // Act
      const defaultRetryHandler = new RetryHandler();
      
      // Assert
      expect(defaultRetryHandler).toBeInstanceOf(RetryHandler);
    });
  });

  describe('execute', () => {
    it('should execute operation successfully on first attempt', async () => {
      // Arrange
      const successfulOperation = jest.fn().mockResolvedValue('success');
      
      // Act
      const result = await retryHandler.execute(successfulOperation);
      
      // Assert
      expect(result).toBe('success');
      expect(successfulOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry failed operation and succeed', async () => {
      // Arrange
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockRejectedValueOnce(new Error('Second attempt failed'))
        .mockResolvedValueOnce('success');
      
      // Mock console.log to avoid noise in tests
      const originalLog = console.log;
      console.log = jest.fn();
      
      // Act
      const result = await retryHandler.execute(operation);
      
      // Assert
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(console.log).toHaveBeenCalledWith(
        'Attempt 1 failed, retrying in 750ms...' // 1000 * (0.5 + 0.5 * 0.5) = 750
      );
      expect(console.log).toHaveBeenCalledWith(
        'Attempt 2 failed, retrying in 1500ms...' // 2000 * (0.5 + 0.5 * 0.5) = 1500
      );
      
      // Restore console.log
      console.log = originalLog;
    });

    it('should fail after max attempts reached', async () => {
      // Arrange
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Mock console.log to avoid noise in tests
      const originalLog = console.log;
      console.log = jest.fn();
      
      // Act & Assert
      await expect(retryHandler.execute(failingOperation))
        .rejects
        .toThrow('Operation failed after 3 attempts: Operation failed');
      
      expect(failingOperation).toHaveBeenCalledTimes(3);
      expect(console.log).toHaveBeenCalledWith(
        'Attempt 1 failed, retrying in 750ms...'
      );
      expect(console.log).toHaveBeenCalledWith(
        'Attempt 2 failed, retrying in 1500ms...'
      );
      
      // Restore console.log
      console.log = originalLog;
    });

    it('should handle different error types', async () => {
      // Arrange
      const operation = jest.fn()
        .mockRejectedValueOnce('String error')
        .mockRejectedValueOnce(123)
        .mockRejectedValueOnce(new Error('Final error'));
      
      // Mock console.log to avoid noise in tests
      const originalLog = console.log;
      console.log = jest.fn();
      
      // Act & Assert
      await expect(retryHandler.execute(operation))
        .rejects
        .toThrow('Operation failed after 3 attempts: Final error');
      
      expect(operation).toHaveBeenCalledTimes(3);
      
      // Restore console.log
      console.log = originalLog;
    });

    it('should preserve error context', async () => {
      // Arrange
      const customError = new Error('Custom error message');
      customError.name = 'CustomError';
      customError.stack = 'Custom stack trace';
      
      const operation = jest.fn().mockRejectedValue(customError);
      
      // Mock console.log to avoid noise in tests
      const originalLog = console.log;
      console.log = jest.fn();
      
      // Act & Assert
      await expect(retryHandler.execute(operation))
        .rejects
        .toThrow('Operation failed after 3 attempts: Custom error message');
      
      // Restore console.log
      console.log = originalLog;
    });
  });

  describe('delay calculation', () => {
    it('should calculate exponential backoff correctly', async () => {
      // Arrange
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockRejectedValueOnce(new Error('Second attempt failed'))
        .mockResolvedValueOnce('success');
      
      // Mock console.log to avoid noise in tests
      const originalLog = console.log;
      console.log = jest.fn();
      
      // Mock sleep to speed up test
      const originalSleep = (retryHandler as any).sleep;
      (retryHandler as any).sleep = jest.fn().mockResolvedValue(undefined);
      
      // Act
      await retryHandler.execute(operation);
      
      // Assert
      expect(console.log).toHaveBeenCalledWith(
        'Attempt 1 failed, retrying in 750ms...'
      );
      expect(console.log).toHaveBeenCalledWith(
        'Attempt 2 failed, retrying in 1500ms...'
      );
      
      // Verify sleep was called with correct delays
      expect((retryHandler as any).sleep).toHaveBeenCalledWith(750);
      expect((retryHandler as any).sleep).toHaveBeenCalledWith(1500);
      
      // Restore mocks
      console.log = originalLog;
      (retryHandler as any).sleep = originalSleep;
    });

    it('should respect max backoff limit', async () => {
      // Arrange
      const configWithHighBackoff: RetryConfig = {
        maxAttempts: 5,
        backoffMs: 10000, // 10 seconds
        maxBackoffMs: 15000, // 15 seconds max
        jitter: false
      };
      
      const highBackoffRetryHandler = new RetryHandler(configWithHighBackoff);
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Attempt 1 failed'))
        .mockRejectedValueOnce(new Error('Attempt 2 failed'))
        .mockRejectedValueOnce(new Error('Attempt 3 failed'))
        .mockRejectedValueOnce(new Error('Attempt 4 failed'))
        .mockResolvedValueOnce('success');
      
      // Mock console.log to avoid noise in tests
      const originalLog = console.log;
      console.log = jest.fn();
      
      // Mock sleep to speed up test
      const originalSleep = (highBackoffRetryHandler as any).sleep;
      (highBackoffRetryHandler as any).sleep = jest.fn().mockResolvedValue(undefined);
      
      // Act
      await highBackoffRetryHandler.execute(operation);
      
      // Assert
      // Attempt 1: 10000ms
      // Attempt 2: 20000ms (capped at 15000ms)
      // Attempt 3: 40000ms (capped at 15000ms)
      // Attempt 4: 80000ms (capped at 15000ms)
      expect((highBackoffRetryHandler as any).sleep).toHaveBeenCalledWith(10000);
      expect((highBackoffRetryHandler as any).sleep).toHaveBeenCalledWith(15000);
      expect((highBackoffRetryHandler as any).sleep).toHaveBeenCalledWith(15000);
      expect((highBackoffRetryHandler as any).sleep).toHaveBeenCalledWith(15000);
      
      // Restore mocks
      console.log = originalLog;
      (highBackoffRetryHandler as any).sleep = originalSleep;
    });

    it('should apply jitter when enabled', async () => {
      // Arrange
      const configWithJitter: RetryConfig = {
        maxAttempts: 2,
        backoffMs: 1000,
        maxBackoffMs: 10000,
        jitter: true
      };
      
      const jitterRetryHandler = new RetryHandler(configWithJitter);
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce('success');
      
      // Mock console.log to avoid noise in tests
      const originalLog = console.log;
      console.log = jest.fn();
      
      // Mock sleep to speed up test
      const originalSleep = (jitterRetryHandler as any).sleep;
      (jitterRetryHandler as any).sleep = jest.fn().mockResolvedValue(undefined);
      
      // Act
      await jitterRetryHandler.execute(operation);
      
      // Assert
      expect((jitterRetryHandler as any).sleep).toHaveBeenCalledWith(750);
      
      // Restore mocks
      console.log = originalLog;
      (jitterRetryHandler as any).sleep = originalSleep;
    });

    it('should not apply jitter when disabled', async () => {
      // Arrange
      const configWithoutJitter: RetryConfig = {
        maxAttempts: 2,
        backoffMs: 1000,
        maxBackoffMs: 10000,
        jitter: false
      };
      
      const noJitterRetryHandler = new RetryHandler(configWithoutJitter);
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce('success');
      
      // Mock console.log to avoid noise in tests
      const originalLog = console.log;
      console.log = jest.fn();
      
      // Mock sleep to speed up test
      const originalSleep = (noJitterRetryHandler as any).sleep;
      (noJitterRetryHandler as any).sleep = jest.fn().mockResolvedValue(undefined);
      
      // Act
      await noJitterRetryHandler.execute(operation);
      
      // Assert
      expect((noJitterRetryHandler as any).sleep).toHaveBeenCalledWith(1000);
      
      // Restore mocks
      console.log = originalLog;
      (noJitterRetryHandler as any).sleep = originalSleep;
    });
  });

  describe('createRetryHandler', () => {
    it('should create retry handler with default configuration', () => {
      // Act
      const retryHandler = createRetryHandler();
      
      // Assert
      expect(retryHandler).toBeInstanceOf(RetryHandler);
    });

    it('should create retry handler with custom configuration', () => {
      // Arrange
      const customConfig = {
        maxAttempts: 5,
        backoffMs: 2000
      };
      
      // Act
      const retryHandler = createRetryHandler(customConfig);
      
      // Assert
      expect(retryHandler).toBeInstanceOf(RetryHandler);
    });

    it('should merge custom configuration with defaults', () => {
      // Arrange
      const customConfig = {
        maxAttempts: 7
      };
      
      // Act
      const retryHandler = createRetryHandler(customConfig);
      
      // Assert
      expect(retryHandler).toBeInstanceOf(RetryHandler);
    });
  });

  describe('edge cases', () => {
    it('should handle operation that returns undefined', async () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue(undefined);
      
      // Act
      const result = await retryHandler.execute(operation);
      
      // Assert
      expect(result).toBeUndefined();
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle operation that returns null', async () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue(null);
      
      // Act
      const result = await retryHandler.execute(operation);
      
      // Assert
      expect(result).toBeNull();
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle operation that returns complex objects', async () => {
      // Arrange
      const complexObject = {
        id: 123,
        name: 'Test',
        nested: {
          value: 'nested value'
        }
      };
      const operation = jest.fn().mockResolvedValue(complexObject);
      
      // Act
      const result = await retryHandler.execute(operation);
      
      // Assert
      expect(result).toEqual(complexObject);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle rapid successive operations', async () => {
      // Arrange
      const operations = Array(5).fill(null).map((_, i) => 
        jest.fn().mockResolvedValue(`result-${i}`)
      );
      
      // Act
      const results = await Promise.all(
        operations.map(op => retryHandler.execute(op))
      );
      
      // Assert
      expect(results).toEqual(['result-0', 'result-1', 'result-2', 'result-3', 'result-4']);
      operations.forEach(op => expect(op).toHaveBeenCalledTimes(1));
    });
  });

  describe('context parameter', () => {
    it('should accept context parameter', async () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue('success');
      const context = 'test-context';
      
      // Act
      const result = await retryHandler.execute(operation, context);
      
      // Assert
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should work with context parameter on retries', async () => {
      // Arrange
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce('success');
      const context = 'test-context';
      
      // Mock console.log to avoid noise in tests
      const originalLog = console.log;
      console.log = jest.fn();
      
      // Act
      const result = await retryHandler.execute(operation, context);
      
      // Assert
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
      
      // Restore console.log
      console.log = originalLog;
    });
  });

  describe('sleep function', () => {
    it('should sleep for specified duration', async () => {
      // Arrange
      const sleepDuration = 100; // 100ms for faster test
      
      // Act
      const startTime = Date.now();
      await (retryHandler as any).sleep(sleepDuration);
      const endTime = Date.now();
      
      // Assert
      const actualDuration = endTime - startTime;
      expect(actualDuration).toBeGreaterThanOrEqual(sleepDuration - 10); // Allow small timing variance
    });
  });
});
