import { describe, it, expect } from 'vitest';
import { TestStore } from '../../src/lib/test/test-store';
import { Effect } from '../../src/lib/effect';

describe('finish() under real timers', () => {
	it('does not throw when nothing faked the clock', async () => {
		const store = new TestStore<{ n: number }, { type: 'go' }>({
			initialState: { n: 0 },
			reducer: (state, action) => [
				action.type === 'go' ? { n: state.n + 1 } : state,
				Effect.none()
			],
			dependencies: {}
		});

		await store.send({ type: 'go' }, (state) => expect(state.n).toBe(1));
		await store.finish();
	});
});
