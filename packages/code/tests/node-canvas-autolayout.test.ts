/**
 * `deps.autoLayout` was declared, documented in `node-canvas/README.md:13`
 * ("Auto-Layout … via dependencies"), and never called — there was no action
 * that could reach it.
 *
 * `deps.nodeTypes` is removed rather than wired: it duplicates the registry
 * `createConnectionValidator(nodeTypes)` already closes over, and the component
 * takes an unrelated `nodeTypes` prop of Svelte components. Two ways to supply
 * the same data, one of which did nothing.
 */

import { describe, it, expect, vi } from 'vitest';
import { nodeCanvasReducer } from '../src/lib/node-canvas/reducer';
import { createInitialNodeCanvasState } from '../src/lib/node-canvas/types';
import type { NodeCanvasState } from '../src/lib/node-canvas/types';

function seeded(): NodeCanvasState {
	return createInitialNodeCanvasState({
		nodes: {
			a: { id: 'a', type: 'default', position: { x: 0, y: 0 }, data: {} },
			b: { id: 'b', type: 'default', position: { x: 10, y: 10 }, data: {} }
		}
	});
}

describe('autoLayout', () => {
	it('applies the positions the dependency returns', async () => {
		const autoLayout = vi.fn(() => ({ a: { x: 100, y: 200 } }));
		const state = seeded();

		const [next] = nodeCanvasReducer(state, { type: 'autoLayout' }, { autoLayout });

		expect(autoLayout, 'the dependency was never called').toHaveBeenCalledTimes(1);
		expect(next.nodes.a!.position).toEqual({ x: 100, y: 200 });
	});

	it('leaves untouched nodes identical by reference', async () => {
		// Not deep equality: `$state.raw` means the component's `$derived`
		// recomputes on every dispatch, and xyflow compares nodes by reference.
		// Cloning every node here would force a full re-adoption of the graph.
		const autoLayout = vi.fn(() => ({ a: { x: 100, y: 200 } }));
		const state = seeded();

		const [next] = nodeCanvasReducer(state, { type: 'autoLayout' }, { autoLayout });

		expect(next.nodes.b, 'node b was cloned despite not moving').toBe(state.nodes.b);
	});

	it('is a no-op with no dependency supplied', async () => {
		const state = seeded();
		const [next] = nodeCanvasReducer(state, { type: 'autoLayout' }, {});

		expect(next, 'should return the identical state object').toBe(state);
	});
});
