/**
 * Protocol Matrix: Cross-Engine Production and TestStore Queue Parity
 *
 * Verifies exact transcript, domain action, and physical history write
 * parity between Production Store and TestStore TurnQueue execution under:
 * specs/frontend/fluid-layout-motion-design.md, Proof section.
 *
 * Direct external coordinator over the same TestStore queue establishes
 * queue-level execution parity.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatrixRig, type MatrixRig } from './protocol-matrix-fixtures/matrix-rig.js';
import { capturedView } from '../../src/lib/execution/store-access.js';

describe('Protocol Matrix: Production vs TestStore Queue Parity', () => {
  let prodRig: MatrixRig | undefined;
  let testRig: MatrixRig | undefined;

  afterEach(() => {
    const reported = [...(prodRig?.reported ?? []), ...(testRig?.reported ?? [])];
    prodRig?.destroy();
    testRig?.destroy();
    prodRig = undefined;
    testRig = undefined;
    vi.restoreAllMocks();
    expect(reported).toEqual([]);
  });

  it('1. parity: admitted -> cue -> commit produces identical transcripts and history writes', () => {
    prodRig = createMatrixRig({ runtime: 'production' });
    testRig = createMatrixRig({ runtime: 'teststore' });

    const prodHandle = prodRig.coordinator.request({ to: '/next' }, {});
    const testHandle = testRig.coordinator.request({ to: '/next' }, {});

    expect(prodHandle.status).toEqual(testHandle.status);

    prodRig.coordinator.cue(prodRig.txOf(prodHandle));
    testRig.coordinator.cue(testRig.txOf(testHandle));

    expect(prodRig.trace).toEqual(testRig.trace);
    expect(prodRig.trace).toEqual(['go:/next']);

    expect(prodRig.port.push).toHaveBeenCalledOnce();
    expect(testRig.port.push).toHaveBeenCalledOnce();

    expect(prodRig.events).toEqual(testRig.events);
  });

  it('2. parity: supersession flow produces identical transcripts across runtimes', () => {
    prodRig = createMatrixRig({ runtime: 'production' });
    testRig = createMatrixRig({ runtime: 'teststore' });

    const prodFirst = prodRig.coordinator.request({ to: '/first' }, {});
    const testFirst = testRig.coordinator.request({ to: '/first' }, {});

    const prodSecond = prodRig.coordinator.request({ to: '/second' }, {});
    const testSecond = testRig.coordinator.request({ to: '/second' }, {});

    prodRig.coordinator.cue(prodRig.txOf(prodSecond));
    testRig.coordinator.cue(testRig.txOf(testSecond));

    expect(prodRig.trace).toEqual(testRig.trace);
    expect(prodRig.events).toEqual(testRig.events);
  });

  it('3. parity: degraded unavailable flow produces identical single domain action and status', () => {
    prodRig = createMatrixRig({ runtime: 'production', bind: false });
    testRig = createMatrixRig({ runtime: 'teststore', bind: false });

    const prodHandle = prodRig.coordinator.request({ to: '/degraded' }, {});
    const testHandle = testRig.coordinator.request({ to: '/degraded' }, {});

    expect(prodHandle.status).toEqual(testHandle.status);
    expect(prodRig.trace).toEqual(testRig.trace);
    expect(prodRig.trace).toEqual(['go:/degraded']);
    expect(prodRig.events).toEqual(testRig.events);
  });

  it('4. parity: owner retirement cancellation and subsequent stale request match identically', () => {
    prodRig = createMatrixRig({ runtime: 'production' });
    testRig = createMatrixRig({ runtime: 'teststore' });

    const prodView = prodRig.childView();
    const testView = testRig.childView();

    const prodCapture = capturedView(prodView);
    const testCapture = capturedView(testView);

    const prodSource = {
      owner: prodCapture.origin,
      ownerLive: () => prodCapture.isLive(),
      observeRetirement: (retired: () => void) => {
        let active = true;
        const record = prodCapture.registerResource({
          kind: 'subscription',
          cleanup: () => { if (active) retired(); }
        });
        return () => { active = false; record.dispose(); };
      }
    };

    const testSource = {
      owner: testCapture.origin,
      ownerLive: () => testCapture.isLive(),
      observeRetirement: (retired: () => void) => {
        let active = true;
        const record = testCapture.registerResource({
          kind: 'subscription',
          cleanup: () => { if (active) retired(); }
        });
        return () => { active = false; record.dispose(); };
      }
    };

    const prodHandle = prodRig.coordinator.request({ to: '/next' }, prodSource);
    const testHandle = testRig.coordinator.request({ to: '/next' }, testSource);

    // Trigger retirement
    prodRig.store.dispatch({ type: 'replace' });
    testRig.store.dispatch({ type: 'replace' });

    expect(prodRig.coordinator.status.transaction(prodRig.txOf(prodHandle))).toEqual(
      testRig.coordinator.status.transaction(testRig.txOf(testHandle))
    );

    // Subsequent request from retired owner
    const prodLate = prodRig.coordinator.request({ to: '/next' }, {
      owner: prodCapture.origin,
      ownerLive: () => prodCapture.isLive()
    });
    const testLate = testRig.coordinator.request({ to: '/next' }, {
      owner: testCapture.origin,
      ownerLive: () => testCapture.isLive()
    });

    expect(prodLate.status).toEqual(testLate.status);
    expect(prodLate.status).toEqual({ type: 'stale', reason: 'ownerRetired' });
  });
});
