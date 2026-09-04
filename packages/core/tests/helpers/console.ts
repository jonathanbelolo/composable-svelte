/**
 * The console guard's shared state.
 *
 * `tests/setup.ts` installs the guard before every test and checks it after;
 * tests declare the console output they expect with `expectConsole`. Anything
 * the test did not declare fails it, with the captured messages in the error.
 *
 * Why this exists: the store, the effect runtime and several modules report
 * failures through `console.error` and `console.warn` rather than by throwing
 * — a swallowed effect error, a subscription cleanup that rejected, an ICU
 * message that would not compile. A suite that ignores console output passes
 * while the code under test is failing, which is exactly what the 3 September
 * 2026 audit found. `plans/hardening/AUDIT-2026-09-03-FINDINGS.md`, T2.
 *
 * Why plain wrapper functions and not `vi.spyOn`: five suites call
 * `vi.restoreAllMocks()` or `vi.clearAllMocks()` in their own `afterEach`
 * (`store.test.ts`, `tooltip.test.ts`, `combobox.test.ts`,
 * `websocket/heartbeat.test.ts`, `ssr/ssg.test.ts`), which restores or wipes
 * every spy before the guard's `afterEach` runs. A spy-based guard would
 * report zero in precisely those files. Wrapper functions are invisible to the
 * mock registry.
 *
 * Why a module-level slot: `isolate` is on in both vitest configs, so this
 * module is instantiated once per test file, and the setup file and the test
 * share that instance. No `expect.getState()`, no fixtures.
 *
 * What it cannot see: a call made after the test's `afterEach` has put the
 * original console back. A log fired from a timer after the test returns
 * lands on whichever test is running by then, and is lost if none is. Await
 * the work that logs, or the guard is reporting a neighbour's output.
 */

export type Level = 'error' | 'warn';

/** The arguments of one console call. */
export type Call = readonly unknown[];

/** `'any'` accepts one or more calls; a number requires exactly that many. */
export type Expectation = number | 'any' | null;

export interface Slot {
	calls: Record<Level, Call[]>;
	/** `null` means the test declared nothing, so any call is a violation. */
	expected: Record<Level, Expectation>;
}

const LEVELS: readonly Level[] = ['error', 'warn'];

function emptySlot(): Slot {
	return {
		calls: { error: [], warn: [] },
		expected: { error: null, warn: null }
	};
}

export const slot: Slot = emptySlot();

let originals: Record<Level, ((...args: unknown[]) => void) | null> = { error: null, warn: null };

/** Replace `console.error` and `console.warn` with recording wrappers. Idempotent. */
export function install(): void {
	for (const level of LEVELS) {
		if (originals[level]) continue;
		const original = console[level] as (...args: unknown[]) => void;
		originals[level] = original;
		console[level] = (...args: unknown[]) => {
			slot.calls[level].push(args);
			original.apply(console, args);
		};
	}
}

/** Put the original console methods back. Idempotent. */
export function restore(): void {
	for (const level of LEVELS) {
		const original = originals[level];
		if (!original) continue;
		console[level] = original as typeof console.error;
		originals[level] = null;
	}
}

/** Forget this test's calls and expectations. */
export function reset(): void {
	const fresh = emptySlot();
	slot.calls = fresh.calls;
	slot.expected = fresh.expected;
}

/**
 * Declare that the current test expects console output at `level`.
 *
 * Exactly one call by default, so a path that starts logging twice is a
 * change the guard reports. Pass a number for a different exact count, or
 * `'any'` — one or more — only where the count depends on timing the test
 * does not control, and say why beside the call. Returns the live array of
 * recorded calls so a test can assert on the message text:
 * `expect(calls[0]?.[0]).toContain('…')`.
 */
export function expectConsole(level: Level, count: number | 'any' = 1): Call[] {
	slot.expected[level] = count;
	return slot.calls[level];
}

/** Render one call the way the terminal would, truncated. */
function describe(call: Call): string {
	const text = call
		.map((part) => (typeof part === 'string' ? part : safeString(part)))
		.join(' ');
	return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

function safeString(value: unknown): string {
	if (value instanceof Error) return `${value.name}: ${value.message}`;
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

/**
 * The violations in a slot, as human-readable lines. Pure, so the setup file
 * and its own test drive the same function.
 */
export function violations(state: Slot): string[] {
	const out: string[] = [];
	for (const level of LEVELS) {
		const calls = state.calls[level];
		const expected = state.expected[level];
		if (expected === null) {
			if (calls.length > 0) {
				out.push(`console.${level} was called ${calls.length}× but the test declared no expectation (expectConsole('${level}')):`);
				calls.forEach((call) => out.push(`    ${describe(call)}`));
			}
		} else if (expected === 'any') {
			if (calls.length === 0) {
				out.push(`expectConsole('${level}') was declared but console.${level} was never called`);
			}
		} else if (calls.length !== expected) {
			out.push(`expectConsole('${level}', ${expected}) but console.${level} was called ${calls.length}×:`);
			calls.forEach((call) => out.push(`    ${describe(call)}`));
		}
	}
	return out;
}
