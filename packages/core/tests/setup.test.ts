/**
 * The console guard's own positive controls.
 *
 * A guard whose job is to report zero needs a deliberately-wrong input pushed
 * through the same code path (`guides/VERIFICATION-PROTOCOL.md` rule 1).
 * `violations` is pure over a slot, so most of these drive the real function
 * with synthetic slots. The last two go through the live one — the wrapper
 * `tests/setup.ts` installs around every test, including these — and declare
 * what they planted before the guard's own `afterEach` looks.
 */

import { describe, expect, it } from 'vitest';
import { expectConsole, slot, violations, type Slot } from './helpers/console.js';

function slotWith(partial: Partial<Slot>): Slot {
	return {
		calls: { error: [], warn: [], ...partial.calls },
		expected: { error: null, warn: null, ...partial.expected }
	};
}

describe('console guard', () => {
	it('reports an undeclared console.error, naming the message', () => {
		const out = violations(slotWith({ calls: { error: [['planted failure']], warn: [] } }));
		expect(out.length).toBeGreaterThan(0);
		expect(out.join('\n')).toContain('planted failure');
		expect(out.join('\n')).toContain("expectConsole('error')");
	});

	it('reports an undeclared console.warn', () => {
		const out = violations(slotWith({ calls: { error: [], warn: [['careful']] } }));
		expect(out.join('\n')).toContain('careful');
	});

	it('accepts declared output, any count', () => {
		const out = violations(
			slotWith({
				calls: { error: [['a'], ['b']], warn: [] },
				expected: { error: 'any', warn: null }
			})
		);
		expect(out).toEqual([]);
	});

	it('accepts an exact declared count and rejects a different one', () => {
		const one = slotWith({ calls: { error: [['a']], warn: [] }, expected: { error: 1, warn: null } });
		expect(violations(one)).toEqual([]);
		const two = slotWith({ calls: { error: [['a'], ['b']], warn: [] }, expected: { error: 1, warn: null } });
		expect(violations(two).join('\n')).toContain('called 2×');
	});

	it('reports a declaration that nothing fulfilled', () => {
		const out = violations(slotWith({ expected: { error: 'any', warn: null } }));
		expect(out.join('\n')).toContain('never called');
	});

	it('is installed around this very test: an undeclared call is a violation of the live slot', () => {
		// Through the wrapper, not a synthetic slot: the call lands in `slot`,
		// `violations` names it, and only then is it declared so the check in
		// tests/setup.ts lets this test pass. The throw itself lives in that
		// afterEach and cannot be exercised in-process; a planted undeclared
		// call was shown to fail its test, in both configs, in the R0 review.
		console.error('planted live');
		expect(violations(slot).join('\n')).toContain('planted live');
		expect(violations(slot).join('\n')).toContain("expectConsole('error')");
		expectConsole('error');
		expect(violations(slot)).toEqual([]);
	});

	it('is installed around this very test: a declared call is recorded and passes', () => {
		const calls = expectConsole('warn', 1);
		console.warn('declared', { detail: 1 });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.[0]).toBe('declared');
		expect(slot.expected.warn).toBe(1);
	});
});
