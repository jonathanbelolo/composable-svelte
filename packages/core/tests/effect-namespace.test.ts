/**
 * `Effect.api` and `Effect.websocket` must exist — to TypeScript, not only at
 * runtime.
 *
 * Both are documented public API (`docs/backend/api-client.md`,
 * `docs/backend/websocket.md`, and the JSDoc example at
 * `src/lib/websocket/index.ts:26`), and neither typechecked. Each extension
 * module augmented a name with nothing to merge into — `api/effect-api.ts` wrote
 * `interface Effect`, `websocket/effect-websocket.ts` wrote `interface
 * EffectNamespace` — while `Effect` is a `const`. Merging an interface
 * contributes nothing to a const of the same name, so both augmentations were
 * inert while `(Effect as any).api = api` made the runtime work anyway. A
 * consumer following the docs got a red squiggle on code that runs.
 *
 * It survived because core's `tsconfig.test.json` resolved zero test files: it
 * added `tests/**` to `include` and never overrode the inherited
 * `exclude: ["**\/*.test.ts"]`, so 122 test files were checked by nothing.
 *
 * **This file is a type test.** The assertions exist so `tsc` has a reason to
 * visit it; the real check is whether it compiles. `pnpm --filter
 * @composable-svelte/core typecheck` is what enforces it — the same arrangement
 * `packages/chat/tests/media-type-conformance.test.ts` uses, and for the same
 * reason.
 */

import { describe, it, expect } from 'vitest';
import { Effect } from '../src/lib/effect.js';
import { createMockAPI } from '../src/lib/api/testing/mock-client.js';

// Both registration modules must be loaded for the runtime half to be true. The
// root barrel does this for consumers; here it is explicit.
import '../src/lib/api/effect-api.js';
import '../src/lib/websocket/effect-websocket.js';

describe('the Effect namespace extensions', () => {
	it('exposes the API helpers to the type system', () => {
		// The load-bearing lines are the member accesses. If the augmentation
		// stops merging, these stop compiling.
		const api: typeof Effect.api = Effect.api;
		const apiAll: typeof Effect.apiAll = Effect.apiAll;
		const apiFireAndForget: typeof Effect.apiFireAndForget = Effect.apiFireAndForget;

		expect(typeof api).toBe('function');
		expect(typeof apiAll).toBe('function');
		expect(typeof apiFireAndForget).toBe('function');
	});

	it('exposes the websocket helpers to the type system', () => {
		const connect: typeof Effect.websocket.connect = Effect.websocket.connect;

		expect(typeof connect).toBe('function');
		expect(typeof Effect.websocket.disconnect).toBe('function');
		expect(typeof Effect.websocket.send).toBe('function');
	});

	it('still builds a real effect through the namespace', () => {
		// Types alone would pass with a stub. This is the runtime half: the thing
		// the namespace resolves to actually constructs an effect.
		const client = createMockAPI({ 'GET /things': { data: [] } });
		const effect = Effect.api(
			client,
			{ method: 'GET', path: '/things' },
			(response) => ({ type: 'loaded' as const, response }),
			(error) => ({ type: 'failed' as const, error })
		);

		expect(effect._tag).toBe('Run');
	});
});
