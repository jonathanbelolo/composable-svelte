// ============================================================================
// Retry-After Header Parsing Regressions (B001-02)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseRetryAfter } from '../../src/lib/api/retry.js';

describe('parseRetryAfter regressions (B001-02)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Nonnegative integer delay-seconds', () => {
    it('parses valid integer delay seconds', () => {
      expect(parseRetryAfter({ 'retry-after': '120' })).toBe(120000);
      expect(parseRetryAfter({ 'retry-after': '0' })).toBe(0);
      expect(parseRetryAfter({ 'retry-after': '60' })).toBe(60000);
      expect(parseRetryAfter({ 'Retry-After': '300' })).toBe(300000);
    });

    it('handles surrounding whitespace for integer delay seconds', () => {
      expect(parseRetryAfter({ 'retry-after': '  45  ' })).toBe(45000);
    });
  });

  describe('Rejection of malformed numeric values (B001-02 parseInt repair)', () => {
    it('rejects numbers with alphanumeric suffixes (does not parseInt prefix)', () => {
      expect(parseRetryAfter({ 'retry-after': '120s' })).toBeNull();
      expect(parseRetryAfter({ 'retry-after': '120sec' })).toBeNull();
      expect(parseRetryAfter({ 'retry-after': '120seconds' })).toBeNull();
      expect(parseRetryAfter({ 'retry-after': '120 ms' })).toBeNull();
      expect(parseRetryAfter({ 'retry-after': '120px' })).toBeNull();
      expect(parseRetryAfter({ 'retry-after': '120-foo' })).toBeNull();
      expect(parseRetryAfter({ 'retry-after': '120abc' })).toBeNull();
    });

    it('rejects negative numbers (does not parseInt negative prefix)', () => {
      expect(parseRetryAfter({ 'retry-after': '-10' })).toBeNull();
      expect(parseRetryAfter({ 'retry-after': '-1' })).toBeNull();
      expect(parseRetryAfter({ 'retry-after': '-0' })).toBeNull();
    });

    it('rejects floating point numbers', () => {
      expect(parseRetryAfter({ 'retry-after': '10.5' })).toBeNull();
      expect(parseRetryAfter({ 'retry-after': '0.5' })).toBeNull();
    });

    it('rejects non-finite and special numeric values', () => {
      expect(parseRetryAfter({ 'retry-after': 'Infinity' })).toBeNull();
      expect(parseRetryAfter({ 'retry-after': '-Infinity' })).toBeNull();
      expect(parseRetryAfter({ 'retry-after': 'NaN' })).toBeNull();
    });
  });

  describe('Date parsing with deterministic clock', () => {
    it('correctly parses ISO 8601 date string without year-prefix parseInt truncation', () => {
      expect(parseRetryAfter({ 'retry-after': '2026-09-18T12:01:00.000Z' })).toBe(60000);
      expect(parseRetryAfter({ 'retry-after': '2026-09-18T12:00:30Z' })).toBe(30000);
    });

    it('correctly parses RFC 1123 HTTP-date string in the future', () => {
      expect(parseRetryAfter({ 'retry-after': 'Fri, 18 Sep 2026 12:02:00 GMT' })).toBe(120000);
    });

    it('preserves null for past dates', () => {
      expect(parseRetryAfter({ 'retry-after': '2026-09-18T11:59:00.000Z' })).toBeNull();
      expect(parseRetryAfter({ 'retry-after': 'Thu, 01 Jan 1970 00:00:00 GMT' })).toBeNull();
    });

    it('preserves null when date is exactly current time (zero delay)', () => {
      expect(parseRetryAfter({ 'retry-after': '2026-09-18T12:00:00.000Z' })).toBeNull();
    });

    it('returns null on invalid date strings without permissive fallback', () => {
      expect(parseRetryAfter({ 'retry-after': 'invalid-date' })).toBeNull();
      expect(parseRetryAfter({ 'retry-after': 'not-a-date' })).toBeNull();
      expect(parseRetryAfter({ 'retry-after': '2026-99-99' })).toBeNull();
    });
  });
});
