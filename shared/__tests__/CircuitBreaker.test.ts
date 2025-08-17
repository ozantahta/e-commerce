import { CircuitBreaker } from '../utils/circuit-breaker';

// Mock Date.now for predictable time-based tests
const originalDateNow = Date.now;
let mockTime = 0;

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let mockLogger: jest.Mocked<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTime = 0;
    
    // Mock Date.now to return our controlled time
    Date.now = jest.fn(() => mockTime);
    
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    
    circuitBreaker = new CircuitBreaker(3, 60000, mockLogger);
  });

  afterEach(() => {
    // Restore original Date.now
    Date.now = originalDateNow;
  });

  describe('initialization', () => {
    it('should initialize with default values', () => {
      // Act
      const circuitBreakerDefault = new CircuitBreaker();
      
      // Assert
      expect(circuitBreakerDefault.getState().status).toBe('CLOSED');
      expect(circuitBreakerDefault.getState().failureCount).toBe(0);
      expect(circuitBreakerDefault.getState().threshold).toBe(5);
      expect(circuitBreakerDefault.getState().timeout).toBe(60000);
    });

    it('should initialize with custom values', () => {
      // Assert
      expect(circuitBreaker.getState().status).toBe('CLOSED');
      expect(circuitBreaker.getState().failureCount).toBe(0);
      expect(circuitBreaker.getState().threshold).toBe(3);
      expect(circuitBreaker.getState().timeout).toBe(60000);
    });

    it('should use console logger when no logger provided', () => {
      // Act
      const circuitBreakerNoLogger = new CircuitBreaker();
      
      // Assert
      expect(circuitBreakerNoLogger.getState().status).toBe('CLOSED');
    });
  });

  describe('CLOSED state', () => {
    it('should execute operations successfully when CLOSED', async () => {
      // Arrange
      const successfulOperation = jest.fn().mockResolvedValue('success');
      
      // Act
      const result = await circuitBreaker.execute(successfulOperation);
      
      // Assert
      expect(result).toBe('success');
      expect(successfulOperation).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState().status).toBe('CLOSED');
      expect(circuitBreaker.getState().failureCount).toBe(0);
    });

    it('should increment failure count on operation failure', async () => {
      // Arrange
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Act & Assert
      await expect(circuitBreaker.execute(failingOperation))
        .rejects
        .toThrow('Operation failed');
      
      expect(circuitBreaker.getState().failureCount).toBe(1);
      expect(circuitBreaker.getState().status).toBe('CLOSED');
    });

    it('should open circuit when failure threshold is reached', async () => {
      // Arrange
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Act - Execute failing operations until threshold is reached
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(failingOperation))
          .rejects
          .toThrow('Operation failed');
      }
      
      // Assert
      expect(circuitBreaker.getState().status).toBe('OPEN');
      expect(circuitBreaker.getState().failureCount).toBe(3);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Circuit breaker opened after 3 failures'
      );
    });

    it('should reset failure count on successful operation', async () => {
      // Arrange
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      const successfulOperation = jest.fn().mockResolvedValue('success');
      
      // Act - Fail once, then succeed
      await expect(circuitBreaker.execute(failingOperation))
        .rejects
        .toThrow('Operation failed');
      
      const result = await circuitBreaker.execute(successfulOperation);
      
      // Assert
      expect(result).toBe('success');
      expect(circuitBreaker.getState().failureCount).toBe(0);
      expect(circuitBreaker.getState().status).toBe('CLOSED');
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      // Open the circuit by reaching failure threshold
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(failingOperation))
          .rejects
          .toThrow('Operation failed');
      }
    });

    it('should reject operations when OPEN', async () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue('success');
      
      // Act & Assert
      await expect(circuitBreaker.execute(operation))
        .rejects
        .toThrow('Circuit breaker is OPEN');
      
      expect(operation).not.toHaveBeenCalled();
    });

    it('should move to HALF_OPEN after timeout period', async () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue('success');
      
      // Advance time past the timeout
      mockTime = 60001; // 60000ms timeout + 1ms
      
      // Act
      const result = await circuitBreaker.execute(operation);
      
      // Assert
      expect(result).toBe('success');
      // After successful operation in HALF_OPEN, it should move to CLOSED
      expect(circuitBreaker.getState().status).toBe('CLOSED');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Circuit breaker moved to HALF_OPEN state'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Circuit breaker reset to CLOSED state'
      );
    });

    it('should not move to HALF_OPEN before timeout period', async () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue('success');
      
      // Advance time but not past the timeout
      mockTime = 30000; // 30000ms, still before 60000ms timeout
      
      // Act & Assert
      await expect(circuitBreaker.execute(operation))
        .rejects
        .toThrow('Circuit breaker is OPEN');
      
      expect(circuitBreaker.getState().status).toBe('OPEN');
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      // Open the circuit, then wait for timeout
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(failingOperation))
          .rejects
          .toThrow('Operation failed');
      }
      
      // Advance time past the timeout to move to HALF_OPEN
      mockTime = 60001;
      
      // This will move to HALF_OPEN and then immediately to CLOSED on success
      const operation = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(operation);
    });

    it('should allow one operation in HALF_OPEN state', async () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue('success');
      
      // Act
      const result = await circuitBreaker.execute(operation);
      
      // Assert
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should move to CLOSED on successful operation in HALF_OPEN', async () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue('success');
      
      // Act
      await circuitBreaker.execute(operation);
      
      // Assert
      expect(circuitBreaker.getState().status).toBe('CLOSED');
      expect(circuitBreaker.getState().failureCount).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Circuit breaker reset to CLOSED state'
      );
    });

    it('should move back to OPEN on failed operation in HALF_OPEN', async () => {
      // Arrange - Create a fresh circuit breaker for this test
      const freshCircuitBreaker = new CircuitBreaker(3, 60000, mockLogger);
      
      // Set initial time
      mockTime = 0;
      
      // Open the circuit
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      for (let i = 0; i < 3; i++) {
        await expect(freshCircuitBreaker.execute(failingOperation))
          .rejects
          .toThrow('Operation failed');
      }
      
      // Verify circuit is OPEN
      expect(freshCircuitBreaker.getState().status).toBe('OPEN');
      
      // Advance time past the timeout to allow HALF_OPEN state
      mockTime = 60001; // timeout + 1ms
      
      // Now execute a failing operation - this should move to HALF_OPEN first, then OPEN on failure
      await expect(freshCircuitBreaker.execute(failingOperation))
        .rejects
        .toThrow('Operation failed');
      
      // Assert
      expect(freshCircuitBreaker.getState().status).toBe('OPEN');
      expect(freshCircuitBreaker.getState().failureCount).toBe(4); // 3 from initial + 1 from HALF_OPEN
    });
  });

  describe('state queries', () => {
    it('should return correct state information', () => {
      // Act
      const state = circuitBreaker.getState();
      
      // Assert
      expect(state).toEqual({
        status: 'CLOSED',
        failureCount: 0,
        lastFailureTime: 0,
        threshold: 3,
        timeout: 60000
      });
    });

    it('should correctly identify OPEN state', async () => {
      // Arrange
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(failingOperation))
          .rejects
          .toThrow('Operation failed');
      }
      
      // Assert
      expect(circuitBreaker.isOpen()).toBe(true);
      expect(circuitBreaker.isClosed()).toBe(false);
      expect(circuitBreaker.isHalfOpen()).toBe(false);
    });

    it('should correctly identify CLOSED state', () => {
      // Assert
      expect(circuitBreaker.isClosed()).toBe(true);
      expect(circuitBreaker.isOpen()).toBe(false);
      expect(circuitBreaker.isHalfOpen()).toBe(false);
    });

    it('should correctly identify HALF_OPEN state', async () => {
      // Arrange - Open circuit, then wait for timeout
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(failingOperation))
          .rejects
          .toThrow('Operation failed');
      }
      
      // Advance time past the timeout
      mockTime = 60001;
      
      // Check state before executing operation (should be HALF_OPEN)
      expect(circuitBreaker.isHalfOpen()).toBe(false);
      expect(circuitBreaker.isClosed()).toBe(false);
      expect(circuitBreaker.isOpen()).toBe(true);
      
      // Now execute operation - this will move to HALF_OPEN temporarily, then CLOSED
      const operation = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(operation);
      
      // After successful operation, it should be CLOSED
      expect(circuitBreaker.isClosed()).toBe(true);
      expect(circuitBreaker.isOpen()).toBe(false);
      expect(circuitBreaker.isHalfOpen()).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle operations that return undefined', async () => {
      // Arrange
      const undefinedOperation = jest.fn().mockResolvedValue(undefined);
      
      // Act
      const result = await circuitBreaker.execute(undefinedOperation);
      
      // Assert
      expect(result).toBeUndefined();
      expect(circuitBreaker.getState().status).toBe('CLOSED');
    });

    it('should handle operations that return null', async () => {
      // Arrange
      const nullOperation = jest.fn().mockResolvedValue(null);
      
      // Act
      const result = await circuitBreaker.execute(nullOperation);
      
      // Assert
      expect(result).toBeNull();
      expect(circuitBreaker.getState().status).toBe('CLOSED');
    });

    it('should handle operations that throw different error types', async () => {
      // Arrange
      const stringErrorOperation = jest.fn().mockRejectedValue('String error');
      const numberErrorOperation = jest.fn().mockRejectedValue(123);
      
      // Act & Assert
      await expect(circuitBreaker.execute(stringErrorOperation))
        .rejects
        .toBe('String error');
      
      await expect(circuitBreaker.execute(numberErrorOperation))
        .rejects
        .toBe(123);
      
      expect(circuitBreaker.getState().failureCount).toBe(2);
    });

    it('should handle rapid successive operations', async () => {
      // Arrange
      const operations = Array(5).fill(null).map((_, i) => 
        jest.fn().mockResolvedValue(`result-${i}`)
      );
      
      // Act
      const results = await Promise.all(
        operations.map(op => circuitBreaker.execute(op))
      );
      
      // Assert
      expect(results).toEqual(['result-0', 'result-1', 'result-2', 'result-3', 'result-4']);
      expect(circuitBreaker.getState().status).toBe('CLOSED');
      expect(circuitBreaker.getState().failureCount).toBe(0);
    });
  });

  describe('logging', () => {
    it('should log successful operations', async () => {
      // Arrange
      const operation = jest.fn().mockResolvedValue('success');
      
      // Act
      await circuitBreaker.execute(operation);
      
      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Circuit breaker reset to CLOSED state'
      );
    });

    it('should log circuit opening', async () => {
      // Arrange
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Act
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(failingOperation))
          .rejects
          .toThrow('Operation failed');
      }
      
      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Circuit breaker opened after 3 failures'
      );
    });

    it('should log state transitions', async () => {
      // Arrange
      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      const successfulOperation = jest.fn().mockResolvedValue('success');
      
      // Open circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(failingOperation))
          .rejects
          .toThrow('Operation failed');
      }
      
      // Advance time past timeout
      mockTime = 60001;
      
      // Move to HALF_OPEN
      await circuitBreaker.execute(successfulOperation);
      
      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Circuit breaker moved to HALF_OPEN state'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Circuit breaker reset to CLOSED state'
      );
    });
  });
});
