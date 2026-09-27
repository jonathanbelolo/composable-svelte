/**
 * Protocol Matrix: Traversal, Barriers, and Corrections
 *
 * Verifies all traversal conditions in:
 * specs/frontend/fluid-layout-motion-design.md, Proof section:
 * - Route-affecting vs native-fragment observation
 * - A request made after traversal observation is fresh at its FIFO position
 * - Physical replace failure during traversal enters history uncertainty
 * - Parameterized parity between Production and TestStore runtimes
 *
 * The real correction chain (barrier, matched arrival, correction failure with and
 * without re-establishment, reclassification at settlement, reentrant requests
 * captured before vs between observation and settlement) is in
 * protocol-matrix-correction.test.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatrixRig, type MatrixRig } from './protocol-matrix-fixtures/matrix-rig.js';

describe('Protocol Matrix: Traversal, Barriers, and Corrections', () => {
  let rig: MatrixRig | undefined;

  afterEach(() => {
    const reported = rig?.reported ?? [];
    rig?.destroy();
    rig = undefined;
    vi.restoreAllMocks();
    expect(reported).toEqual([]);
  });

  const runtimes = ['production', 'teststore'] as const;

  for (const runtime of runtimes) {
    describe(`Runtime: ${runtime}`, () => {
      it('1. native fragment-only traversal is not route-affecting: pending transaction survives and commits', () => {
        rig = createMatrixRig({ runtime, initialURL: '/start' });

        const handle = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(handle);

        // Native fragment change on same route
        rig.visit('/start#section');

        // Pending transaction survives
        expect(rig.coordinator.status.transaction(tx)).toMatchObject({ phase: 'pending' });

        // Cue commits normally
        rig.coordinator.cue(tx);
        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: { type: 'committed', route: 'accepted', url: '/next' }
        });
        expect(rig.trace).toEqual(['go:/next']);
      });

      it('2. route-affecting traversal cancels pending transaction with reason traversal', () => {
        rig = createMatrixRig({ runtime, initialURL: '/start' });

        const handle = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(handle);

        // User navigates back/forward to an unknown entry /visited
        rig.visit('/visited');

        // Cancelled with reason traversal
        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: { type: 'cancelled', reason: 'traversal' }
        });

        // Late cue is a staleCue no-op
        rig.coordinator.cue(tx);
        expect(rig.trace).toEqual(['go:/visited']);
      });

      it('3. request made after traversal observation captures new generation and is fresh at its FIFO position', () => {
        const r = createMatrixRig({ runtime });
        rig = r;

        let once = false;
        let secondHandle: any;

        const stop = r.store.subscribe((state: any) => {
          if (state.tick === 1 && !once) {
            once = true;
            // Traversal occurs first, then second request is issued
            r.visit('/visited');
            secondHandle = r.coordinator.request({ to: '/next' }, {});
          }
        });

        rig.store.dispatch({ type: 'tick' });
        stop();

        expect(rig.trace).toEqual(['go:/visited']);
        expect(secondHandle).toBeDefined();
        // The second request is fresh with the new generation
        expect(secondHandle.status).toMatchObject({ type: 'admitted' });
      });

      it('4. physical replace failure during traversal enters historyUncertain and makes staging unavailable (R1 regression witness)', () => {
        rig = createMatrixRig({ runtime, initialURL: '/start' });

        // Cause the next port.replace call to fail during traversal metadata claim
        rig.port.failNextReplace(new Error('simulated physical replace failure'));

        const r = rig;
        expect(() => r.visit('/destination')).not.toThrow();

        // Fresh request when history is uncertain must degrade or drop
        const handle = rig.coordinator.request({ to: '/after-failure' }, {}, { onUnavailable: 'drop' });
        expect(handle.status).toEqual({ type: 'dropped', reason: 'historyUncertain' });
      });
    });
  }
});
