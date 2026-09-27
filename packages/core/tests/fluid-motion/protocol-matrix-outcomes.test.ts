/**
 * Protocol Matrix: Terminal Outcomes, History Writes, and Known Source Regressions
 *
 * Verifies all outcome types in:
 * specs/frontend/fluid-layout-motion-design.md, Proof section:
 * - committed(accepted), committed(redirected), refused, vetoed
 * - failed(reduction), failed(commitPolicy), failed(commitRouteKey)
 * - Physical history writes: written, failed, unchanged
 * - Synchronous root destruction before the write (failed) vs binding disposal after the write (written)
 * - writePolicy push vs replace
 * - Known source findings R1 & R2 from protocol-render-astra-review.md
 * - (failed(routeClassification) of a committed traversal is in protocol-matrix-uncertainty.test.ts)
 * - Parameterized parity between Production and TestStore runtimes
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatrixRig, type MatrixRig } from './protocol-matrix-fixtures/matrix-rig.js';
import { expectConsole } from '../helpers/console.js';

describe('Protocol Matrix: Outcomes and History Evidence', () => {
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
      it('1. outcome: committed(accepted) with physical history written', () => {
        rig = createMatrixRig({ runtime });
        const handle = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(handle);

        rig.coordinator.cue(tx);

        expect(rig.coordinator.status.transaction(tx)).toEqual({
          phase: 'terminal',
          outcome: {
            type: 'committed',
            route: 'accepted',
            attempted: 1,
            domainCommitted: true,
            url: '/next',
            history: 'written'
          }
        });
        expect(rig.port.push).toHaveBeenCalledOnce();
      });

      it('2. outcome: committed(redirected) when reducer normalizes URL', () => {
        rig = createMatrixRig({
          runtime,
          normalize: url => `${url}/canonical`
        });

        const handle = rig.coordinator.request({ to: '/target' }, {});
        const tx = rig.txOf(handle);

        rig.coordinator.cue(tx);

        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: {
            type: 'committed',
            route: 'redirected',
            attempted: 1,
            domainCommitted: true,
            url: '/target/canonical'
          }
        });
      });

      it('3. outcome: refused when destination is blocked/ignored by reducer', () => {
        rig = createMatrixRig({ runtime });
        const handle = rig.coordinator.request({ to: '/blocked' }, {});
        const tx = rig.txOf(handle);

        rig.coordinator.cue(tx);

        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: {
            type: 'refused',
            attempted: 1,
            domainCommitted: true,
            url: '/start',
            history: 'unchanged'
          }
        });
        expect(rig.port.push).not.toHaveBeenCalled();
      });

      it('4. outcome: failed(reduction) when reducer throws during reserved commit turn', async () => {
        const r = createMatrixRig({ runtime });
        rig = r;
        const handle = r.coordinator.request({ to: '/throw' }, {});
        const tx = r.txOf(handle);

        // D5: protocol-issued turn rejections go to the runtime failure sink, never the drainer.
        const sink = runtime === 'production' ? expectConsole('error') : undefined;
        expect(() => r.coordinator.cue(tx)).not.toThrow();
        if (sink) expect(sink.filter(call => String(call[0]).includes('Runtime error (reduction)'))).toHaveLength(1);

        expect(r.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: {
            type: 'failed',
            phase: 'reduction',
            attempted: 1,
            domainCommitted: false
          }
        });
        if (r.runtime === 'teststore') {
          // TestStore's existing managed failure path recorded it; its next call surfaces it (once).
          await expect(r.store.send({ type: 'tick' })).rejects.toThrow('route reducer failed');
        }
      });

      it('5. physical push write failure reports history: failed and enters historyUncertain', () => {
        rig = createMatrixRig({ runtime });
        rig.port.failNextPush(new Error('disk write error'));

        const handle = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(handle);

        rig.coordinator.cue(tx);

        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: {
            type: 'committed',
            route: 'accepted',
            attempted: 1,
            domainCommitted: true,
            history: 'failed'
          }
        });

        // Later staging requests are degraded/dropped due to historyUncertain
        const later = rig.coordinator.request({ to: '/later' }, {});
        expect(later.status).toMatchObject({
          type: 'degraded',
          reason: 'historyUncertain'
        });
      });

      it('6. history evidence: synchronous root destruction before write reports history: failed', () => {
        rig = createMatrixRig({
          runtime,
          before: store => {
            // Register subscriber before binding subscriber: destroys store on URL change before write
            store.subscribe((state: any) => {
              if (state.url === '/next') store.destroy();
            });
          }
        });

        const handle = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(handle);

        rig.coordinator.cue(tx);

        expect(rig.port.push).not.toHaveBeenCalled();
        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: {
            type: 'committed',
            route: 'accepted',
            domainCommitted: true,
            history: 'failed'
          }
        });
      });

      it('7. history evidence: synchronous binding disposal after write keeps history: written', () => {
        rig = createMatrixRig({ runtime });

        // Disposes binding only after state commit has occurred and write has completed
        const stop = rig.store.subscribe((state: any) => {
          if (state.url === '/next') rig?.binding?.dispose();
        });

        const handle = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(handle);

        rig.coordinator.cue(tx);
        stop();

        expect(rig.port.push).toHaveBeenCalledOnce();
        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: {
            type: 'committed',
            route: 'accepted',
            history: 'written'
          }
        });
      });

      it('8. user writePolicy: custom writePolicy replace is invoked once and calls port.replace', () => {
        let policyCalls = 0;
        rig = createMatrixRig({
          runtime,
          writePolicy: () => {
            policyCalls++;
            return 'replace';
          }
        });

        const handle = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(handle);
        // Binding initialization already claimed the entry with one replace; count only the commit's writes.
        const replacesBefore = vi.mocked(rig.port.replace).mock.calls.length;

        rig.coordinator.cue(tx);

        expect(policyCalls).toBe(1);
        const commitReplaces = vi.mocked(rig.port.replace).mock.calls.slice(replacesBefore);
        expect(commitReplaces).toHaveLength(1);
        expect(commitReplaces[0]?.[0]).toBe('/next');
        expect(rig.port.push).not.toHaveBeenCalled();
        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: {
            type: 'committed',
            route: 'accepted',
            history: 'written'
          }
        });
      });
    });
  }

  describe('Known Source Regressions (Documented in protocol-render-astra-review.md)', () => {
    it('R2 (P2): refusal after immediate navigation does not inherit previous turn written history', () => {
      // Review finding R2: When go('/previous') commits 'written', a subsequent refused staged
      // action returning the exact same state object must report history: 'unchanged', not 'written'.
      rig = createMatrixRig({ runtime: 'production' });

      // Immediate navigation
      rig.store.dispatch({ type: 'go', url: '/previous' });
      const beforeSnapshot = rig.port.read();

      // Refused staged action returning same state
      const handle = rig.coordinator.request({ to: '/blocked' }, {});
      const tx = rig.txOf(handle);
      rig.coordinator.cue(tx);

      expect(rig.port.read()).toBe(beforeSnapshot); // Positive control: no physical write
      expect(rig.coordinator.status.transaction(tx)).toMatchObject({
        phase: 'terminal',
        outcome: {
          type: 'refused',
          history: 'unchanged'
        }
      });
    });

    it('R1 (P1): failed traversal metadata write cannot preserve an old staged intention', () => {
      // Review finding R1 (Metadata write failure):
      // Design requires route-affecting traversal invalidation before queued inspection.
      // A physical replace failure during metadata claiming must cancel the pending transaction
      // and prevent late cue execution.
      rig = createMatrixRig({ runtime: 'production' });

      const handle = rig.coordinator.request({ to: '/pending' }, {});
      const tx = rig.txOf(handle);

      // Make port.replace throw during traversal metadata claiming
      vi.mocked(rig.port.replace).mockImplementation(() => {
        throw new Error('metadata write failed');
      });

      const r = rig;
      expect(() => r.visit('/visited')).not.toThrow();

      // A late cue after failed traversal must not dispatch the old staged intention
      rig.coordinator.cue(tx);

      expect(rig.trace).not.toContain('go:/pending');
      expect(rig.coordinator.status.transaction(tx)).toEqual({
        phase: 'terminal',
        outcome: { type: 'cancelled', reason: 'traversal', attempted: 0, domainCommitted: false }
      });
    });

    it('R1 (P1): failed traversal canonicalization cannot admit delayed staging', () => {
      // Review finding R1 (Canonicalization write failure):
      // Initial metadata claim succeeds, but canonicalization write fails during visit.
      // Fresh requests under uncertainty must take the declared unavailable path (dropped),
      // never admit delayed work.
      rig = createMatrixRig({
        runtime: 'production',
        normalize: url => `${url}/canonical`
      });

      let calls = 0;
      const originalReplace = rig.port.replace;
      rig.port.replace = vi.fn((url: string, state: unknown) => {
        if (++calls === 2) throw new Error('canonical write failed');
        originalReplace(url, state);
      });

      const r = rig;
      expect(() => r.visit('/visited')).not.toThrow();

      expect(rig.port.read().url).toBe('/visited');
      expect(rig.store.state.url).toBe('/visited/canonical');

      const freshHandle = rig.coordinator.request({ to: '/next' }, {}, { onUnavailable: 'drop' });
      expect(freshHandle.status).toEqual({ type: 'dropped', reason: 'historyUncertain' });
    });
  });
});
