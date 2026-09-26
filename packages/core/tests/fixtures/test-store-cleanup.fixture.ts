import { it, expect, vi, onTestFinished } from 'vitest';
import { createTestStore } from '../../src/lib/test/test-store';
import { Effect } from '../../src/lib/effect';
import process from 'node:process';

const scenario = process.env.COMPOSABLE_CLEANUP_FIXTURE;
it(`cleanup fixture: ${scenario}`, async () => {
  if (scenario === 'fake-timer-pending' || scenario === 'failure-and-pending') {
    vi.useFakeTimers();
    // Registered first so the store's later finish hook runs before this.
    onTestFinished(() => { vi.useRealTimers(); });
  }
  const store = createTestStore({ initialState: 0, reducer: (state: number, _action: { type: 'start' }) => [state,
    scenario === 'fake-timer-pending'
      ? Effect.subscription('fake-clock-close', () => () => new Promise<void>(resolve => setTimeout(resolve, 100)))
      : Effect.batch(
          Effect.subscription('rejecting-close', () => async () => { throw new Error('owned cleanup rejection'); }),
          scenario === 'failure-and-pending'
            ? Effect.subscription('pending-close', () => () => new Promise<void>(() => {}))
            : Effect.none()
        )
  ] as const });
  if (scenario === 'dispatch-only') {
    store.dispatch({ type: 'start' });
    await expect(store.destroyAndSettle()).rejects.toThrow('owned cleanup rejection');
  } else {
    await store.send({ type: 'start' });
    // Automatic teardown must attribute cleanup failure to this test.
    // The test deliberately never asks the explicit settlement API.
  }
});
