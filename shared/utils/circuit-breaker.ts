import { CircuitBreakerState } from '../types';

export class CircuitBreaker {
  private state: CircuitBreakerState;
  private readonly logger: any;

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly timeoutMs: number = 60000,
    logger?: any
  ) {
    this.state = {
      status: 'CLOSED',
      failureCount: 0,
      lastFailureTime: 0,
      threshold: failureThreshold,
      timeout: timeoutMs
    };
    this.logger = logger || console;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state.status === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state.status = 'HALF_OPEN';
        this.logger.info('Circuit breaker moved to HALF_OPEN state');
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.state.failureCount = 0;
    this.state.status = 'CLOSED';
    this.logger.info('Circuit breaker reset to CLOSED state');
  }

  private onFailure(): void {
    this.state.failureCount++;
    this.state.lastFailureTime = Date.now();

    if (this.state.failureCount >= this.state.threshold) {
      this.state.status = 'OPEN';
      this.logger.warn(`Circuit breaker opened after ${this.state.failureCount} failures`);
    }
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.state.lastFailureTime >= this.state.timeout;
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  isOpen(): boolean {
    return this.state.status === 'OPEN';
  }

  isHalfOpen(): boolean {
    return this.state.status === 'HALF_OPEN';
  }

  isClosed(): boolean {
    return this.state.status === 'CLOSED';
  }
}
