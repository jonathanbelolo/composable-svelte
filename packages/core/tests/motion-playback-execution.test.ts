// @vitest-environment jsdom
import { it, expect, vi, describe } from 'vitest';
import { ResourceScope, safeCleanup, type CleanupFunction } from '../src/lib/execution/resources.js';
import type { MotionClock } from '../src/lib/application/renderer/motion-run.js';
import {
  TargetRegistry,
  type BindingTarget,
  type RootTargetResources,
  type MotionBinding,
} from '../src/lib/application/renderer/target-registry.js';
import { normalizeMotionValue, type MotionProperty } from '../src/lib/application/motion/properties.js';
import type { CompiledTrack, CompiledMotion } from '../src/lib/application/motion/compiler.js';
import type { PlayDecision } from '../src/lib/application/motion/playback-plan.js';
import type { MotionEngineHandle, MotionTrackSpec, EngineSettlement } from '../src/lib/application/renderer/motion-engine.js';
import { createMotionPlayback, type MotionPlaybackPlay } from '../src/lib/application/renderer/motion-playback.js';

interface ControlledHandle {
  readonly track: MotionTrackSpec;
  readonly write: (value: string) => void;
  readonly handle: MotionEngineHandle;
  readonly stopCount: number;
  complete(): void;
  fail(error: unknown): void;
  stop(): void;
}

function createControlledHandle(
  track: MotionTrackSpec,
  write: (value: string) => void,
  options?: {
    readonly onStop?: (write: (value: string) => void) => void;
    readonly syncSettlement?: EngineSettlement;
  },
): ControlledHandle {
  let resolveSettled!: (settlement: EngineSettlement) => void;
  const settledPromise = options?.syncSettlement
    ? Promise.resolve(options.syncSettlement)
    : new Promise<EngineSettlement>((resolve) => {
        resolveSettled = resolve;
      });

  let stopCalls = 0;
  let isSettled = options?.syncSettlement !== undefined;

  const handle: MotionEngineHandle = {
    stop() {
      stopCalls++;
      if (options?.onStop) {
        options.onStop(write);
      }
      if (!isSettled) {
        isSettled = true;
        resolveSettled({ status: 'stopped' });
      }
    },
    settled: settledPromise,
  };

  return {
    track,
    write,
    handle,
    get stopCount() {
      return stopCalls;
    },
    complete() {
      if (!isSettled) {
        isSettled = true;
        resolveSettled({ status: 'completed' });
      }
    },
    fail(error: unknown) {
      if (!isSettled) {
        isSettled = true;
        resolveSettled({ status: 'failed', error });
      }
    },
    stop() {
      handle.stop();
    },
  };
}

interface TrackDefinition {
  readonly target: string;
  readonly property: MotionProperty;
  readonly from: string | number;
  readonly to: string | number;
  readonly startMs: number;
  readonly durationMs: number;
  readonly easing?: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

function createMultiTrackPlayDecision(
  tracks: readonly TrackDefinition[],
  stable: Record<string, Record<string, string>>,
): PlayDecision<any> {
  let totalDuration = 0;
  const compiledTracks = tracks.map((t) => {
    const fromNorm = normalizeMotionValue(t.property, t.from);
    const toNorm = normalizeMotionValue(t.property, t.to);
    totalDuration = Math.max(totalDuration, t.startMs + t.durationMs);
    return Object.freeze({
      target: t.target,
      startMs: t.startMs,
      durationMs: t.durationMs,
      properties: Object.freeze([
        Object.freeze({
          property: t.property,
          from: fromNorm,
          to: toNorm,
          interpolation: Object.freeze({ native: true, ticker: true, fallback: 'stable' as const }),
        }),
      ]),
      easing: t.easing ?? ('linear' as const),
      channel: 'default',
      priority: 0,
      optional: false,
      available: 'ready' as const,
    });
  });

  const frozenStable: Record<string, Record<string, string>> = {};
  for (const [target, props] of Object.entries(stable)) {
    frozenStable[target] = Object.freeze({ ...props });
  }

  const compiled: CompiledMotion<any> = Object.freeze({
    tracks: Object.freeze(compiledTracks) as readonly CompiledTrack<any>[],
    durationMs: totalDuration,
    outcome: 'playback' as const,
    missingRequired: Object.freeze([]),
    skippedOptional: Object.freeze([]),
    tokens: Object.freeze({
      durationMs: totalDuration,
      easing: 'linear' as const,
      amplitude: 1,
      reduction: 'instant' as const,
      disabled: false,
      reduced: false,
    }),
    stable: Object.freeze(frozenStable),
  });

  return Object.freeze({
    kind: 'play' as const,
    compiled,
    publishable: compiled.stable,
    stable: compiled.stable,
  });
}

interface TestFixture {
  readonly registry: TargetRegistry;
  readonly node: HTMLElement;
  readonly writeTrace: Array<{ property: string; value: string }>;
  readonly binding: MotionBinding;
  readonly clockScheduleCount: () => number;
  dispose(): void;
}

function createTestFixture(options?: {
  readonly targetName?: string;
  readonly properties?: readonly MotionProperty[];
  readonly initialStable?: Record<string, string>;
  readonly channel?: string;
  readonly priority?: number;
  readonly customNode?: HTMLElement;
}): TestFixture {
  const targetName = options?.targetName ?? 'surface';
  const properties = options?.properties ?? (['opacity'] as const);
  const initialStable = options?.initialStable ?? { opacity: '0.5' };
  const channel = options?.channel ?? 'test-channel';
  const priority = options?.priority ?? 0;

  const node = options?.customNode ?? document.createElement('div');
  const writeTrace: Array<{ property: string; value: string }> = [];

  const nativeSetProperty = node.style.setProperty;
  node.style.setProperty = function (
    this: CSSStyleDeclaration,
    property: string,
    value: string,
    priorityAttr?: string,
  ): void {
    writeTrace.push({ property, value });
    nativeSetProperty.call(this, property, value, priorityAttr ?? '');
  };

  const root = {};
  const scope = new ResourceScope();
  let scheduledTimers = 0;
  const clock: MotionClock = {
    schedule(_delayMs: number, _callback: () => void): CleanupFunction {
      scheduledTimers++;
      return () => {};
    },
  };

  const rootResources: RootTargetResources = {
    clock,
    register: (opts) => scope.createRecord(opts),
    observeCleanup: (cleanup) => {
      void safeCleanup(cleanup);
    },
  };

  const registry = new TargetRegistry(root, () => true, undefined, rootResources, clock);
  registry.attach();

  const bindingTarget: BindingTarget = {
    name: targetName,
    node,
    properties,
    stable: initialStable,
  };

  const binding = registry.bind(registry.rootOwner, [bindingTarget], {
    channel,
    priority,
  });

  return {
    registry,
    node,
    writeTrace,
    binding,
    clockScheduleCount: () => scheduledTimers,
    dispose() {
      binding.release();
      registry.dispose();
      scope.dispose();
    },
  };
}

describe('Motion playback execution and lease coordination (Proofs 6-9)', () => {
  it('proof 6: sequential same-address tracks retain absolute startMs, take one lease, create both handles up front, and unlock after completed only', async () => {
    const fixture = createTestFixture();
    const handles: ControlledHandle[] = [];
    const play: MotionPlaybackPlay = (track, write) => {
      const controlled = createControlledHandle(track, write);
      handles.push(controlled);
      return controlled.handle;
    };

    const leaseSpy = vi.spyOn(fixture.binding, 'lease');

    const decision = createMultiTrackPlayDecision(
      [
        { target: 'surface', property: 'opacity', from: 0, to: 0.5, startMs: 100, durationMs: 200 },
        { target: 'surface', property: 'opacity', from: 0.5, to: 1, startMs: 300, durationMs: 400 },
      ],
      { surface: { opacity: '1' } },
    );

    const playback = createMotionPlayback(fixture.binding, { play });
    const run = playback.request(decision);
    expect(run).toBeDefined();
    if (!run) throw new Error('Expected run');

    // Takes exactly one lease for the address
    expect(leaseSpy).toHaveBeenCalledTimes(1);

    // Both handles are created up front
    expect(handles).toHaveLength(2);

    // Absolute timing is retained without shifting
    expect(handles[0]!.track.startMs).toBe(100);
    expect(handles[0]!.track.durationMs).toBe(200);
    expect(handles[1]!.track.startMs).toBe(300);
    expect(handles[1]!.track.durationMs).toBe(400);

    // Initial write through lease is earliest track from.css ('0')
    expect(fixture.node.style.opacity).toBe('0');

    // Later track 1 sink write is suppressed while track 0 is incomplete
    handles[1]!.write('0.9');
    expect(fixture.node.style.opacity).toBe('0');

    // Earlier track 0 sink write goes through
    handles[0]!.write('0.4');
    expect(fixture.node.style.opacity).toBe('0.4');

    // Track 0 completes; unlocks track 1
    handles[0]!.complete();
    await Promise.resolve();
    await Promise.resolve();

    handles[1]!.write('0.85');
    expect(fixture.node.style.opacity).toBe('0.85');

    // Track 1 completes; whole run settles completed
    handles[1]!.complete();
    const receipt = await run.settled;
    expect(receipt.outcome).toEqual({ status: 'completed' });
    expect(receipt.current).toBe(true);

    // Node reflects final published stable value
    expect(fixture.node.style.opacity).toBe('1');
    fixture.dispose();
  });

  it('proof 6: stopped predecessor never unlocks successor sink', async () => {
    const fixture = createTestFixture();
    const handles: ControlledHandle[] = [];
    const play: MotionPlaybackPlay = (track, write) => {
      const controlled = createControlledHandle(track, write);
      handles.push(controlled);
      return controlled.handle;
    };

    const decision = createMultiTrackPlayDecision(
      [
        { target: 'surface', property: 'opacity', from: 0, to: 0.5, startMs: 0, durationMs: 150 },
        { target: 'surface', property: 'opacity', from: 0.5, to: 1, startMs: 150, durationMs: 250 },
      ],
      { surface: { opacity: '1' } },
    );

    const playback = createMotionPlayback(fixture.binding, { play });
    const run = playback.request(decision);
    expect(run).toBeDefined();

    expect(handles).toHaveLength(2);
    expect(fixture.node.style.opacity).toBe('0');

    // Earlier handle stops instead of completing
    handles[0]!.stop();
    await Promise.resolve();
    await Promise.resolve();

    // Track 1 sink attempt remains gated and never writes
    handles[1]!.write('0.77');
    expect(fixture.node.style.opacity).toBe('0');

    fixture.dispose();
  });

  it('proof 6: an out-of-order successor completion does not unlock its own sink', async () => {
    const fixture = createTestFixture();
    const handles: ControlledHandle[] = [];
    const playback = createMotionPlayback(fixture.binding, {
      play: (track, write) => {
        const controlled = createControlledHandle(track, write);
        handles.push(controlled);
        return controlled.handle;
      },
    });
    const decision = createMultiTrackPlayDecision(
      [
        { target: 'surface', property: 'opacity', from: 0, to: 0.5, startMs: 0, durationMs: 100 },
        { target: 'surface', property: 'opacity', from: 0.5, to: 1, startMs: 100, durationMs: 100 },
      ],
      { surface: { opacity: '1' } },
    );

    const run = playback.request(decision);
    expect(run).toBeDefined();
    handles[1]!.complete();
    await Promise.resolve();
    await Promise.resolve();
    handles[1]!.write('0.9');
    expect(fixture.node.style.opacity).toBe('0');

    handles[0]!.complete();
    expect((await run!.settled).outcome).toEqual({ status: 'completed' });
    expect(fixture.node.style.opacity).toBe('1');
    fixture.dispose();
  });

  it('proof 6: failed predecessor rejects execution and keeps successor sink suppressed', async () => {
    const fixture = createTestFixture();
    const handles: ControlledHandle[] = [];
    const play: MotionPlaybackPlay = (track, write) => {
      const controlled = createControlledHandle(track, write);
      handles.push(controlled);
      return controlled.handle;
    };

    const decision = createMultiTrackPlayDecision(
      [
        { target: 'surface', property: 'opacity', from: 0, to: 0.5, startMs: 0, durationMs: 100 },
        { target: 'surface', property: 'opacity', from: 0.5, to: 1, startMs: 100, durationMs: 200 },
      ],
      { surface: { opacity: '1' } },
    );

    const playback = createMotionPlayback(fixture.binding, { play });
    const run = playback.request(decision);
    expect(run).toBeDefined();
    if (!run) throw new Error('Expected run');

    const trackError = new Error('Predecessor track failure');
    handles[0]!.fail(trackError);

    const receipt = await run.settled;
    expect(receipt.outcome.status).toBe('failed');
    if (receipt.outcome.status === 'failed') {
      expect(receipt.outcome.error).toBe(trackError);
    }

    // Successor attempt after failure is suppressed
    handles[1]!.write('0.95');
    expect(fixture.node.style.opacity).not.toBe('0.95');

    fixture.dispose();
  });

  it('proof 7: hostile stop attempts write but sink closure and engine stop precede lease release exposing latest stable', async () => {
    const fixture = createTestFixture({ initialStable: { opacity: '0.5' } });
    let hostileWriteAttempted = false;
    let engineStopCalled = false;
    let leaseReleaseOrder = -1;
    let engineStopOrder = -1;
    let callIndex = 0;

    const originalRelease = fixture.binding.lease.bind(fixture.binding);
    vi.spyOn(fixture.binding, 'lease').mockImplementation((target, prop, run, cleanup) => {
      const acquired = originalRelease(target, prop, run, () => {
        leaseReleaseOrder = ++callIndex;
        cleanup?.();
      });
      return acquired;
    });

    const play: MotionPlaybackPlay = (track, write) => {
      return {
        stop() {
          engineStopCalled = true;
          engineStopOrder = ++callIndex;
          hostileWriteAttempted = true;
          write('0.999-hostile');
        },
        settled: new Promise<EngineSettlement>(() => {}),
      };
    };

    const decision = createMultiTrackPlayDecision(
      [{ target: 'surface', property: 'opacity', from: 0, to: 1, startMs: 0, durationMs: 300 }],
      { surface: { opacity: '1' } },
    );

    const playback = createMotionPlayback(fixture.binding, { play });
    const run = playback.request(decision);
    expect(run).toBeDefined();
    if (!run) throw new Error('Expected run');

    // Initial playable from.css ('0') was written through lease
    expect(fixture.node.style.opacity).toBe('0');

    // Supersede the run by releasing the binding (triggering run disposal and stopAll)
    fixture.binding.release();
    const receipt = await run.settled;
    expect(receipt.outcome.status).toBe('disposed');

    expect(engineStopCalled).toBe(true);
    expect(hostileWriteAttempted).toBe(true);

    // Engine stop must occur before lease release
    expect(engineStopOrder).toBeGreaterThan(0);
    expect(leaseReleaseOrder).toBeGreaterThan(engineStopOrder);

    // Hostile write was completely suppressed; final node value is latest stable ('1')
    expect(fixture.writeTrace.some((w) => w.value === '0.999-hostile')).toBe(false);
    expect(fixture.node.style.opacity).toBe('1');
    expect(fixture.writeTrace[fixture.writeTrace.length - 1]?.value).toBe('1');

    fixture.dispose();
  });

  it('proof 8: synchronous engine throw rolls back all leases, stops started handles, fails run, and leaves no stale write', async () => {
    const fixture = createTestFixture({
      properties: ['opacity', 'transform'],
      initialStable: { opacity: '0.5', transform: 'scale(1)' },
    });

    let opacityStopCount = 0;
    const play: MotionPlaybackPlay = (track, write) => {
      if (track.property === 'opacity') {
        return {
          stop() {
            opacityStopCount++;
          },
          settled: new Promise<EngineSettlement>(() => {}),
        };
      }
      throw new Error('Engine start boom');
    };

    const decision = createMultiTrackPlayDecision(
      [
        { target: 'surface', property: 'opacity', from: 0, to: 1, startMs: 0, durationMs: 200 },
        { target: 'surface', property: 'transform', from: 'scale(1)', to: 'scale(2)', startMs: 0, durationMs: 200 },
      ],
      { surface: { opacity: '1', transform: 'scale(2)' } },
    );

    const playback = createMotionPlayback(fixture.binding, { play });
    const run = playback.request(decision);
    expect(run).toBeDefined();
    if (!run) throw new Error('Expected run');

    const receipt = await run.settled;
    expect(receipt.outcome.status).toBe('failed');
    if (receipt.outcome.status === 'failed') {
      expect((receipt.outcome.error as Error).message).toBe('Engine start boom');
    }

    // Already-started opacity handle was stopped
    expect(opacityStopCount).toBe(1);

    // All leases rolled back: authority stable values restored, no stale '0' or 'scale(1)'
    expect(fixture.node.style.opacity).toBe('1');
    expect(fixture.node.style.transform).toBe('scale(2)');

    fixture.dispose();
  });

  it('proof 8: partial lease acquisition throw rolls back already acquired leases and fails without stale write', async () => {
    const fixture = createTestFixture({
      properties: ['opacity', 'transform'],
      initialStable: { opacity: '0.5', transform: 'scale(1)' },
    });

    let leaseCalls = 0;
    const originalLease = fixture.binding.lease.bind(fixture.binding);
    vi.spyOn(fixture.binding, 'lease').mockImplementation((target, prop, runCtx, cleanup) => {
      leaseCalls++;
      if (leaseCalls === 2) {
        throw new Error('Partial lease acquisition rejected');
      }
      return originalLease(target, prop, runCtx, cleanup);
    });

    const play: MotionPlaybackPlay = (_track, _write) => {
      return {
        stop() {},
        settled: new Promise<EngineSettlement>(() => {}),
      };
    };

    const decision = createMultiTrackPlayDecision(
      [
        { target: 'surface', property: 'opacity', from: 0, to: 1, startMs: 0, durationMs: 200 },
        { target: 'surface', property: 'transform', from: 'scale(1)', to: 'scale(2)', startMs: 0, durationMs: 200 },
      ],
      { surface: { opacity: '1', transform: 'scale(2)' } },
    );

    const playback = createMotionPlayback(fixture.binding, { play });
    const run = playback.request(decision);
    expect(run).toBeDefined();
    if (!run) throw new Error('Expected run');

    const receipt = await run.settled;
    expect(receipt.outcome.status).toBe('failed');
    if (receipt.outcome.status === 'failed') {
      expect((receipt.outcome.error as Error).message).toBe('Partial lease acquisition rejected');
    }

    // Acquired first lease was rolled back, stable value restored
    expect(fixture.node.style.opacity).toBe('1');
    expect(fixture.node.style.transform).toBe('scale(2)');

    fixture.dispose();
  });

  it('proof 9: two bindings on one node own independent opacity/transform addresses and replacing opacity never stops transform', async () => {
    const node = document.createElement('div');
    const fixtureOpacity = createTestFixture({
      targetName: 'surface',
      properties: ['opacity'],
      initialStable: { opacity: '0.5' },
      channel: 'opacity-channel',
      customNode: node,
    });
    const bindingTransform = fixtureOpacity.registry.bind(fixtureOpacity.registry.rootOwner, [{
      name: 'surface',
      node,
      properties: ['transform'],
      stable: { transform: 'scale(1)' },
    }], { channel: 'transform-channel', priority: 0 });

    let transformHandle!: ControlledHandle;
    const playTransform: MotionPlaybackPlay = (track, write) => {
      transformHandle = createControlledHandle(track, write);
      return transformHandle.handle;
    };

    const opacityHandles: ControlledHandle[] = [];
    const playOpacity: MotionPlaybackPlay = (track, write) => {
      const controlled = createControlledHandle(track, write);
      opacityHandles.push(controlled);
      return controlled.handle;
    };

    const playbackTransform = createMotionPlayback(bindingTransform, { play: playTransform });
    const playbackOpacity = createMotionPlayback(fixtureOpacity.binding, { play: playOpacity });

    const decisionTransform = createMultiTrackPlayDecision(
      [{ target: 'surface', property: 'transform', from: 'scale(1)', to: 'scale(2)', startMs: 0, durationMs: 400 }],
      { surface: { transform: 'scale(2)' } },
    );
    const runTransform = playbackTransform.request(decisionTransform);
    expect(runTransform).toBeDefined();
    if (!runTransform) throw new Error('Expected runTransform');

    // Transform active and writes to node
    transformHandle.write('scale(1.2)');
    expect(node.style.transform).toBe('scale(1.2)');

    // Start opacity run 1
    const decisionOpacity1 = createMultiTrackPlayDecision(
      [{ target: 'surface', property: 'opacity', from: 0.5, to: 0.8, startMs: 0, durationMs: 300 }],
      { surface: { opacity: '0.8' } },
    );
    const runOpacity1 = playbackOpacity.request(decisionOpacity1);
    expect(runOpacity1).toBeDefined();
    if (!runOpacity1) throw new Error('Expected runOpacity1');

    opacityHandles[0]!.write('0.6');
    expect(node.style.opacity).toBe('0.6');
    expect(node.style.transform).toBe('scale(1.2)');

    // Replace opacity with run 2
    const decisionOpacity2 = createMultiTrackPlayDecision(
      [{ target: 'surface', property: 'opacity', from: 0.6, to: 0.1, startMs: 0, durationMs: 300 }],
      { surface: { opacity: '0.1' } },
    );
    const runOpacity2 = playbackOpacity.request(decisionOpacity2);
    expect(runOpacity2).toBeDefined();

    // Opacity run 1 is superseded and stopped
    const receiptOpacity1 = await runOpacity1.settled;
    expect(receiptOpacity1.outcome.status).toBe('superseded');
    expect(opacityHandles[0]!.stopCount).toBe(1);

    // Transform was NEVER stopped or disrupted
    expect(runTransform.live).toBe(true);
    expect(transformHandle.stopCount).toBe(0);

    // Transform continues writing authoritatively
    transformHandle.write('scale(1.7)');
    expect(node.style.transform).toBe('scale(1.7)');

    // Transform completes normally
    transformHandle.complete();
    const receiptTransform = await runTransform.settled;
    expect(receiptTransform.outcome).toEqual({ status: 'completed' });
    expect(node.style.transform).toBe('scale(2)');

    bindingTransform.release();
    fixtureOpacity.dispose();
  });

  it('controls: synchronously settled handle completes cleanly and liveness loss suppresses late writes with no unhandled rejection', async () => {
    const unhandledErrors: unknown[] = [];
    const onUnhandled = (error: unknown): void => {
      unhandledErrors.push(error);
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      const fixture = createTestFixture();

      // 1. Synchronous completion
      const syncPlay: MotionPlaybackPlay = (track, write) => {
        return {
          stop() {},
          settled: Promise.resolve({ status: 'completed' as const }),
        };
      };

      const decisionSync = createMultiTrackPlayDecision(
        [{ target: 'surface', property: 'opacity', from: 0, to: 1, startMs: 0, durationMs: 100 }],
        { surface: { opacity: '1' } },
      );

      const playbackSync = createMotionPlayback(fixture.binding, { play: syncPlay });
      const runSync = playbackSync.request(decisionSync);
      expect(runSync).toBeDefined();
      if (!runSync) throw new Error('Expected runSync');

      const syncReceipt = await runSync.settled;
      expect(syncReceipt.outcome).toEqual({ status: 'completed' });
      expect(fixture.node.style.opacity).toBe('1');

      // 2. Late write after liveness loss is suppressed
      let capturedSink!: (val: string) => void;
      let lateReject!: (err: unknown) => void;
      const asyncPlay: MotionPlaybackPlay = (track, write) => {
        capturedSink = write;
        return {
          stop() {},
          settled: new Promise<EngineSettlement>((_resolve, reject) => {
            lateReject = reject;
          }),
        };
      };

      const decisionAsync = createMultiTrackPlayDecision(
        [{ target: 'surface', property: 'opacity', from: 0.2, to: 0.9, startMs: 0, durationMs: 200 }],
        { surface: { opacity: '0.9' } },
      );

      const playbackAsync = createMotionPlayback(fixture.binding, { play: asyncPlay });
      const runAsync = playbackAsync.request(decisionAsync);
      expect(runAsync).toBeDefined();
      if (!runAsync) throw new Error('Expected runAsync');

      expect(fixture.node.style.opacity).toBe('0.2');

      // Cancel/supersede run
      fixture.binding.release();
      const asyncReceipt = await runAsync.settled;
      expect(asyncReceipt.outcome.status).toBe('disposed');

      // Late write after disposal is dropped
      capturedSink('0.999-late');
      expect(fixture.node.style.opacity).not.toBe('0.999-late');

      // 3. Late rejection after stop does not produce unhandled rejection
      lateReject(new Error('Late engine error after stop'));
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(unhandledErrors).toHaveLength(0);

      fixture.dispose();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('controls: reentrant stop calls handle.stop at most once across address and whole-run cleanup', async () => {
    const fixture = createTestFixture();
    let stopCalls = 0;

    const play: MotionPlaybackPlay = (_track, _write) => {
      return {
        stop() {
          stopCalls++;
        },
        settled: new Promise<EngineSettlement>(() => {}),
      };
    };

    const decision = createMultiTrackPlayDecision(
      [{ target: 'surface', property: 'opacity', from: 0, to: 1, startMs: 0, durationMs: 150 }],
      { surface: { opacity: '1' } },
    );

    const playback = createMotionPlayback(fixture.binding, { play });
    const run = playback.request(decision);
    expect(run).toBeDefined();

    // Reentrant supersession
    fixture.binding.release();
    expect(stopCalls).toBe(1);

    // Further disposal calls do not re-stop
    fixture.dispose();
    expect(stopCalls).toBe(1);
  });
});
