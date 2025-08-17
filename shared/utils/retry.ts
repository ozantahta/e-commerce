import { RetryConfig } from '../types';

export class RetryHandler {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxAttempts: 3,
      backoffMs: 1000,
      maxBackoffMs: 10000,
      jitter: true,
      ...config
    };
  }

  async execute<T>(
    operation: () => Promise<T>,
    context?: string
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === this.config.maxAttempts) {
          throw new Error(`Operation failed after ${attempt} attempts: ${lastError.message}`);
        }
        
        const delay = this.calculateDelay(attempt);
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }

  private calculateDelay(attempt: number): number {
    const baseDelay = this.config.backoffMs * Math.pow(2, attempt - 1);
    const jitteredDelay = this.config.jitter 
      ? baseDelay * (0.5 + Math.random() * 0.5)
      : baseDelay;
    
    return Math.min(jitteredDelay, this.config.maxBackoffMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const createRetryHandler = (config: Partial<RetryConfig> = {}): RetryHandler => {
  return new RetryHandler(config);
};
