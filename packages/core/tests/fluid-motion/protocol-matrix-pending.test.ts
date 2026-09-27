/**
 * Protocol Matrix: Pending Transactions
 *
 * Verifies all pending transaction behaviors in:
 * specs/frontend/fluid-layout-motion-design.md, Proof section:
 * - Supersession, returned, explicit cancel (precommit; the reserved-commit FIFO
 *   ordering of these is in protocol-matrix-correction.test.ts)
 * - Explicit return intent and exact current URL
 * - Same-key, different-URL request (/search?q=old -> /search?q=new) under a
 *   query-collapsing route key:
 *   - admitted and committed(accepted) with exactly one writePolicy history write
 *   - unrelated same-key edit survives
 *   - reducer normalization -> redirected
 *   - reducer ignore -> refused
 * - Default vs custom query identity
 * - Owner retirement and self-retirement by transaction's own commit turn
 * - cancelled(routeKeyFailed) while pending; commitPolicy veto/failure and
 *   failed(commitRouteKey) at commit inspection
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatrixRig, ownerSource, type MatrixRig, type MatrixState } from './protocol-matrix-fixtures/matrix-rig.js';
import { capturedView } from '../../src/lib/execution/store-access.js';

describe('Protocol Matrix: Pending Transactions', () => {
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
      it('1. supersession: new admitted request supersedes earlier pending transaction', () => {
        rig = createMatrixRig({ runtime });

        const first = rig.coordinator.request({ to: '/first' }, {});
        const tx1 = rig.txOf(first);
        expect(rig.coordinator.status.pending).toBe(tx1);

        const second = rig.coordinator.request({ to: '/second' }, {});
        const tx2 = rig.txOf(second);

        // First transaction is terminated with superseded
        expect(rig.coordinator.status.transaction(tx1)).toMatchObject({
          phase: 'terminal',
          outcome: { type: 'superseded', attempted: 0, domainCommitted: false }
        });

        // Second transaction is the new pending transaction
        expect(rig.coordinator.status.pending).toBe(tx2);

        // Cueing superseded transaction is a staleCue no-op
        rig.coordinator.cue(tx1);
        expect(rig.trace).toEqual([]);

        // Cueing second transaction commits
        rig.coordinator.cue(tx2);
        expect(rig.trace).toEqual(['go:/second']);
      });

      it('2. explicit return intent { return: true } cancels pending transaction and returns returned', () => {
        rig = createMatrixRig({ runtime });

        const handle = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(handle);

        const returned = rig.coordinator.request({ to: '/anything' }, {}, { return: true });
        expect(returned.status).toEqual({ type: 'returned' });

        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: { type: 'cancelled', reason: 'returned', attempted: 0 }
        });
        expect(rig.coordinator.status.pending).toBeUndefined();
      });

      it('3. explicit return intent when no transaction is pending yields unchanged', () => {
        rig = createMatrixRig({ runtime });

        const result = rig.coordinator.request({ to: '/start' }, {}, { return: true });
        expect(result.status).toEqual({ type: 'unchanged' });
        expect(rig.trace).toEqual([]);
      });

      it('4. explicit cancel is owner-bound: mismatched owner is ignored, matching owner cancels', () => {
        rig = createMatrixRig({ runtime });
        const view = rig.childView();
        const capture = capturedView(view);

        const handle = rig.coordinator.request(
          { to: '/next' },
          { owner: capture.origin, ownerLive: () => capture.isLive() }
        );
        const tx = rig.txOf(handle);

        // Attempt cancel with mismatched owner (undefined / wrong token)
        rig.coordinator.cancel(tx, undefined);
        expect(rig.coordinator.status.transaction(tx)).toMatchObject({ phase: 'pending' });

        // Cancel with matching owner
        rig.coordinator.cancel(tx, capture.origin);
        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: { type: 'cancelled', reason: 'explicit', attempted: 0 }
        });
        expect(rig.coordinator.status.pending).toBeUndefined();
      });

      it('5. owner retirement cancels pending transaction from captured view', () => {
        rig = createMatrixRig({ runtime });
        const view = rig.childView();
        const capture = capturedView(view);

        const source = {
          owner: capture.origin,
          ownerLive: () => capture.isLive(),
          observeRetirement: (retired: () => void) => {
            let active = true;
            const record = capture.registerResource({
              kind: 'subscription',
              cleanup: () => { if (active) retired(); }
            });
            return () => {
              active = false;
              record.dispose();
            };
          }
        };

        const handle = rig.coordinator.request({ to: '/next' }, source);
        const tx = rig.txOf(handle);
        expect(rig.coordinator.status.pending).toBe(tx);

        // Replace child owner in store, causing retirement of previous child view
        rig.store.dispatch({ type: 'replace' });

        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: { type: 'cancelled', reason: 'ownerRetired' }
        });
        expect(rig.coordinator.status.pending).toBeUndefined();
      });

      it('6. self-retirement: owner retired by transaction own commit turn is part of commit (not cancelled)', () => {
        rig = createMatrixRig({ runtime });
        const owner = ownerSource(rig.childView());

        // The commit action go:/replace replaces the child slot inside the reserved commit turn.
        const handle = rig.coordinator.request({ to: '/replace' }, owner.source);
        const tx = rig.txOf(handle);
        expect(owner.capture.isLive()).toBe(true);

        rig.coordinator.cue(tx);

        // Positive control: the commit turn really retired the originating owner.
        expect(owner.capture.isLive()).toBe(false);
        expect(owner.retirements()).toBe(1);
        // Attribution before reduction: that retirement is part of the commit, not an invalidation.
        expect(rig.coordinator.status.transaction(tx)).toEqual({
          phase: 'terminal',
          outcome: {
            type: 'committed',
            route: 'accepted',
            attempted: 1,
            domainCommitted: true,
            url: '/replace',
            history: 'written'
          }
        });
        expect(rig.trace).toEqual(['go:/replace']);
      });

      it('7. commit policy veto: returning false during commit inspection vetoes transaction', () => {
        let allowCommit = true;
        rig = createMatrixRig({
          runtime,
          policy: () => allowCommit
        });

        const handle = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(handle);
        expect(rig.coordinator.status.pending).toBe(tx);

        // Disallow before commit inspection
        allowCommit = false;

        rig.coordinator.cue(tx);

        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: { type: 'vetoed', attempted: 0, domainCommitted: false }
        });
        expect(rig.trace).toEqual([]);
        expect(rig.coordinator.status.pending).toBeUndefined();
      });

      it('8. commit policy failure: policy throwing during commit inspection fails transaction', () => {
        let throwOnCommit = false;
        const err = new Error('commit policy exploded');
        rig = createMatrixRig({
          runtime,
          policy: () => {
            if (throwOnCommit) throw err;
            return true;
          }
        });

        const handle = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(handle);

        throwOnCommit = true;
        rig.coordinator.cue(tx);

        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: {
            type: 'failed',
            phase: 'commitPolicy',
            attempted: 0,
            domainCommitted: false,
            error: err
          }
        });
      });

      it('9. routeKey failure during commit inspection fails transaction with commitRouteKey', () => {
        let failRouteKey = false;
        const routeKeyErr = new Error('route key extraction failed');
        rig = createMatrixRig({
          runtime,
          routeKey: (state: MatrixState) => {
            if (failRouteKey) throw routeKeyErr;
            return state.url;
          }
        });

        const handle = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(handle);

        failRouteKey = true;
        rig.coordinator.cue(tx);

        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: {
            type: 'failed',
            phase: 'commitRouteKey',
            attempted: 0,
            domainCommitted: false,
            error: routeKeyErr
          }
        });
      });

      it('10. pending routeKey failure after an unrelated committed turn cancels with routeKeyFailed', () => {
        let failRouteKey = false;
        rig = createMatrixRig({
          runtime,
          routeKey: (state: MatrixState) => {
            if (failRouteKey) throw new Error('route key extraction failed');
            return state.url;
          }
        });

        const handle = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(handle);

        failRouteKey = true;
        rig.store.dispatch({ type: 'tick' });

        expect(rig.coordinator.status.transaction(tx)).toEqual({
          phase: 'terminal',
          outcome: { type: 'cancelled', reason: 'routeKeyFailed', attempted: 0, domainCommitted: false }
        });
        rig.coordinator.cue(tx);
        expect(rig.trace).toEqual([]);
      });
    });
  }

  const queryCollapsingRouteKey = (state: MatrixState) => state.url.split('?')[0]!;

  for (const runtime of runtimes) {
    describe(`Query Identity and Query-Collapsing Route Keys (${runtime})`, () => {
      it('same-key request: unrelated same-key edit survives; accepted with exactly one writePolicy write', () => {
        const policyCalls: Array<[string, string]> = [];
        rig = createMatrixRig({
          runtime,
          routeKey: queryCollapsingRouteKey,
          writePolicy: (previous, next) => {
            policyCalls.push([previous.url, next.url]);
            return 'push';
          }
        });
        rig.store.dispatch({ type: 'go', url: '/search?q=old' });

        const handle = rig.coordinator.request({ to: '/search?q=new' }, {});
        const tx = rig.txOf(handle);
        expect(handle.status).toMatchObject({ type: 'admitted' });

        // Unrelated state change and unrelated same-key edit while pending.
        rig.store.dispatch({ type: 'tick' });
        rig.store.dispatch({ type: 'go', url: '/search?q=other' });
        expect(rig.coordinator.status.transaction(tx)).toMatchObject({ phase: 'pending' });

        const callsBefore = policyCalls.length;
        const writesBefore = rig.port.historyWrites.length;
        rig.coordinator.cue(tx);

        expect(rig.coordinator.status.transaction(tx)).toEqual({
          phase: 'terminal',
          outcome: {
            type: 'committed',
            route: 'accepted',
            attempted: 1,
            domainCommitted: true,
            url: '/search?q=new',
            history: 'written'
          }
        });
        expect(policyCalls.slice(callsBefore)).toEqual([['/search?q=other', '/search?q=new']]);
        expect(rig.port.historyWrites.slice(writesBefore)).toEqual([
          { kind: 'push', url: '/search?q=new', state: expect.anything() }
        ]);
        expect(rig.trace).toEqual(['go:/search?q=old', 'go:/search?q=other', 'go:/search?q=new']);
      });

      it('same-key request normalized by the reducer is redirected although the key matches', () => {
        rig = createMatrixRig({
          runtime,
          routeKey: queryCollapsingRouteKey,
          normalize: url => (url === '/search?q=new' ? '/search?q=new&page=1' : url)
        });
        rig.store.dispatch({ type: 'go', url: '/search?q=old' });

        const handle = rig.coordinator.request({ to: '/search?q=new' }, {});
        const tx = rig.txOf(handle);
        rig.coordinator.cue(tx);

        expect(rig.coordinator.status.transaction(tx)).toEqual({
          phase: 'terminal',
          outcome: {
            type: 'committed',
            route: 'redirected',
            attempted: 1,
            domainCommitted: true,
            url: '/search?q=new&page=1',
            history: 'written'
          }
        });
      });

      it('same-key request ignored by the reducer is refused with no history write', () => {
        rig = createMatrixRig({
          runtime,
          routeKey: queryCollapsingRouteKey,
          // The reducer declines /search?q=new and keeps the committed query.
          normalize: url => (url === '/search?q=new' ? '/search?q=old' : url)
        });
        rig.store.dispatch({ type: 'go', url: '/search?q=old' });
        const writesBefore = rig.port.historyWrites.length;

        const handle = rig.coordinator.request({ to: '/search?q=new' }, {});
        const tx = rig.txOf(handle);
        rig.coordinator.cue(tx);

        expect(rig.coordinator.status.transaction(tx)).toEqual({
          phase: 'terminal',
          outcome: {
            type: 'refused',
            attempted: 1,
            domainCommitted: true,
            url: '/search?q=old',
            history: 'unchanged'
          }
        });
        expect(rig.port.historyWrites.length).toBe(writesBefore);
      });

      it('default query identity: without query-collapsing key, query edits change routeKey and cancel as directCommit', () => {
        // Default routeKey without query collapse uses full serialized URL
        rig = createMatrixRig({ runtime });
        rig.store.dispatch({ type: 'go', url: '/search?q=old' });

        const handle = rig.coordinator.request({ to: '/search?q=new' }, {});
        const tx = rig.txOf(handle);

        // Direct dispatch changing URL
        rig.store.dispatch({ type: 'go', url: '/search?q=other' });

        // Because default route key changed, pending transaction is cancelled on directCommit
        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: { type: 'cancelled', reason: 'directCommit', attempted: 0 }
        });
        expect(rig.trace).toEqual(['go:/search?q=old', 'go:/search?q=other']);
      });
    });
  }
});
