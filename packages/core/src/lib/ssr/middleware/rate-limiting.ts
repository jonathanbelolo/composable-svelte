/**
 * Rate limiting utilities for SSR applications.
 *
 * Protects against DoS attacks and abuse.
 */

export interface RateLimitConfig {
  /** Maximum requests per window */
  max: number;

  /** Time window in milliseconds */
  windowMs: number;

  /** Key generator function (default: IP address) */
  keyGenerator?: (request: any) => string;

  /** Custom error message */
  message?: string;

  /** HTTP status code for rate limit exceeded */
  statusCode?: number;
}

/**
 * In-memory rate limiter (use Redis in production for distributed systems).
 */
export class RateLimiter {
  private requests = new Map<string, { count: number; resetTime: number }>();
  private cleanupInterval: NodeJS.Timeout | undefined;

  constructor(private config: RateLimitConfig) {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
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
 */
export function fastifyRateLimit(
  fastify: any,
  config: RateLimitConfig
) {
  const limiter = new RateLimiter(config);
  const keyGen = config.keyGenerator || ((req: any) => req.ip);

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
}
