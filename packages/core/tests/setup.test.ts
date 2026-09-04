/**
 * The console guard's own positive controls.
 *
 * A guard whose job is to report zero needs a deliberately-wrong input pushed
 * through the same code path (`guides/VERIFICATION-PROTOCOL.md` rule 1).
 * `violations` is pure over a slot, so these drive the real function with
 * synthetic slots and never touch the live one — the guard installed by
 * `tests/setup.ts` is active around each of these tests too, and would
 * otherwise see the planted calls.
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

	it('is installed around this very test: a declared call is recorded and passes', () => {
		const calls = expectConsole('warn', 1);
		console.warn('declared', { detail: 1 });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.[0]).toBe('declared');
		expect(slot.expected.warn).toBe(1);
	});
});
