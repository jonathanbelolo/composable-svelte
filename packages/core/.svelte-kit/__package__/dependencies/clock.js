/**
 * Clock dependency for controllable time operations.
 *
 * Provides injectable clock for reducers to access current time,
 * enabling deterministic testing with fake time.
 *
 * @module
 */
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
export function createSystemClock() {
    return {
        now() {
            return Date.now();
        },
        date() {
            return new Date();
        },
        toISO(timestamp) {
            const ts = timestamp ?? Date.now();
            return new Date(ts).toISOString();
        },
        fromISO(iso) {
            const timestamp = Date.parse(iso);
            return isNaN(timestamp) ? null : timestamp;
        },
        format(timestamp, locale = 'en-US', options) {
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
export function createMockClock(initialTime = 0) {
    let currentTime = initialTime;
    return {
        now() {
            return currentTime;
        },
        date() {
            return new Date(currentTime);
        },
        toISO(timestamp) {
            const ts = timestamp ?? currentTime;
            return new Date(ts).toISOString();
        },
        fromISO(iso) {
            const timestamp = Date.parse(iso);
            return isNaN(timestamp) ? null : timestamp;
        },
        format(timestamp, locale = 'en-US', options) {
            const ts = timestamp ?? currentTime;
            return new Intl.DateTimeFormat(locale, options).format(new Date(ts));
        },
        advance(ms) {
            currentTime += ms;
        },
        setTime(timestamp) {
            currentTime = timestamp;
        }
    };
}
