/**
 * Rate limiting utilities for SSR applications.
 *
 * Protects against DoS attacks and abuse.
 */

import { installsOnParent } from './plugin.js';

export interface RateLimitConfig {
  /** Maximum requests per window. A positive finite number, or the limiter throws. */
  max: number;

  /** Time window in milliseconds. A positive finite number, or the limiter throws. */
  windowMs: number;

  /**
   * Which requests share a bucket. Default: `req.ip`.
   *
   * Behind a proxy or load balancer `req.ip` is the proxy's address — one
   * bucket for the whole site — unless Fastify is created with `trustProxy`,
   * which also makes it read `X-Forwarded-For`. A key taken from a header is
   * chosen by the client: an attacker can spend a fresh bucket per request,
   * so `maxKeys` bounds what that costs.
   */
  keyGenerator?: ((request: any) => string) | undefined;

  /**
   * Keys held before the oldest is dropped.
   * @default 10000
   */
  maxKeys?: number | undefined;

  /** Custom error message */
  message?: string | undefined;

  /** HTTP status code for rate limit exceeded */
  statusCode?: number | undefined;
}

/**
 * `max` and `windowMs` are what `check()` divides and compares by; a missing
 * or non-numeric value made every request a 500 with no message at
 * registration (`app.register(fastifyRateLimit)` with no options —
 * AUDIT-2026-09-03-FINDINGS SS3). A wrong value throws here, naming it.
 */
function positiveFinite(name: 'max' | 'windowMs', value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(
      `RateLimitConfig.${name} must be a positive finite number, got ${String(value)}`
    );
  }
  return value;
}

/**
 * In-memory rate limiter (use Redis in production for distributed systems).
 */
export class RateLimiter {
  private requests = new Map<string, { count: number; resetTime: number }>();
  private cleanupInterval: NodeJS.Timeout | undefined;
  private readonly maxKeys: number;

  constructor(private config: RateLimitConfig) {
    positiveFinite('max', config?.max);
    positiveFinite('windowMs', config?.windowMs);
    this.maxKeys = config.maxKeys ?? 10_000;
    // Clean up expired entries every minute. Unref'd: a limiter must not keep
    // the process alive by itself, and `app.close()` hung on it
    // (AUDIT-2026-09-03-FINDINGS SS8).
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    this.cleanupInterval.unref?.();
  }

  /** Keys currently held. */
  get size(): number {
    return this.requests.size;
  }

  /**
   * Check if request is within rate limit.
   * @returns { allowed: boolean, remaining: number, resetTime: number }
   */
  check(key: string): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
  } {
    const now = Date.now();
    const record = this.requests.get(key);

    // No record or expired - allow and create new
    if (!record || now > record.resetTime) {
      const resetTime = now + this.config.windowMs;
      if (!record) this.makeRoom();
      this.requests.set(key, { count: 1, resetTime });
      return {
        allowed: true,
        remaining: this.config.max - 1,
        resetTime
      };
    }

    // Within window - check limit
    if (record.count < this.config.max) {
      record.count++;
      return {
        allowed: true,
        remaining: this.config.max - record.count,
        resetTime: record.resetTime
      };
    }

    // Rate limit exceeded
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime,
      retryAfter: Math.ceil((record.resetTime - now) / 1000)
    };
  }

  /**
   * Before a new key: drop expired entries, then the oldest, until there is
   * room. Unbounded, a client that chose its own key (a spoofed
   * `X-Forwarded-For`) grew the map without limit (SS4).
   */
  private makeRoom() {
    if (this.requests.size < this.maxKeys) return;
    this.cleanup();
    while (this.requests.size >= this.maxKeys) {
      const oldest = this.requests.keys().next().value;
      if (oldest === undefined) break;
      this.requests.delete(oldest);
    }
  }

  /**
   * Clean up expired entries.
   */
  private cleanup() {
    const now = Date.now();
    for (const [key, record] of this.requests.entries()) {
      if (now > record.resetTime) {
        this.requests.delete(key);
      }
    }
  }

  /**
   * Destroy the rate limiter and clean up resources.
   * Call this when shutting down the server.
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.requests.clear();
  }
}

/**
 * Fastify plugin for rate limiting.
 *
 * `app.register(fastifyRateLimit, config)` installs the limiter on the
 * registering instance's routes (the plugin carries Fastify's skip-override
 * marker); `fastifyRateLimit(app, config)` does the same directly — the hooks
 * are added before the returned promise settles. A bad `max` or `windowMs`
 * rejects the promise, so `app.ready()` reports it.
 */
export const fastifyRateLimit = installsOnParent(async function fastifyRateLimit(
  fastify: any,
  config: RateLimitConfig
): Promise<void> {
  const limiter = new RateLimiter(config);
  const keyGen = config.keyGenerator || ((req: any) => req.ip);

  // The limiter's interval goes with the server.
  fastify.addHook('onClose', async () => {
    limiter.destroy();
  });

  fastify.addHook('onRequest', async (request: any, reply: any) => {
    const key = keyGen(request);
    const result = limiter.check(key);

    // Add rate limit headers
    reply.header('X-RateLimit-Limit', config.max);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

    if (!result.allowed) {
      reply.header('Retry-After', result.retryAfter!);
      reply.status(config.statusCode || 429).send({
        error: 'Too Many Requests',
        message: config.message || 'Rate limit exceeded. Please try again later.',
        retryAfter: result.retryAfter
      });
    }
  });
});
