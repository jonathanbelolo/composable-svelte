/**
 * Tests for Clock dependency
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSystemClock, createMockClock } from '../../src/dependencies/clock.js';

describe('Clock', () => {
	describe('SystemClock', () => {
		it('should return current timestamp', () => {
			const clock = createSystemClock();
			const before = Date.now();
			const timestamp = clock.now();
			const after = Date.now();

			expect(timestamp).toBeGreaterThanOrEqual(before);
			expect(timestamp).toBeLessThanOrEqual(after);
		});

		it('should return current Date object', () => {
			const clock = createSystemClock();
			const before = Date.now();
			const date = clock.date();
			const after = Date.now();

			expect(date).toBeInstanceOf(Date);
			expect(date.getTime()).toBeGreaterThanOrEqual(before);
			expect(date.getTime()).toBeLessThanOrEqual(after);
		});

		it('should convert timestamp to ISO string', () => {
			const clock = createSystemClock();
			const timestamp = 1704067200000; // Jan 1, 2024 00:00:00 UTC

			const iso = clock.toISO(timestamp);

			expect(iso).toBe('2024-01-01T00:00:00.000Z');
		});

		it('should convert current time to ISO when no timestamp provided', () => {
			const clock = createSystemClock();
			const iso = clock.toISO();

			// Should be valid ISO string
			expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
		});

		it('should parse valid ISO string', () => {
			const clock = createSystemClock();
			const iso = '2024-01-01T00:00:00.000Z';

			const timestamp = clock.fromISO(iso);

			expect(timestamp).toBe(1704067200000);
		});

		it('should return null for invalid ISO string', () => {
			const clock = createSystemClock();

			expect(clock.fromISO('invalid')).toBeNull();
			expect(clock.fromISO('')).toBeNull();
			expect(clock.fromISO('not-a-date')).toBeNull();
		});

		it('should format timestamp with default locale', () => {
			const clock = createSystemClock();
			const timestamp = 1704067200000; // Jan 1, 2024

			const formatted = clock.format(timestamp);

			// Default en-US format
			expect(formatted).toContain('1/1/2024');
		});

		it('should format timestamp with custom locale', () => {
			const clock = createSystemClock();
			const timestamp = 1704067200000; // Jan 1, 2024

			const formatted = clock.format(timestamp, 'en-GB');

			// UK format: DD/MM/YYYY
			expect(formatted).toContain('01/01/2024');
		});

		it('should format timestamp with custom options', () => {
			const clock = createSystemClock();
			const timestamp = 1704067200000; // Jan 1, 2024

			const formatted = clock.format(timestamp, 'en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});

			expect(formatted).toBe('January 1, 2024');
		});

		it('should format current time when no timestamp provided', () => {
			const clock = createSystemClock();

			const formatted = clock.format();

			// Should be non-empty string
			expect(formatted).toBeTruthy();
			expect(typeof formatted).toBe('string');
		});
	});

	describe('MockClock', () => {
		it('should start at initial time', () => {
			const clock = createMockClock(1000);

			expect(clock.now()).toBe(1000);
		});

		it('should start at zero when no initial time provided', () => {
			const clock = createMockClock();

			expect(clock.now()).toBe(0);
		});

		it('should return consistent timestamp', () => {
			const clock = createMockClock(5000);

			expect(clock.now()).toBe(5000);
			expect(clock.now()).toBe(5000);
			expect(clock.now()).toBe(5000);
		});

		it('should advance time by milliseconds', () => {
			const clock = createMockClock(1000);

			clock.advance(500);
			expect(clock.now()).toBe(1500);

			clock.advance(1000);
			expect(clock.now()).toBe(2500);
		});

		it('should advance time backwards with negative value', () => {
			const clock = createMockClock(1000);

			clock.advance(-500);
			expect(clock.now()).toBe(500);
		});

		it('should set absolute time', () => {
			const clock = createMockClock(1000);

			clock.setTime(5000);
			expect(clock.now()).toBe(5000);

			clock.setTime(0);
			expect(clock.now()).toBe(0);
		});

		it('should return Date at current mock time', () => {
			const clock = createMockClock(1704067200000); // Jan 1, 2024

			const date = clock.date();

			expect(date).toBeInstanceOf(Date);
			expect(date.getTime()).toBe(1704067200000);
			expect(date.toISOString()).toBe('2024-01-01T00:00:00.000Z');
		});

		it('should convert timestamp to ISO string', () => {
			const clock = createMockClock(0);

			const iso = clock.toISO(1704067200000);

			expect(iso).toBe('2024-01-01T00:00:00.000Z');
		});

		it('should convert current mock time to ISO when no timestamp', () => {
			const clock = createMockClock(1704067200000);

			const iso = clock.toISO();

			expect(iso).toBe('2024-01-01T00:00:00.000Z');
		});

		it('should parse ISO string', () => {
			const clock = createMockClock(0);

			const timestamp = clock.fromISO('2024-01-01T00:00:00.000Z');

			expect(timestamp).toBe(1704067200000);
		});

		it('should return null for invalid ISO string', () => {
			const clock = createMockClock(0);

			expect(clock.fromISO('invalid')).toBeNull();
		});

		it('should format timestamp', () => {
			const clock = createMockClock(0);

			const formatted = clock.format(1704067200000, 'en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});

			expect(formatted).toBe('January 1, 2024');
		});

		it('should format current mock time when no timestamp', () => {
			const clock = createMockClock(1704067200000);

			const formatted = clock.format(undefined, 'en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});

			expect(formatted).toBe('January 1, 2024');
		});
	});

	describe('Integration', () => {
		it('should allow deterministic time in tests', () => {
			const clock = createMockClock(0);

			// Simulate time-based logic
			const timestamps: number[] = [];

			timestamps.push(clock.now());
			clock.advance(1000);
			timestamps.push(clock.now());
			clock.advance(1000);
			timestamps.push(clock.now());

			expect(timestamps).toEqual([0, 1000, 2000]);
		});

		it('should support ISO round-trip', () => {
			const clock = createMockClock(0);
			const original = 1704067200000;

			const iso = clock.toISO(original);
			const parsed = clock.fromISO(iso);

			expect(parsed).toBe(original);
		});

		it('should handle different date formats', () => {
			const clock = createMockClock(1704067200000);

			const us = clock.format(undefined, 'en-US', { dateStyle: 'short' });
			const uk = clock.format(undefined, 'en-GB', { dateStyle: 'short' });
			const iso = clock.toISO();

			expect(us).toContain('1/1/24');
			expect(uk).toContain('01/01/2024');
			expect(iso).toBe('2024-01-01T00:00:00.000Z');
		});
	});
});
