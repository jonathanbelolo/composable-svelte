/**
 * Protocol Matrix: Admission and Freshness
 *
 * Verifies every request result and freshness condition in:
 * specs/frontend/fluid-layout-motion-design.md, Proof section:
 * - Every request result: admitted, rejected, unchanged, returned, dropped, degraded, failed,
 *   and stale(ownerRetired | epochChanged | traversal | rootDestroyed)
 * - Pre-traversal captured request dequeued afterward: stale (traversal), never degraded
 * - Drop vs degraded modes
 * - (A request made during a real correction, degraded(historyBarrier) with one action,
 *   is in protocol-matrix-correction.test.ts.)
 * - Unmanaged route render
 * - No binding
 * - Parameterized parity between Production and TestStore runtimes
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatrixRig, type MatrixRig, type MatrixState } from './protocol-matrix-fixtures/matrix-rig.js';
import { capturedView } from '../../src/lib/execution/store-access.js';

describe('Protocol Matrix: Admission and Freshness', () => {
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
      it('1. every request result: admitted', () => {
        rig = createMatrixRig({ runtime });
        const handle = rig.coordinator.request({ to: '/next' }, {});

        expect(handle.status).toEqual({ type: 'admitted', transaction: 1 });
        expect(rig.coordinator.status.pending).toBe(1);
        expect(rig.events).toContainEqual({
          kind: 'request',
          request: 1,
          result: { type: 'admitted', transaction: 1 }
        });
      });

      it('2. every request result: unchanged (request for exact current committed URL)', () => {
        rig = createMatrixRig({ runtime, initialURL: '/start' });
        const handle = rig.coordinator.request({ to: '/start' }, {});

        expect(handle.status).toEqual({ type: 'unchanged' });
        expect(rig.coordinator.status.pending).toBeUndefined();
        expect(rig.trace).toEqual([]);
        expect(rig.events).toContainEqual({
          kind: 'request',
          request: 1,
          result: { type: 'unchanged' }
        });
      });

      it('3. every request result: returned (request for committed URL cancels pending transaction)', () => {
        rig = createMatrixRig({ runtime, initialURL: '/start' });

        const first = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(first);

        // While /next is pending, request /start (the current committed URL)
        const returned = rig.coordinator.request({ to: '/start' }, {});

        expect(returned.status).toEqual({ type: 'returned' });
        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: { type: 'cancelled', reason: 'returned' }
        });
        expect(rig.coordinator.status.pending).toBeUndefined();
      });

      it('4. every request result: rejected (application staging policy returns false)', () => {
        rig = createMatrixRig({ runtime, policy: () => false });
        const handle = rig.coordinator.request({ to: '/next' }, {});

        expect(handle.status).toEqual({ type: 'rejected' });
        expect(rig.coordinator.status.pending).toBeUndefined();
        expect(rig.events).toContainEqual({
          kind: 'request',
          request: 1,
          result: { type: 'rejected' }
        });
      });

      it('5. every request result: failed admission (application staging policy throws)', () => {
        const error = new Error('policy throw');
        rig = createMatrixRig({
          runtime,
          policy: () => { throw error; }
        });

        const handle = rig.coordinator.request({ to: '/next' }, {});
        expect(handle.status).toMatchObject({
          type: 'failed',
          phase: 'admission',
          error
        });
        expect(rig.coordinator.status.pending).toBeUndefined();
      });

      it('6. every request result: dropped (staging unavailable with onUnavailable: drop)', () => {
        rig = createMatrixRig({ runtime, bind: false, onUnavailable: 'drop' });
        const handle = rig.coordinator.request({ to: '/next' }, {});

        expect(handle.status).toEqual({ type: 'dropped', reason: 'noBinding' });
        expect(rig.trace).toEqual([]);
        expect(rig.coordinator.status.pending).toBeUndefined();
      });

      it('7. every request result: degraded (staging unavailable with onUnavailable: immediate)', () => {
        rig = createMatrixRig({ runtime, bind: false, onUnavailable: 'immediate' });
        const handle = rig.coordinator.request({ to: '/next' }, {});

        expect(handle.status).toMatchObject({
          type: 'degraded',
          reason: 'noBinding',
          outcome: {
            type: 'committed',
            route: 'accepted',
            attempted: 1,
            domainCommitted: true,
            url: '/next',
            history: 'unchanged'
          }
        });
        expect(rig.trace).toEqual(['go:/next']);
        expect(rig.coordinator.status.pending).toBeUndefined();
      });

      it('8. every request result: stale (owner retired before request admission)', () => {
        rig = createMatrixRig({ runtime });
        const view = rig.childView();
        const capture = capturedView(view);

        // Replace child owner, causing retirement
        rig.store.dispatch({ type: 'replace' });

        const handle = rig.coordinator.request(
          { to: '/next' },
          { owner: capture.origin, ownerLive: () => capture.isLive() }
        );

        expect(handle.status).toEqual({ type: 'stale', reason: 'ownerRetired' });
        expect(rig.coordinator.status.pending).toBeUndefined();
      });

      it('9. every request result: stale (epochChanged) when the binding epoch ends before admission', () => {
        const r = createMatrixRig({ runtime });
        rig = r;
        let handle: { status: unknown } | undefined;
        let once = false;

        // Inside a draining turn: capture under the current epoch, then end that epoch before admission runs.
        const stop = r.store.subscribe((state: MatrixState) => {
          if (state.tick === 1 && !once) {
            once = true;
            handle = r.coordinator.request({ to: '/next' }, {});
            r.binding?.dispose();
          }
        });
        r.store.dispatch({ type: 'tick' });
        stop();

        expect(handle?.status).toEqual({ type: 'stale', reason: 'epochChanged' });
        expect(r.trace).toEqual([]);
        expect(r.coordinator.status.pending).toBeUndefined();
      });

      it('10. every request result: stale (rootDestroyed) when the root is destroyed before admission runs', () => {
        const r = createMatrixRig({ runtime });
        rig = r;
        let handle: { status: unknown } | undefined;
        let once = false;

        r.store.subscribe((state: MatrixState) => {
          if (state.tick === 1 && !once) {
            once = true;
            handle = r.coordinator.request({ to: '/next' }, {});
            r.store.destroy();
          }
        });
        r.store.dispatch({ type: 'tick' });

        expect(handle?.status).toEqual({ type: 'stale', reason: 'rootDestroyed' });
        expect(r.trace).toEqual([]);
      });
    });
  }

  describe('Freshness and Invalidation Specifics', () => {
    it('pre-traversal captured request dequeued afterward is stale, never degraded', () => {
      const r = createMatrixRig({ runtime: 'production' });
      rig = r;
      let once = false;
      let handle: any;

      const stop = r.store.subscribe((state: any) => {
        if (state.tick === 1 && !once) {
          once = true;
          // Capture request synchronously, then simulate traversal before inspection runs
          handle = r.coordinator.request({ to: '/next' }, {});
          r.visit('/visited');
        }
      });

      rig.store.dispatch({ type: 'tick' });
      stop();

      expect(handle).toBeDefined();
      expect(handle.status).toEqual({ type: 'stale', reason: 'traversal' });
      expect(rig.trace).toEqual(['go:/visited']);
    });

    it('unmanaged route render makes staging unavailable (reason: unmanagedRouteRender)', () => {
      rig = createMatrixRig({ runtime: 'production', outlet: false });
      const handle = rig.coordinator.request({ to: '/next' }, {});

      expect(handle.status).toMatchObject({
        type: 'degraded',
        reason: 'unmanagedRouteRender',
        outcome: { type: 'committed', route: 'accepted', history: 'written' }
      });
      expect(rig.port.push).toHaveBeenCalledOnce();
    });

    it('no binding keeps baseline unchanged history on degraded commit', () => {
      rig = createMatrixRig({ runtime: 'production', bind: false });
      const handle = rig.coordinator.request({ to: '/next' }, {});

      expect(handle.status).toMatchObject({
        type: 'degraded',
        reason: 'noBinding',
        outcome: {
          type: 'committed',
          route: 'accepted',
          attempted: 1,
          domainCommitted: true,
          history: 'unchanged'
        }
      });
      expect(rig.port.push).not.toHaveBeenCalled();
      expect(rig.port.replace).not.toHaveBeenCalled();
    });

    it('a request made after the coordinator is disposed is stale (reason: rootDestroyed)', () => {
      rig = createMatrixRig({ runtime: 'production' });
      rig.coordinator.dispose();

      const handle = rig.coordinator.request({ to: '/next' }, {});
      expect(handle.status).toEqual({ type: 'stale', reason: 'rootDestroyed' });
    });
  });
});
