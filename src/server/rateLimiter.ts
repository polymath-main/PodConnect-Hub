import type { Request, Response, NextFunction } from 'express';
import { eventLogger } from './eventLogger.js';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  category?: 'auth' | 'scrape' | 'general';
  keyGenerator?: (req: Request) => string;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

/**
 * High-performance, zero-dependency in-memory sliding-window rate limiter
 */
export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = 'Too many requests, please try again later.',
    category = 'general',
    keyGenerator = (req: Request) => {
      const forwarded = req.headers['x-forwarded-for'];
      const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';
      return `${category}:${ip}`;
    },
  } = options;

  const storage = new Map<string, RateLimitRecord>();

  // Periodic cleanup of stale window entries every 2 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of storage.entries()) {
      if (now > record.resetTime) {
        storage.delete(key);
      }
    }
  }, 120000);

  // Unref timer so it doesn't prevent graceful process exit
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let record = storage.get(key);
    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      storage.set(key, record);
    } else {
      record.count++;
    }

    const remaining = Math.max(0, max - record.count);
    const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      res.setHeader('Retry-After', retryAfterSec);
      eventLogger.logWarn('auth', `Rate limit triggered: ${key}`, {
        metadata: {
          category,
          key,
          count: record.count,
          max,
          retryAfter: retryAfterSec,
        },
      });

      return res.status(429).json({
        success: false,
        error: message,
        retryAfter: retryAfterSec,
      });
    }

    next();
  };
}

// 20 attempts per minute per IP for sensitive auth flows
export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  category: 'auth',
  message: 'Too many authentication attempts. Please slow down and try again in a minute.',
});

// 15 scrape job starts per 10 minutes per tenant/IP
export const scrapeRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 15,
  category: 'scrape',
  keyGenerator: (req: any) => {
    const tenantId = req.tenantId || req.body?.tenantId || 'anonymous';
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress) || 'unknown';
    return `scrape:${tenantId}:${ip}`;
  },
  message: 'Scraping job limit reached for this window. Please wait a few minutes before starting new search jobs.',
});
