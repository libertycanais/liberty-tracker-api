import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  CircuitState,
} from './circuit-breaker';

describe('CircuitBreaker', () => {
  it('starts closed and stays closed on success', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 1000,
    });
    const result = await breaker.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('opens after reaching the failure threshold', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 1000,
    });
    const failing = () => Promise.reject(new Error('boom'));

    await expect(breaker.execute(failing)).rejects.toThrow('boom');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    await expect(breaker.execute(failing)).rejects.toThrow('boom');
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('rejects immediately with CircuitBreakerOpenError while open, without calling fn', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 10_000,
    });
    const fn = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(breaker.execute(fn)).rejects.toThrow('boom');
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    await expect(breaker.execute(fn)).rejects.toBeInstanceOf(
      CircuitBreakerOpenError,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('transitions to half-open after resetTimeoutMs and closes again on success', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 20,
    });
    await expect(
      breaker.execute(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow();
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

    const result = await breaker.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });
});
