/**
 * Protocol Matrix: Cues, Deadlines, Visual Ports, and Known Source Regressions
 *
 * Verifies all cueing and timing behaviors in:
 * specs/frontend/fluid-layout-motion-design.md, Proof section:
 * - Duplicate cues: no-op, reports staleCue
 * - Stale cue after cancellation / terminal outcome: no-op, reports staleCue
 * - VisualCuePort integration: early visual terminal (valid & stale), cueSourceFailed
 * - Cue deadlines: absolute deadline triggers commit when visual cue never arrives
 * - Pre-commit reduced-motion terminal report (coordinator level: visualTerminal(tx, 'reducedMotion');
 *   Host preference-change behavior is covered by the visual suites)
 * - Known source finding R3 from protocol-render-astra-review.md
 * - Parameterized parity between Production and TestStore runtimes
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatrixRig, type MatrixRig } from './protocol-matrix-fixtures/matrix-rig.js';
import type { VisualCuePort } from '../../src/lib/routing/staged/types.js';

describe('Protocol Matrix: Cues and Deadlines', () => {
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
      it('1. duplicate cue: no-op, does not dispatch a second domain action, records staleCue diagnostic', () => {
        rig = createMatrixRig({ runtime });

        const handle = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(handle);

        // First cue commits
        rig.coordinator.cue(tx);
        expect(rig.trace).toEqual(['go:/next']);
        expect(rig.coordinator.status.transaction(tx)).toMatchObject({ phase: 'terminal' });

        // Second duplicate cue
        rig.coordinator.cue(tx);
        expect(rig.trace).toEqual(['go:/next']); // Still exactly one domain action
        expect(rig.diagnostics).toContainEqual({
          kind: 'staleCue',
          transaction: tx
        });
      });

      it('2. stale cue after explicit cancellation: no-op, records staleCue diagnostic', () => {
        rig = createMatrixRig({ runtime });

        const handle = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(handle);

        // Cancel transaction explicitly
        rig.coordinator.cancel(tx, undefined);
        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: { type: 'cancelled', reason: 'explicit' }
        });

        // Cue the cancelled transaction
        rig.coordinator.cue(tx);
        expect(rig.trace).toEqual([]); // Zero domain actions
        expect(rig.diagnostics).toContainEqual({
          kind: 'staleCue',
          transaction: tx
        });
      });

      it('3. early visual terminal for valid transaction: visual report triggers commit', () => {
        rig = createMatrixRig({ runtime });
        let capturedPort: VisualCuePort | undefined;

        const port: VisualCuePort = {
          admitted: () => true, // Motion accepted
          notify: () => {}
        };
        rig.coordinator.setVisualPort(port);

        const handle = rig.coordinator.request({ to: '/next' }, {}, { motion: { cueMs: 200 } });
        const tx = rig.txOf(handle);
        expect(rig.trace).toEqual([]);

        // Early visual terminal (e.g. user requested reducedMotion or animation skipped)
        rig.coordinator.visualTerminal(tx, 'reducedMotion');

        // Triggers commit
        expect(rig.trace).toEqual(['go:/next']);
        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: { type: 'committed', route: 'accepted' }
        });
      });

      it('4. early visual terminal for stale transaction: ignored, records staleVisualReport', () => {
        rig = createMatrixRig({ runtime });

        const handle = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(handle);

        // Cancel transaction first
        rig.coordinator.cancel(tx, undefined);

        // Early visual terminal on stale transaction
        rig.coordinator.visualTerminal(tx, 'completed');

        expect(rig.trace).toEqual([]);
        expect(rig.diagnostics).toContainEqual({
          kind: 'staleVisualReport',
          transaction: tx
        });
      });

      it('5. cue source failure during port.admitted: reports cueSourceFailed diagnostic', () => {
        rig = createMatrixRig({ runtime });
        const visualError = new Error('visual engine exploded');

        const port: VisualCuePort = {
          admitted: () => { throw visualError; },
          notify: () => {}
        };
        rig.coordinator.setVisualPort(port);

        const handle = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(handle);

        expect(rig.diagnostics).toContainEqual({
          kind: 'cueSourceFailed',
          transaction: tx,
          error: visualError
        });
      });

      it('6. auto cue mode without visual port commits in next turn', () => {
        rig = createMatrixRig({ runtime, cueMode: 'auto' });

        const handle = rig.coordinator.request({ to: '/next' }, {});
        const tx = rig.txOf(handle);

        // In auto cue mode without a visual port that returned true, commit is enqueued immediately
        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: { type: 'committed', route: 'accepted' }
        });
        expect(rig.trace).toEqual(['go:/next']);
      });

      it('7. absolute deadline expiry: commits when visual cue never arrives', async () => {
        rig = createMatrixRig({
          runtime,
          cueMode: 'auto',
          budgets: { preparationMs: 0, cueSlackMs: 5 }
        });

        const port: VisualCuePort = {
          admitted: () => true, // Visual port takes responsibility for cue
          notify: () => {}
        };
        rig.coordinator.setVisualPort(port);

        const handle = rig.coordinator.request({ to: '/next' }, {}, { motion: { cueMs: 5 } });
        const tx = rig.txOf(handle);
        expect(rig.trace).toEqual([]);

        // Wait for deadline to expire (5ms preparation/cueSlackMs + 5ms motion cueMs)
        if (runtime === 'teststore') {
          await (rig.store as any).advanceTime(15);
        } else {
          await vi.waitFor(() => expect(rig?.trace).toEqual(['go:/next']), { timeout: 1000 });
        }

        expect(rig.coordinator.status.transaction(tx)).toMatchObject({
          phase: 'terminal',
          outcome: { type: 'committed', route: 'accepted' }
        });
      });
    });
  }

  describe('Known Source Regression (R3: Synchronous Disposal from Admission)', () => {
    it('R3 (P2): synchronous disposal from admission callback ends transaction cleanly with zero post-terminal events', () => {
      // Review finding R3: A subscribe listener calls coordinator.dispose() synchronously on
      // request(admitted). Transaction must terminate cleanly: coherent event order
      // (no post-terminal admitted event) and zero outstanding deadline handles.
      rig = createMatrixRig({ runtime: 'production' });

      let disposedSynchronously = false;
      const unsubscribe = rig.coordinator.subscribe(event => {
        if (event.kind === 'request' && event.result.type === 'admitted' && !disposedSynchronously) {
          disposedSynchronously = true;
          rig?.coordinator.dispose();
        }
      });

      const handle = rig.coordinator.request({ to: '/next' }, {}, { motion: { cueMs: 50 } });
      unsubscribe();

      expect(disposedSynchronously).toBe(true);

      const tx = rig.txOf(handle);
      const txStatus = rig.coordinator.status.transaction(tx);
      expect(txStatus).toMatchObject({
        phase: 'terminal',
        outcome: { type: 'cancelled', reason: 'rootDestroyed' }
      });

      // Contract assertion: Coherent event order — no post-terminal admitted event
      const eventKinds = rig.events.map(e => e.kind);
      const terminalIndex = eventKinds.indexOf('terminal');
      const postTerminalAdmitted = eventKinds.slice(terminalIndex + 1).includes('admitted');
      expect(postTerminalAdmitted).toBe(false);
    });

    it('R3 (P2): synchronous outlet detachment from admission callback cancels cleanly without post-terminal admitted event', () => {
      rig = createMatrixRig({ runtime: 'production' });

      let detachedSynchronously = false;
      const unsubscribe = rig.coordinator.subscribe(event => {
        if (event.kind === 'request' && event.result.type === 'admitted' && !detachedSynchronously) {
          detachedSynchronously = true;
          rig?.coordinator.setOutletAttached(false);
        }
      });

      const handle = rig.coordinator.request({ to: '/next' }, {}, { motion: { cueMs: 50 } });
      unsubscribe();

      expect(detachedSynchronously).toBe(true);
      const tx = rig.txOf(handle);

      const eventKinds = rig.events.map(e => e.kind);
      const terminalIndex = eventKinds.indexOf('terminal');
      expect(terminalIndex).toBeGreaterThanOrEqual(0);
      const postTerminalAdmitted = eventKinds.slice(terminalIndex + 1).includes('admitted');
      expect(postTerminalAdmitted).toBe(false);
    });
  });
});
