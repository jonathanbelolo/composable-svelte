/**
 * Per-overlay debug logging.
 *
 * This used to be a module-level `let enabled = false` that `WebGLOverlay` set
 * from its `debug` option, on the argument that "threading a flag through five
 * constructors would be noise". The convenience cost three defects:
 *
 * - two overlays on one page fought over it, the second constructed winning for
 *   both, so `<WebGLOverlay options={{debug:true}} />` beside a plain one
 *   silently turned its own logging off;
 * - `destroy()` never reset it, so one `debug: true` overlay left package-wide
 *   logging on for the life of the page after it unmounted;
 * - and the flag was set *after* `BrowserCompatibility` and `DeviceCapabilities`
 *   had been constructed, both of which log from their constructors — so the
 *   browser and device lines, which are precisely what `debug: true` is for,
 *   never printed on the first overlay.
 *
 * A logger passed to the classes that need one has none of those properties,
 * and leaves no mutable module state for tests to leak through.
 *
 * @packageDocumentation
 */

/** Logs a diagnostic message, or discards it. */
export type DebugLog = (...args: unknown[]) => void;

/** The default for every utility: log nothing. */
export const noDebug: DebugLog = () => {};

/**
 * A logger for one overlay.
 *
 * @example
 * ```typescript
 * const log = createLogger(options.debug ?? false);
 * const loop = new RenderLoop(targetFPS, log);
 * ```
 */
export function createLogger(enabled: boolean): DebugLog {
	return enabled ? (...args: unknown[]) => console.info(...args) : noDebug;
}
