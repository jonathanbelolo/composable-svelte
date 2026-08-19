/**
 * Package-level debug logging.
 *
 * `WebGLOverlay` accepts a `debug` option and honours it around most of its own
 * logging, but the utility classes it composes (render loop, texture validator,
 * device capabilities, browser compatibility, context manager) take no options
 * and logged unconditionally — so consumers saw `[WebGLOverlay]` lines on every
 * tab visibility change whether or not they asked for them.
 *
 * Threading a flag through five constructors would be noise; the overlay sets
 * this once instead.
 *
 * @packageDocumentation
 */

let enabled = false;

/**
 * Enable or disable package debug logging.
 *
 * Called by `WebGLOverlay` from its `debug` option.
 */
export function setDebugLogging(value: boolean): void {
	enabled = value;
}

/** Whether debug logging is currently on. */
export function isDebugLogging(): boolean {
	return enabled;
}

/**
 * Log a diagnostic message, but only when debug logging is enabled.
 *
 * @example
 * ```typescript
 * debugLog('[WebGLOverlay] Tab hidden - pausing rendering');
 * ```
 */
export function debugLog(...args: unknown[]): void {
	if (enabled) console.info(...args);
}
