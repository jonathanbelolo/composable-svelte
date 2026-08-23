/**
 * Module-scope handles the `.svelte` harnesses publish their stores through.
 *
 * They used to be `export let` bindings inside each harness's `<script module>`
 * block, which works at runtime and is invisible to `tsc`: svelte's ambient
 * `declare module '*.svelte'` declares a **default export only**, so
 * `import Harness, { harnessStore } from './X.svelte'` cannot typecheck. No
 * compiler flag changes that. It went unnoticed until this package's tests were
 * typechecked for the first time — all four of its errors were this one cause.
 *
 * Containers rather than bare `let`s, matching
 * `packages/core/tests/test-components/RerenderProbe.svelte`, whose own comment
 * records why: runes mode rejects reassigning an exported module binding, so the
 * thing that gets mutated has to be a property.
 */

import type { Store } from '@composable-svelte/core';
import type { NodeCanvasState, NodeCanvasAction } from '../../src/lib/node-canvas/types.js';

/** A parent that WRAPS canvas actions and owns same-named actions of its own. */
export type ParentAction =
	| { type: 'canvas'; action: NodeCanvasAction }
	| { type: 'zoomIn' }
	| { type: 'setViewport'; to: string };

/** Handed out so a `.ts` test can dispatch without owning the store. */
export const harness: { store: Store<NodeCanvasState, NodeCanvasAction> | null } = {
	store: null
};

export const wrappedHarness: { store: Store<NodeCanvasState, ParentAction> | null } = {
	store: null
};
