export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  /** Consecutive failures required to trip the circuit open. */
  failureThreshold: number;
  /** How long the circuit stays open before allowing a trial call. */
  resetTimeoutMs: number;
}

export class CircuitBreakerOpenError extends Error {
  constructor(message = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Generic, framework-agnostic circuit breaker. Not wired into any
 * forwarder yet — Meta/Google Ads/GA4 integrations are out of scope for
 * this sprint (see docs/ROADMAP.md). Prepared for the next sprint to wrap
 * `send()` calls with `execute()`, the same "prepared but not connected"
 * pattern already used for RolesGuard.
 */
export class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

  constructor(private readonly options: CircuitBreakerOptions) {}

  getState(): CircuitState {
    this.maybeTransitionToHalfOpen();
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeTransitionToHalfOpen();

    if (this.state === CircuitState.OPEN) {
      throw new CircuitBreakerOpenError();
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private maybeTransitionToHalfOpen(): void {
    if (
      this.state === CircuitState.OPEN &&
      this.openedAt !== null &&
      Date.now() - this.openedAt >= this.options.resetTimeoutMs
    ) {
      this.state = CircuitState.HALF_OPEN;
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = CircuitState.CLOSED;
    this.openedAt = null;
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.openedAt = Date.now();
    }
  }
}
