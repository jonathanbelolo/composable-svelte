/**
 * Clock dependency for controllable time operations.
 *
 * Provides injectable clock for reducers to access current time,
 * enabling deterministic testing with fake time.
 *
 * @module
 */

/**
 * Clock dependency interface.
 * Provides time-related operations with support for test mocking.
 */
export interface Clock {
	/**
	 * Get current timestamp in milliseconds since epoch.
	 *
	 * @returns Current time as number (milliseconds)
	 *
	 * @example
	 * ```typescript
	 * const timestamp = deps.clock.now();
	 * console.log(timestamp); // 1704067200000
	 * ```
	 */
	now(): number;

	/**
	 * Get current Date object.
	 * Useful for date arithmetic and formatting.
	 *
	 * @returns Current Date instance
	 *
	 * @example
	 * ```typescript
	 * const date = deps.clock.date();
	 * console.log(date.toISOString()); // "2024-01-01T00:00:00.000Z"
	 * ```
	 */
	date(): Date;

	/**
	 * Convert timestamp to ISO 8601 string.
	 *
	 * @param timestamp - Timestamp in milliseconds (defaults to now)
	 * @returns ISO string (YYYY-MM-DDTHH:mm:ss.sssZ)
	 *
	 * @example
	 * ```typescript
	 * const iso = deps.clock.toISO(1704067200000);
	 * // "2024-01-01T00:00:00.000Z"
	 * ```
	 */
	toISO(timestamp?: number): string;

	/**
	 * Parse ISO 8601 string to timestamp.
	 *
	 * @param iso - ISO string to parse
	 * @returns Timestamp in milliseconds, or null if invalid
	 *
	 * @example
	 * ```typescript
	 * const timestamp = deps.clock.fromISO("2024-01-01T00:00:00.000Z");
	 * console.log(timestamp); // 1704067200000
	 * ```
	 */
	fromISO(iso: string): number | null;

	/**
	 * Format date using Intl.DateTimeFormat.
	 *
	 * @param timestamp - Timestamp to format (defaults to now)
	 * @param locale - Locale string (defaults to 'en-US')
	 * @param options - Intl.DateTimeFormat options
	 * @returns Formatted date string
	 *
	 * @example
	 * ```typescript
	 * const formatted = deps.clock.format(1704067200000, 'en-US', {
	 *   year: 'numeric',
	 *   month: 'long',
	 *   day: 'numeric'
	 * });
	 * // "January 1, 2024"
	 * ```
	 */
	format(
		timestamp?: number,
		locale?: string,
		options?: Intl.DateTimeFormatOptions
	): string;
}

/**
 * Create system clock using native Date API.
 * This is the default clock for production use.
 *
 * @returns Clock instance using Date.now()
 *
 * @example
 * ```typescript
 * const clock = createSystemClock();
 * const timestamp = clock.now(); // Uses Date.now()
 * ```
 */
export function createSystemClock(): Clock {
	return {
		now(): number {
			return Date.now();
		},

		date(): Date {
			return new Date();
		},

		toISO(timestamp?: number): string {
			const ts = timestamp ?? Date.now();
			return new Date(ts).toISOString();
		},

		fromISO(iso: string): number | null {
			const timestamp = Date.parse(iso);
			return isNaN(timestamp) ? null : timestamp;
		},

		format(
			timestamp?: number,
			locale: string = 'en-US',
			options?: Intl.DateTimeFormatOptions
		): string {
			const ts = timestamp ?? Date.now();
			return new Intl.DateTimeFormat(locale, options).format(new Date(ts));
		}
	};
}

/**
 * Create mock clock for testing.
 * Allows manual control of time progression.
 *
 * @param initialTime - Starting timestamp (defaults to 0)
 * @returns Mock clock with advance() method
 *
 * @example
 * ```typescript
 * const clock = createMockClock(1704067200000); // Jan 1, 2024
 *
 * // Time stays constant
 * console.log(clock.now()); // 1704067200000
 * console.log(clock.now()); // 1704067200000
 *
 * // Manually advance time
 * clock.advance(1000); // +1 second
 * console.log(clock.now()); // 1704067201000
 * ```
 */
export function createMockClock(initialTime: number = 0): MockClock {
	let currentTime = initialTime;

	return {
		now(): number {
			return currentTime;
		},

		date(): Date {
			return new Date(currentTime);
		},

		toISO(timestamp?: number): string {
			const ts = timestamp ?? currentTime;
			return new Date(ts).toISOString();
		},

		fromISO(iso: string): number | null {
			const timestamp = Date.parse(iso);
			return isNaN(timestamp) ? null : timestamp;
		},

		format(
			timestamp?: number,
			locale: string = 'en-US',
			options?: Intl.DateTimeFormatOptions
		): string {
			const ts = timestamp ?? currentTime;
			return new Intl.DateTimeFormat(locale, options).format(new Date(ts));
		},

		advance(ms: number): void {
			currentTime += ms;
		},

		setTime(timestamp: number): void {
			currentTime = timestamp;
		}
	};
}

/**
 * Mock clock with manual time control.
 * Extends Clock interface with testing methods.
 */
export interface MockClock extends Clock {
	/**
	 * Advance time by specified milliseconds.
	 *
	 * @param ms - Milliseconds to advance
	 *
	 * @example
	 * ```typescript
	 * const clock = createMockClock(0);
	 * clock.advance(1000); // +1 second
	 * console.log(clock.now()); // 1000
	 * ```
	 */
	advance(ms: number): void;

	/**
	 * Set time to specific timestamp.
	 *
	 * @param timestamp - Timestamp in milliseconds
	 *
	 * @example
	 * ```typescript
	 * const clock = createMockClock(0);
	 * clock.setTime(1704067200000); // Jan 1, 2024
	 * console.log(clock.now()); // 1704067200000
	 * ```
	 */
	setTime(timestamp: number): void;
}
