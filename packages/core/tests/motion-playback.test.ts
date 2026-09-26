// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import {
  TargetRegistry,
  type BindingTarget,
  type MotionBinding,
  type RootTargetResources,
} from '../src/lib/application/renderer/target-registry.js';
import {
  ResourceScope,
  safeCleanup,
  type CleanupFunction,
  type ResourceRecordOptions,
} from '../src/lib/execution/resources.js';
import type { MotionClock, MotionRun } from '../src/lib/application/renderer/motion-run.js';
import {
  createMotionPlayback,
  type MotionPlaybackPlay,
} from '../src/lib/application/renderer/motion-playback.js';
import { defineMotionRecipe } from '../src/lib/application/motion/compiler.js';
import {
  planPlayback,
  type PlaybackDecision,
  type PlaybackRequest,
} from '../src/lib/application/motion/playback-plan.js';
import type { MotionProperty } from '../src/lib/application/motion/properties.js';
import type {
  EngineSettlement,
  MotionEngineHandle,
  MotionTrackSpec,
} from '../src/lib/application/renderer/motion-engine.js';

interface ScheduledTimer {
  readonly delayMs: number;
  readonly callback: () => void;
  cancelled: boolean;
}

class CountingMotionClock implements MotionClock {
  public scheduledTotal = 0;
  public schedulesSinceReset = 0;
  public readonly timers: ScheduledTimer[] = [];

  schedule(delayMs: number, callback: () => void): CleanupFunction {
    this.scheduledTotal++;
    this.schedulesSinceReset++;
    const timer: ScheduledTimer = { delayMs, callback, cancelled: false };
    this.timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  }

  resetNewWorkCounter(): void {
    this.schedulesSinceReset = 0;
  }

  fireWatchdog(): void {
    const active = this.timers.filter((t) => !t.cancelled);
    for (const timer of active) {
      timer.cancelled = true;
      timer.callback();
    }
  }
}

interface RecordedWrite {
  readonly property: string;
  readonly value: string;
}

interface RecordingElementBundle {
  readonly node: HTMLElement;
  readonly writes: readonly RecordedWrite[];
}

function createRecordingElement(): RecordingElementBundle {
  const node = document.createElement('div');
  const recordedWrites: RecordedWrite[] = [];
  const originalSetProperty = node.style.setProperty.bind(node.style);
  node.style.setProperty = (property: string, value: string | null, priority?: string): void => {
    if (value !== null) {
      recordedWrites.push(Object.freeze({ property, value }));
    }
    originalSetProperty(property, value, priority);
  };
  return {
    node,
    get writes(): readonly RecordedWrite[] {
      return recordedWrites;
    },
  };
}

interface FakeHandleControl {
  readonly spec: MotionTrackSpec;
  readonly write: (value: string) => void;
  stopCalled: boolean;
  stopHook?: () => void;
  settle(outcome: EngineSettlement): void;
}

class FakePlaybackEngine {
  public startsTotal = 0;
  public startsSinceReset = 0;
  public readonly handles: FakeHandleControl[] = [];

  readonly play: MotionPlaybackPlay = (track: MotionTrackSpec, write: (value: string) => void): MotionEngineHandle => {
    this.startsTotal++;
    this.startsSinceReset++;
    let settlePromise!: (result: EngineSettlement) => void;
    const settled = new Promise<EngineSettlement>((resolve) => {
      settlePromise = resolve;
    });
    const control: FakeHandleControl = {
      spec: track,
      write,
      stopCalled: false,
      settle: (outcome: EngineSettlement): void => {
        settlePromise(outcome);
      },
    };
    this.handles.push(control);
    return {
      stop: (): void => {
        control.stopCalled = true;
        control.stopHook?.();
        control.settle({ status: 'stopped' });
      },
      settled,
    };
  };

  resetNewWorkCounter(): void {
    this.startsSinceReset = 0;
  }
}

interface MultiTargetRig {
  readonly registry: TargetRegistry;
  readonly resources: ResourceScope;
  readonly clock: CountingMotionClock;
  readonly engine: FakePlaybackEngine;
  readonly bundles: readonly RecordingElementBundle[];
  readonly binding: MotionBinding;
  getLeaseCountSinceReset(): number;
  getWatchCountSinceReset(): number;
  resetNewWorkCounters(): void;
  cleanup(): Promise<void>;
}

function setupMultiTargetRig(
  targetConfigs: readonly {
    readonly name: string;
    readonly properties: readonly MotionProperty[];
    readonly stable: Record<string, string>;
  }[],
): MultiTargetRig {
  const clock = new CountingMotionClock();
  const engine = new FakePlaybackEngine();
  const resources = new ResourceScope();
  const root = {};

  const bundles: RecordingElementBundle[] = [];
  const targets: BindingTarget[] = [];
  for (const cfg of targetConfigs) {
    const bundle = createRecordingElement();
    bundles.push(bundle);
    targets.push({
      name: cfg.name,
      node: bundle.node,
      properties: cfg.properties,
      stable: cfg.stable,
    });
  }

  const rootResources: RootTargetResources = {
    clock,
    register: (options: Omit<ResourceRecordOptions, 'ownerToken'>) => resources.createRecord(options),
    observeCleanup: (cleanup: CleanupFunction) => {
      void safeCleanup(cleanup);
    },
  };

  const registry = new TargetRegistry(root, () => true, undefined, rootResources, clock);
  registry.attach();

  const binding = registry.bind(registry.rootOwner, targets, { channel: 'test', priority: 0 });

  let leasesSinceReset = 0;
  const originalLease = binding.lease.bind(binding);
  binding.lease = (target, property, run, cleanup) => {
    leasesSinceReset++;
    return originalLease(target, property, run, cleanup);
  };

  let watchesSinceReset = 0;
  const originalWatch = registry.preferences.watch.bind(registry.preferences);
  registry.preferences.watch = (nodes, onChange) => {
    watchesSinceReset++;
    return originalWatch(nodes, onChange);
  };

  const resetNewWorkCounters = (): void => {
    clock.resetNewWorkCounter();
    engine.resetNewWorkCounter();
    leasesSinceReset = 0;
    watchesSinceReset = 0;
  };

  const cleanup = async (): Promise<void> => {
    binding.release();
    registry.dispose();
    resources.dispose();
    await resources.whenCleanupsSettled();
  };

  return {
    registry,
    resources,
    clock,
    engine,
    bundles,
    binding,
    getLeaseCountSinceReset: () => leasesSinceReset,
    getWatchCountSinceReset: () => watchesSinceReset,
    resetNewWorkCounters,
    cleanup,
  };
}

interface TestRig {
  readonly registry: TargetRegistry;
  readonly resources: ResourceScope;
  readonly clock: CountingMotionClock;
  readonly engine: FakePlaybackEngine;
  readonly elementBundle: RecordingElementBundle;
  readonly binding: MotionBinding;
  getLeaseCountSinceReset(): number;
  getWatchCountSinceReset(): number;
  resetNewWorkCounters(): void;
  cleanup(): Promise<void>;
}

function setupRig(): TestRig {
  const multi = setupMultiTargetRig([
    {
      name: 'surface',
      properties: ['opacity', 'transform'],
      stable: { opacity: '0', transform: 'none' },
    },
  ]);
  return {
    registry: multi.registry,
    resources: multi.resources,
    clock: multi.clock,
    engine: multi.engine,
    elementBundle: multi.bundles[0]!,
    binding: multi.binding,
    getLeaseCountSinceReset: multi.getLeaseCountSinceReset,
    getWatchCountSinceReset: multi.getWatchCountSinceReset,
    resetNewWorkCounters: multi.resetNewWorkCounters,
    cleanup: multi.cleanup,
  };
}

const recipeABC = defineMotionRecipe({
  targets: { surface: { properties: ['opacity'] } },
  states: {
    A: { surface: { opacity: 0 } },
    B: { surface: { opacity: 0.5 } },
    C: { surface: { opacity: 1 } },
  },
  graph: {
    kind: 'track',
    target: 'surface',
    properties: ['opacity'],
    durationMs: 200,
  },
  interruption: 'replace',
});

it('proof 1: B playback then latest C survives completed without B restoration', async () => {
  const rig = setupRig();
  const playback = createMotionPlayback(rig.binding, { play: rig.engine.play });

  const decisionB = planPlayback(recipeABC, { from: 'A', to: 'B' });
  const decisionC = planPlayback(recipeABC, { from: 'B', to: 'C' });

  const runB = playback.request(decisionB);
  expect(runB).toBeDefined();
  expect(runB!.live).toBe(true);
  expect(rig.engine.handles.length).toBe(1);

  rig.engine.handles[0]!.write('0.3');
  expect(rig.elementBundle.node.style.opacity).toBe('0.3');

  const runC = playback.request(decisionC);
  expect(runC).toBeDefined();
  expect(runC!.live).toBe(true);
  expect(runB!.live).toBe(false);

  const receiptB = await runB!.settled;
  expect(receiptB.outcome.status).toBe('superseded');

  expect(rig.engine.handles.length).toBe(2);
  rig.engine.handles[1]!.write('0.8');
  rig.engine.handles[1]!.settle({ status: 'completed' });

  const receiptC = await runC!.settled;
  expect(receiptC.outcome.status).toBe('completed');
  expect(receiptC.current).toBe(true);

  expect(rig.elementBundle.node.style.opacity).toBe('1');
  const finalWrite = rig.elementBundle.writes[rig.elementBundle.writes.length - 1];
  expect(finalWrite).toEqual({ property: 'opacity', value: '1' });

  await rig.cleanup();
});

it('proof 1: B playback then latest C survives timedOut without B restoration', async () => {
  const rig = setupRig();
  const playback = createMotionPlayback(rig.binding, { play: rig.engine.play });

  const decisionB = planPlayback(recipeABC, { from: 'A', to: 'B' });
  const decisionC = planPlayback(recipeABC, { from: 'B', to: 'C' });

  const runB = playback.request(decisionB);
  expect(runB).toBeDefined();
  rig.engine.handles[0]!.write('0.25');

  const runC = playback.request(decisionC);
  expect(runC).toBeDefined();
  expect(runB!.live).toBe(false);
  expect((await runB!.settled).outcome.status).toBe('superseded');

  rig.clock.fireWatchdog();

  const receiptC = await runC!.settled;
  expect(receiptC.outcome.status).toBe('timedOut');
  expect(receiptC.current).toBe(true);

  expect(rig.elementBundle.node.style.opacity).toBe('1');
  const finalWrite = rig.elementBundle.writes[rig.elementBundle.writes.length - 1];
  expect(finalWrite).toEqual({ property: 'opacity', value: '1' });

  await rig.cleanup();
});

it('proof 1: B playback then latest C survives failed without B restoration', async () => {
  const rig = setupRig();
  const playback = createMotionPlayback(rig.binding, { play: rig.engine.play });

  const decisionB = planPlayback(recipeABC, { from: 'A', to: 'B' });
  const decisionC = planPlayback(recipeABC, { from: 'B', to: 'C' });

  const runB = playback.request(decisionB);
  expect(runB).toBeDefined();

  const runC = playback.request(decisionC);
  expect(runC).toBeDefined();
  expect(runB!.live).toBe(false);
  expect((await runB!.settled).outcome.status).toBe('superseded');

  const failureError = new Error('simulated engine failure');
  rig.engine.handles[1]!.settle({ status: 'failed', error: failureError });

  const receiptC = await runC!.settled;
  expect(receiptC.outcome.status).toBe('failed');
  expect((receiptC.outcome as { error: unknown }).error).toBe(failureError);
  expect(receiptC.current).toBe(true);

  expect(rig.elementBundle.node.style.opacity).toBe('1');
  const finalWrite = rig.elementBundle.writes[rig.elementBundle.writes.length - 1];
  expect(finalWrite).toEqual({ property: 'opacity', value: '1' });

  await rig.cleanup();
});

it('proof 2: cleanup reentrancy installs D and no older write follows', async () => {
  const rig = setupRig();
  const playback = createMotionPlayback(rig.binding, { play: rig.engine.play });

  const recipeABCD = defineMotionRecipe({
    targets: { surface: { properties: ['opacity'] } },
    states: {
      A: { surface: { opacity: 0 } },
      B: { surface: { opacity: 0.3 } },
      C: { surface: { opacity: 0.6 } },
      D: { surface: { opacity: 0.95 } },
    },
    graph: {
      kind: 'track',
      target: 'surface',
      properties: ['opacity'],
      durationMs: 200,
    },
    interruption: 'replace',
  });

  const decisionB = planPlayback(recipeABCD, { from: 'A', to: 'B' });
  const decisionC = planPlayback(recipeABCD, { from: 'B', to: 'C' });
  const decisionD = planPlayback(recipeABCD, { from: 'B', to: 'D' });

  const runB = playback.request(decisionB);
  expect(runB).toBeDefined();
  expect(rig.engine.handles.length).toBe(1);

  let runD: MotionRun | undefined;
  rig.engine.handles[0]!.stopHook = () => {
    runD = playback.request(decisionD);
  };

  const runC = playback.request(decisionC);
  expect(runC).toBeDefined();
  expect(runD).toBeDefined();
  expect(runD!.live).toBe(true);
  expect(runB!.live).toBe(false);
  expect(runC!.live).toBe(false);

  expect((await runB!.settled).outcome.status).toBe('superseded');
  expect((await runC!.settled).outcome.status).toBe('superseded');

  const writesBeforeOldAttempts = rig.elementBundle.writes.length;
  rig.engine.handles[0]!.write('0.3');
  expect(rig.elementBundle.writes.length).toBe(writesBeforeOldAttempts);

  // C loses generation during B cleanup, so it never starts an engine. D is
  // the second handle and remains authoritative.
  expect(rig.engine.handles.length).toBe(2);
  rig.engine.handles[1]!.write('0.92');
  expect(rig.elementBundle.node.style.opacity).toBe('0.92');
  rig.engine.handles[1]!.settle({ status: 'completed' });

  const receiptD = await runD!.settled;
  expect(receiptD.outcome.status).toBe('completed');
  expect(receiptD.current).toBe(true);

  expect(rig.elementBundle.node.style.opacity).toBe('0.95');
  const finalWrite = rig.elementBundle.writes[rig.elementBundle.writes.length - 1];
  expect(finalWrite).toEqual({ property: 'opacity', value: '0.95' });

  await rig.cleanup();
});

it('proof 3: partial supported opacity plus unsupported transform has one leased/started address and bounded fallback while transform stable writes through', async () => {
  const rig = setupRig();
  const playback = createMotionPlayback(rig.binding, { play: rig.engine.play });

  const recipePartial = defineMotionRecipe({
    targets: { surface: { properties: ['opacity', 'transform'] } },
    states: {
      fromState: {
        surface: {
          opacity: 0.2,
          transform: 'matrix(1, 0, 0, 1, 0, 0)',
        },
      },
      toState: {
        surface: {
          opacity: 0.8,
          transform: 'matrix(2, 0, 0, 2, 50, 50)',
        },
      },
    },
    graph: {
      kind: 'track',
      target: 'surface',
      properties: ['opacity', 'transform'],
      durationMs: 150,
    },
    interruption: 'replace',
  });

  const decision = planPlayback(recipePartial, { from: 'fromState', to: 'toState' });
  rig.resetNewWorkCounters();

  const run = playback.request(decision);
  expect(run).toBeDefined();
  expect(run!.live).toBe(true);

  expect(rig.getLeaseCountSinceReset()).toBe(1);
  expect(rig.engine.startsSinceReset).toBe(1);
  expect(rig.engine.handles[0]!.spec.property).toBe('opacity');

  expect(playback.diagnostics.length).toBe(1);
  expect(playback.diagnostics[0]).toEqual({
    kind: 'interpolation-fallback',
    entries: [
      {
        target: 'surface',
        property: 'transform',
        reason: 'transform:unsupported-function',
      },
    ],
    total: 1,
  });

  expect(rig.elementBundle.node.style.transform).toBe('matrix(2, 0, 0, 2, 50, 50)');

  rig.binding.stable('surface', { transform: 'matrix(1, 0, 0, 1, 100, 100)' });
  expect(rig.elementBundle.node.style.transform).toBe('matrix(1, 0, 0, 1, 100, 100)');

  rig.engine.handles[0]!.settle({ status: 'completed' });

  const receipt = await run!.settled;
  expect(receipt.outcome.status).toBe('completed');
  expect(receipt.current).toBe(true);

  expect(rig.elementBundle.node.style.opacity).toBe('0.8');
  expect(rig.elementBundle.node.style.transform).toBe('matrix(1, 0, 0, 1, 100, 100)');

  await rig.cleanup();
});

it('proof 3: capability resolution admits native-only transform and ticker-only custom numeric pairs', async () => {
  const rig = setupMultiTargetRig([{
    name: 'surface',
    properties: ['--progress', 'transform'],
    stable: { '--progress': '0', transform: 'translateX(0px)' },
  }]);
  const playback = createMotionPlayback(rig.binding, { play: rig.engine.play });
  const recipe = defineMotionRecipe({
    targets: { surface: { properties: ['--progress', 'transform'] } },
    numericProperties: { '--progress': { unit: 'number', interpolation: 'number' } },
    states: {
      A: { surface: { '--progress': 0, transform: 'translateX(0px)' } },
      B: { surface: { '--progress': 1, transform: 'translateX(100px)' } },
    },
    graph: {
      kind: 'track',
      target: 'surface',
      properties: ['--progress', 'transform'],
      durationMs: 100,
    },
    interruption: 'replace',
  });

  const run = playback.request(planPlayback(recipe, { from: 'A', to: 'B' }));
  expect(run).toBeDefined();
  expect(rig.engine.handles.map((handle) => handle.spec.property)).toEqual(['--progress', 'transform']);
  expect(rig.getLeaseCountSinceReset()).toBe(2);
  expect(playback.diagnostics).toHaveLength(0);

  rig.engine.handles[0]!.settle({ status: 'completed' });
  rig.engine.handles[1]!.settle({ status: 'completed' });
  expect((await run!.settled).outcome).toEqual({ status: 'completed' });
  await rig.cleanup();
});

it('proof 4: all-fallback publishes destination, supersedes incumbent, synchronously skips unavailable, caps first 8 plus total, and allocates zero new engine/clock/lease/watch while still cleaning old work', async () => {
  const targetsRecord: Record<string, { properties: readonly ['transform'] }> = {};
  const stateARecord: Record<string, { transform: string }> = {};
  const stateBRecord: Record<string, { transform: string }> = {};
  const targetConfigs: { name: string; properties: readonly ('opacity' | 'transform')[]; stable: Record<string, string> }[] = [
    {
      name: 'incumbent',
      properties: ['opacity'],
      stable: { opacity: '0' },
    },
  ];
  const steps: { kind: 'track'; target: string; properties: readonly ['transform']; durationMs: number }[] = [];

  for (let i = 0; i < 10; i++) {
    const name = `t${i}`;
    targetsRecord[name] = { properties: ['transform'] };
    stateARecord[name] = { transform: 'matrix(1, 0, 0, 1, 0, 0)' };
    stateBRecord[name] = { transform: `matrix(2, 0, 0, 2, ${i * 10}, ${i * 10})` };
    targetConfigs.push({
      name,
      properties: ['transform'],
      stable: { transform: 'matrix(1, 0, 0, 1, 0, 0)' },
    });
    steps.push({
      kind: 'track',
      target: name,
      properties: ['transform'],
      durationMs: 100,
    });
  }

  const multi = setupMultiTargetRig(targetConfigs);
  const playback = createMotionPlayback(multi.binding, { play: multi.engine.play });

  const recipeIncumbent = defineMotionRecipe({
    targets: { incumbent: { properties: ['opacity'] } },
    states: {
      A: { incumbent: { opacity: 0 } },
      B: { incumbent: { opacity: 0.7 } },
    },
    graph: {
      kind: 'track',
      target: 'incumbent',
      properties: ['opacity'],
      durationMs: 300,
    },
    interruption: 'replace',
  });

  const runIncumbent = playback.request(planPlayback(recipeIncumbent, { from: 'A', to: 'B' }));
  expect(runIncumbent).toBeDefined();
  expect(runIncumbent!.live).toBe(true);
  expect(multi.engine.handles.length).toBe(1);

  multi.resetNewWorkCounters();

  const recipeAllFallback = defineMotionRecipe({
    targets: targetsRecord,
    states: {
      A: stateARecord,
      B: stateBRecord,
    },
    graph: {
      kind: 'parallel',
      steps,
    },
    interruption: 'replace',
  });

  const decisionAllFallback = planPlayback(recipeAllFallback, { from: 'A', to: 'B' });
  const runAllFallback = playback.request(decisionAllFallback);
  expect(runAllFallback).toBeDefined();

  expect(runIncumbent!.live).toBe(false);
  const receiptIncumbent = await runIncumbent!.settled;
  expect(receiptIncumbent.outcome.status).toBe('superseded');
  expect(multi.engine.handles[0]!.stopCalled).toBe(true);

  for (let i = 0; i < 10; i++) {
    expect(multi.bundles[i + 1]!.node.style.transform).toBe(stateBRecord[`t${i}`]!.transform);
  }

  const receiptFallback = await runAllFallback!.settled;
  expect(receiptFallback.outcome).toEqual({ status: 'skipped', reason: 'unavailable' });
  expect(receiptFallback.current).toBe(true);

  expect(playback.diagnostics.length).toBe(1);
  const diag = playback.diagnostics[0]!;
  expect(diag.kind).toBe('interpolation-fallback');
  if (diag.kind === 'interpolation-fallback') {
    expect(diag.entries.length).toBe(8);
    expect(diag.total).toBe(10);
  }

  expect(multi.engine.startsSinceReset).toBe(0);
  expect(multi.clock.schedulesSinceReset).toBe(0);
  expect(multi.getLeaseCountSinceReset()).toBe(0);
  expect(multi.getWatchCountSinceReset()).toBe(0);

  await multi.cleanup();
});

it('proof 5: empty, all-identity, instant, all-optional, and zero-duration synchronously complete with zero new work and distinct skip reasons', async () => {
  const rig = setupRig();
  const playback = createMotionPlayback(rig.binding, { play: rig.engine.play });

  const recipeEmptyTracks = defineMotionRecipe({
    targets: { surface: { properties: ['opacity'] } },
    states: {
      A: { surface: { opacity: 0 } },
      B: { surface: { opacity: 0.8 } },
    },
    graph: {
      kind: 'sequence',
      steps: [],
    },
    interruption: 'replace',
  });
  rig.resetNewWorkCounters();
  const runEmpty = playback.request(planPlayback(recipeEmptyTracks, { from: 'A', to: 'B' }));
  expect(runEmpty).toBeDefined();
  expect((await runEmpty!.settled).outcome).toEqual({ status: 'completed' });
  expect(rig.elementBundle.node.style.opacity).toBe('0.8');
  expect(rig.engine.startsSinceReset).toBe(0);
  expect(rig.clock.schedulesSinceReset).toBe(0);
  expect(rig.getLeaseCountSinceReset()).toBe(0);
  expect(rig.getWatchCountSinceReset()).toBe(0);

  const recipeIdentity = defineMotionRecipe({
    targets: { surface: { properties: ['opacity'] } },
    states: {
      A: { surface: { opacity: 0.5 } },
      B: { surface: { opacity: 0.5 } },
    },
    graph: {
      kind: 'track',
      target: 'surface',
      properties: ['opacity'],
      durationMs: 100,
    },
    interruption: 'replace',
  });
  rig.resetNewWorkCounters();
  const runIdentity = playback.request(planPlayback(recipeIdentity, { from: 'A', to: 'B' }));
  expect(runIdentity).toBeDefined();
  expect((await runIdentity!.settled).outcome).toEqual({ status: 'completed' });
  expect(rig.elementBundle.node.style.opacity).toBe('0.5');
  expect(rig.engine.startsSinceReset).toBe(0);
  expect(rig.clock.schedulesSinceReset).toBe(0);
  expect(rig.getLeaseCountSinceReset()).toBe(0);
  expect(rig.getWatchCountSinceReset()).toBe(0);

  const recipeOptional = defineMotionRecipe({
    targets: {
      surface: { properties: ['opacity'] },
      badge: { properties: ['opacity'], optional: true },
    },
    states: {
      A: { surface: { opacity: 0 }, badge: { opacity: 0 } },
      B: { surface: { opacity: 0.6 }, badge: { opacity: 0.6 } },
    },
    graph: {
      kind: 'track',
      target: 'badge',
      properties: ['opacity'],
      durationMs: 100,
    },
    interruption: 'replace',
  });
  rig.resetNewWorkCounters();
  const runOptional = playback.request(
    planPlayback(recipeOptional, { from: 'A', to: 'B', availableTargets: ['surface'] }),
  );
  expect(runOptional).toBeDefined();
  expect((await runOptional!.settled).outcome).toEqual({ status: 'completed' });
  expect(rig.elementBundle.node.style.opacity).toBe('0.6');
  expect(rig.engine.startsSinceReset).toBe(0);
  expect(rig.clock.schedulesSinceReset).toBe(0);
  expect(rig.getLeaseCountSinceReset()).toBe(0);
  expect(rig.getWatchCountSinceReset()).toBe(0);

  const recipeZeroDuration = defineMotionRecipe({
    targets: { surface: { properties: ['opacity'] } },
    states: {
      A: { surface: { opacity: 0 } },
      B: { surface: { opacity: 0.9 } },
    },
    graph: {
      kind: 'track',
      target: 'surface',
      properties: ['opacity'],
      durationMs: 0,
    },
    interruption: 'replace',
  });
  rig.resetNewWorkCounters();
  const runZero = playback.request(planPlayback(recipeZeroDuration, { from: 'A', to: 'B' }));
  expect(runZero).toBeDefined();
  expect((await runZero!.settled).outcome).toEqual({ status: 'completed' });
  expect(rig.elementBundle.node.style.opacity).toBe('0.9');
  expect(rig.engine.startsSinceReset).toBe(0);
  expect(rig.clock.schedulesSinceReset).toBe(0);
  expect(rig.getLeaseCountSinceReset()).toBe(0);
  expect(rig.getWatchCountSinceReset()).toBe(0);

  rig.resetNewWorkCounters();
  const runDisabled = playback.request(
    planPlayback(recipeABC, { from: 'A', to: 'B', instance: { disabled: true } }),
  );
  expect(runDisabled).toBeDefined();
  expect((await runDisabled!.settled).outcome).toEqual({ status: 'skipped', reason: 'disabled' });
  expect(rig.elementBundle.node.style.opacity).toBe('0.5');
  expect(rig.engine.startsSinceReset).toBe(0);
  expect(rig.clock.schedulesSinceReset).toBe(0);
  expect(rig.getLeaseCountSinceReset()).toBe(0);
  expect(rig.getWatchCountSinceReset()).toBe(0);

  rig.resetNewWorkCounters();
  const runReduced = playback.request(
    planPlayback(recipeABC, { from: 'A', to: 'B', reducedMotion: true }),
  );
  expect(runReduced).toBeDefined();
  expect((await runReduced!.settled).outcome).toEqual({ status: 'skipped', reason: 'reducedMotion' });
  expect(rig.elementBundle.node.style.opacity).toBe('0.5');
  expect(rig.engine.startsSinceReset).toBe(0);
  expect(rig.clock.schedulesSinceReset).toBe(0);
  expect(rig.getLeaseCountSinceReset()).toBe(0);
  expect(rig.getWatchCountSinceReset()).toBe(0);

  rig.resetNewWorkCounters();
  const recipeMissingRequired = defineMotionRecipe({
    targets: {
      surface: { properties: ['opacity'] },
      badge: { properties: ['opacity'] },
    },
    states: {
      A: { surface: { opacity: 0 }, badge: { opacity: 0 } },
      B: { surface: { opacity: 0.5 }, badge: { opacity: 0.5 } },
    },
    graph: {
      kind: 'track',
      target: 'surface',
      properties: ['opacity'],
      durationMs: 100,
    },
    interruption: 'replace',
  });
  rig.resetNewWorkCounters();
  const runMissing = playback.request(
    planPlayback(recipeMissingRequired, { from: 'A', to: 'B', availableTargets: ['surface'] }),
  );
  expect(runMissing).toBeDefined();
  expect((await runMissing!.settled).outcome).toEqual({ status: 'skipped', reason: 'unavailable' });
  expect(rig.elementBundle.node.style.opacity).toBe('0.5');
  expect(playback.diagnostics[playback.diagnostics.length - 1]).toEqual({
    kind: 'unavailable',
    reason: 'missing-required',
    targets: ['badge'],
    total: 1,
  });
  expect(rig.engine.startsSinceReset).toBe(0);
  expect(rig.clock.schedulesSinceReset).toBe(0);
  expect(rig.getLeaseCountSinceReset()).toBe(0);
  expect(rig.getWatchCountSinceReset()).toBe(0);

  rig.resetNewWorkCounters();
  const invalidRequest: PlaybackRequest<typeof recipeABC.targets, string> = {
    from: 'invalidState',
    to: 'B',
  };
  const runRejected = playback.request(planPlayback(recipeABC, invalidRequest));
  expect(runRejected).toBeDefined();
  expect((await runRejected!.settled).outcome).toEqual({ status: 'skipped', reason: 'unavailable' });
  expect(rig.elementBundle.node.style.opacity).toBe('0.5');
  const lastDiag = playback.diagnostics[playback.diagnostics.length - 1]!;
  expect(lastDiag.kind).toBe('unavailable');
  if (lastDiag.kind === 'unavailable') {
    expect(lastDiag.reason).toBe('compile-rejected');
  }
  expect(rig.engine.startsSinceReset).toBe(0);
  expect(rig.clock.schedulesSinceReset).toBe(0);
  expect(rig.getLeaseCountSinceReset()).toBe(0);
  expect(rig.getWatchCountSinceReset()).toBe(0);

  await rig.cleanup();
});

it('A1: present plus absent optional still plays with exact single publication and destination visible', async () => {
  const multi = setupMultiTargetRig([
    {
      name: 'box',
      properties: ['opacity'],
      stable: { opacity: '0' },
    },
  ]);
  const playback = createMotionPlayback(multi.binding, { play: multi.engine.play });

  const recipe = defineMotionRecipe({
    targets: {
      box: { properties: ['opacity'] },
      badge: { properties: ['opacity'], optional: true },
    },
    states: {
      A: { box: { opacity: 0 }, badge: { opacity: 0 } },
      B: { box: { opacity: 1 }, badge: { opacity: 0.5 } },
    },
    graph: {
      kind: 'parallel',
      steps: [
        { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 100 },
        { kind: 'track', target: 'badge', properties: ['opacity'], durationMs: 100 },
      ],
    },
    interruption: 'replace',
  });

  const stableCalls: [string, Record<string, string>][] = [];
  const originalStable = multi.binding.stable.bind(multi.binding);
  multi.binding.stable = (target, values) => {
    stableCalls.push([target, { ...values } as Record<string, string>]);
    originalStable(target, values);
  };

  multi.resetNewWorkCounters();
  const decision = planPlayback(recipe, { from: 'A', to: 'B', availableTargets: ['box'] });
  const run = playback.request(decision);

  expect(run).toBeDefined();
  expect(run!.live).toBe(true);
  expect(multi.engine.startsSinceReset).toBe(1);
  expect(multi.getLeaseCountSinceReset()).toBe(1);
  expect(stableCalls).toEqual([['box', { opacity: '1' }]]);
  expect(playback.diagnostics.some((d) => d.kind === 'request-rejected')).toBe(false);

  multi.engine.handles[0]!.write('1');
  multi.engine.handles[0]!.settle({ status: 'completed' });

  const receipt = await run!.settled;
  expect(receipt.outcome.status).toBe('completed');
  expect(receipt.current).toBe(true);
  expect(multi.bundles[0]!.node.style.opacity).toBe('1');

  await multi.cleanup();
});

it('A2: absent required supersedes incumbent as skipped:unavailable with zero new engine/clock/lease/watch work', async () => {
  const multi = setupMultiTargetRig([
    {
      name: 'box',
      properties: ['opacity'],
      stable: { opacity: '0' },
    },
  ]);
  const playback = createMotionPlayback(multi.binding, { play: multi.engine.play });

  const recipeIncumbent = defineMotionRecipe({
    targets: { box: { properties: ['opacity'] } },
    states: {
      A: { box: { opacity: 0 } },
      B: { box: { opacity: 0.7 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 300 },
    interruption: 'replace',
  });

  const runIncumbent = playback.request(planPlayback(recipeIncumbent, { from: 'A', to: 'B' }));
  expect(runIncumbent).toBeDefined();
  expect(runIncumbent!.live).toBe(true);
  expect(multi.engine.handles.length).toBe(1);

  multi.resetNewWorkCounters();

  const recipeMissingReq = defineMotionRecipe({
    targets: {
      box: { properties: ['opacity'] },
      badge: { properties: ['opacity'] },
    },
    states: {
      A: { box: { opacity: 0 }, badge: { opacity: 0 } },
      B: { box: { opacity: 0.5 }, badge: { opacity: 0.5 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 100 },
    interruption: 'replace',
  });

  const decisionMissing = planPlayback(recipeMissingReq, { from: 'A', to: 'B', availableTargets: ['box'] });
  const runMissing = playback.request(decisionMissing);

  expect(runMissing).toBeDefined();
  expect(runIncumbent!.live).toBe(false);
  expect(multi.engine.handles[0]!.stopCalled).toBe(true);
  expect(runMissing!.live).toBe(false);
  expect(multi.binding.current).toBe(runMissing);

  const receiptIncumbent = await runIncumbent!.settled;
  expect(receiptIncumbent.outcome.status).toBe('superseded');

  const receiptMissing = await runMissing!.settled;
  expect(receiptMissing.outcome).toEqual({ status: 'skipped', reason: 'unavailable' });
  expect(receiptMissing.current).toBe(true);

  expect(playback.diagnostics[playback.diagnostics.length - 1]).toEqual({
    kind: 'unavailable',
    reason: 'missing-required',
    targets: ['badge'],
    total: 1,
  });

  expect(multi.bundles[0]!.node.style.opacity).toBe('0.5');
  expect(multi.engine.startsSinceReset).toBe(0);
  expect(multi.clock.schedulesSinceReset).toBe(0);
  expect(multi.getLeaseCountSinceReset()).toBe(0);
  expect(multi.getWatchCountSinceReset()).toBe(0);

  await multi.cleanup();
});

it('A3: constructible all-optional-skipped with untracked frame and controls for empty bindings', async () => {
  const multi = setupMultiTargetRig([
    {
      name: 'frame',
      properties: ['opacity'],
      stable: { opacity: '0' },
    },
  ]);
  const playback = createMotionPlayback(multi.binding, { play: multi.engine.play });

  const recipeIncumbent = defineMotionRecipe({
    targets: { frame: { properties: ['opacity'] } },
    states: {
      A: { frame: { opacity: 0 } },
      B: { frame: { opacity: 0.3 } },
    },
    graph: { kind: 'track', target: 'frame', properties: ['opacity'], durationMs: 200 },
    interruption: 'replace',
  });

  const runIncumbent = playback.request(planPlayback(recipeIncumbent, { from: 'A', to: 'B' }));
  expect(runIncumbent).toBeDefined();
  expect(runIncumbent!.live).toBe(true);

  multi.resetNewWorkCounters();

  const recipeAllOpt = defineMotionRecipe({
    targets: {
      frame: { properties: ['opacity'] },
      badge: { properties: ['opacity'], optional: true },
    },
    states: {
      A: { frame: { opacity: 0 }, badge: { opacity: 0 } },
      B: { frame: { opacity: 0.8 }, badge: { opacity: 0.8 } },
    },
    graph: { kind: 'track', target: 'badge', properties: ['opacity'], durationMs: 100 },
    interruption: 'replace',
  });

  const decision = planPlayback(recipeAllOpt, { from: 'A', to: 'B', availableTargets: ['frame'] });
  expect(decision.kind).toBe('stable-only');
  if (decision.kind === 'stable-only') {
    expect(decision.reason).toBe('all-optional-skipped');
  }

  const runOpt = playback.request(decision);
  expect(runOpt).toBeDefined();
  expect(runIncumbent!.live).toBe(false);

  const receiptIncumbent = await runIncumbent!.settled;
  expect(receiptIncumbent.outcome.status).toBe('superseded');

  const receiptOpt = await runOpt!.settled;
  expect(receiptOpt.outcome).toEqual({ status: 'completed' });
  expect(receiptOpt.current).toBe(true);
  expect(multi.bundles[0]!.node.style.opacity).toBe('0.8');

  expect(multi.engine.startsSinceReset).toBe(0);
  expect(multi.clock.schedulesSinceReset).toBe(0);
  expect(multi.getLeaseCountSinceReset()).toBe(0);
  expect(multi.getWatchCountSinceReset()).toBe(0);
  expect(playback.diagnostics.filter((d) => d.kind === 'unavailable')).toHaveLength(0);

  // Control 1: TargetRegistry.bind still refuses empty targets
  expect(() =>
    multi.registry.bind(multi.registry.rootOwner, [], { channel: 'test', priority: 0 }),
  ).toThrow('A binding requires targets');

  // Control 2: an empty publishable set against a live binding is rejected at pre-read
  const recipeOnlyOpt = defineMotionRecipe({
    targets: {
      badge: { properties: ['opacity'], optional: true },
    },
    states: {
      A: { badge: { opacity: 0 } },
      B: { badge: { opacity: 1 } },
    },
    graph: { kind: 'track', target: 'badge', properties: ['opacity'], durationMs: 50 },
    interruption: 'replace',
  });

  const emptyOptDecision = planPlayback(recipeOnlyOpt, {
    from: 'A',
    to: 'B',
    availableTargets: [],
  });

  const stableSpy = vi.fn(multi.binding.stable.bind(multi.binding));
  multi.binding.stable = stableSpy;

  const rejectedRun = playback.request(emptyOptDecision);
  expect(rejectedRun).toBeUndefined();
  expect(stableSpy).not.toHaveBeenCalled();
  const lastDiag = playback.diagnostics[playback.diagnostics.length - 1];
  expect(lastDiag).toMatchObject({
    kind: 'request-rejected',
    phase: 'pre-read',
  });

  await multi.cleanup();
});

it('A4: compile-rejected publishes only present targets and supersedes incumbent', async () => {
  const multi = setupMultiTargetRig([
    {
      name: 'box',
      properties: ['opacity'],
      stable: { opacity: '0' },
    },
  ]);
  const playback = createMotionPlayback(multi.binding, { play: multi.engine.play });

  const recipeIncumbent = defineMotionRecipe({
    targets: { box: { properties: ['opacity'] } },
    states: {
      A: { box: { opacity: 0 } },
      B: { box: { opacity: 0.3 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 200 },
    interruption: 'replace',
  });

  const runIncumbent = playback.request(planPlayback(recipeIncumbent, { from: 'A', to: 'B' }));
  expect(runIncumbent).toBeDefined();

  const recipe = defineMotionRecipe({
    targets: {
      box: { properties: ['opacity'] },
      badge: { properties: ['opacity'], optional: true },
    },
    states: {
      A: { box: { opacity: 0 }, badge: { opacity: 0 } },
      B: { box: { opacity: 0.9 }, badge: { opacity: 0.9 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 100 },
    interruption: 'replace',
  });

  const decisionRejected = planPlayback(recipe, {
    from: 'invalid' as any,
    to: 'B',
    availableTargets: ['box'],
  });

  const stableSpy = vi.fn(multi.binding.stable.bind(multi.binding));
  multi.binding.stable = stableSpy;

  const runRejected = playback.request(decisionRejected);
  expect(runRejected).toBeDefined();
  expect(runIncumbent!.live).toBe(false);

  expect(stableSpy).toHaveBeenCalledTimes(1);
  expect(stableSpy).toHaveBeenCalledWith('box', { opacity: '0.9' });
  expect(multi.bundles[0]!.node.style.opacity).toBe('0.9');

  const receiptRejected = await runRejected!.settled;
  expect(receiptRejected.outcome).toEqual({ status: 'skipped', reason: 'unavailable' });
  expect(receiptRejected.current).toBe(true);

  const lastDiag = playback.diagnostics[playback.diagnostics.length - 1];
  expect(lastDiag).toMatchObject({
    kind: 'unavailable',
    reason: 'compile-rejected',
  });

  await multi.cleanup();
});

it('A5: table-driven zero-work rows with an absent optional supersede and publish only box', async () => {
  const multi = setupMultiTargetRig([
    {
      name: 'box',
      properties: ['opacity', 'transform'],
      stable: { opacity: '0', transform: 'none' },
    },
  ]);
  const playback = createMotionPlayback(multi.binding, { play: multi.engine.play });

  const recipeBase = defineMotionRecipe({
    targets: {
      box: { properties: ['opacity', 'transform'] },
      badge: { properties: ['opacity'], optional: true },
    },
    states: {
      A: { box: { opacity: 0, transform: 'matrix(1, 0, 0, 1, 0, 0)' }, badge: { opacity: 0 } },
      B: { box: { opacity: 0.7, transform: 'matrix(2, 0, 0, 2, 50, 50)' }, badge: { opacity: 0.7 } },
      C: { box: { opacity: 0.7, transform: 'matrix(1, 0, 0, 1, 0, 0)' }, badge: { opacity: 0 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 100 },
    interruption: 'replace',
  });

  const recipeZeroDuration = defineMotionRecipe({
    targets: {
      box: { properties: ['opacity'] },
      badge: { properties: ['opacity'], optional: true },
    },
    states: {
      A: { box: { opacity: 0 }, badge: { opacity: 0 } },
      B: { box: { opacity: 0.6 }, badge: { opacity: 0.6 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 0 },
    interruption: 'replace',
  });

  const recipeAllFallback = defineMotionRecipe({
    targets: {
      box: { properties: ['transform'] },
      badge: { properties: ['transform'], optional: true },
    },
    states: {
      A: { box: { transform: 'matrix(1, 0, 0, 1, 0, 0)' }, badge: { transform: 'matrix(1, 0, 0, 1, 0, 0)' } },
      B: { box: { transform: 'matrix(2, 0, 0, 2, 50, 50)' }, badge: { transform: 'matrix(2, 0, 0, 2, 50, 50)' } },
    },
    graph: { kind: 'track', target: 'box', properties: ['transform'], durationMs: 100 },
    interruption: 'replace',
  });

  const recipeIdentity = defineMotionRecipe({
    targets: {
      box: { properties: ['opacity'] },
      badge: { properties: ['opacity'], optional: true },
    },
    states: {
      A: { box: { opacity: 0.5 }, badge: { opacity: 0.5 } },
      B: { box: { opacity: 0.5 }, badge: { opacity: 0.5 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 100 },
    interruption: 'replace',
  });

  const rows = [
    {
      name: 'disabled',
      decision: planPlayback(recipeBase, { from: 'A', to: 'B', availableTargets: ['box'], instance: { disabled: true } }),
      expectedOutcome: { status: 'skipped', reason: 'disabled' },
    },
    {
      name: 'reduced',
      decision: planPlayback(recipeBase, { from: 'A', to: 'B', availableTargets: ['box'], reducedMotion: true }),
      expectedOutcome: { status: 'skipped', reason: 'reducedMotion' },
    },
    {
      name: 'zero-duration',
      decision: planPlayback(recipeZeroDuration, { from: 'A', to: 'B', availableTargets: ['box'] }),
      expectedOutcome: { status: 'completed' },
    },
    {
      name: 'all-fallback',
      decision: planPlayback(recipeAllFallback, { from: 'A', to: 'B', availableTargets: ['box'] }),
      expectedOutcome: { status: 'skipped', reason: 'unavailable' },
    },
    {
      name: 'all-identity',
      decision: planPlayback(recipeIdentity, { from: 'A', to: 'B', availableTargets: ['box'] }),
      expectedOutcome: { status: 'completed' },
    },
  ];

  for (const row of rows) {
    const incumbent = playback.request(planPlayback(recipeBase, { from: 'A', to: 'B', availableTargets: ['box'] }));
    expect(incumbent).toBeDefined();

    const stableCalls: string[] = [];
    const originalStable = multi.binding.stable.bind(multi.binding);
    multi.binding.stable = (target, values) => {
      stableCalls.push(target);
      originalStable(target, values);
    };

    const startSpy = vi.fn(multi.binding.start.bind(multi.binding));
    multi.binding.start = startSpy;

    const run = playback.request(row.decision as unknown as PlaybackDecision);
    expect(run, `${row.name} run`).toBeDefined();
    expect(startSpy, `${row.name} start called once`).toHaveBeenCalledTimes(1);
    expect(stableCalls, `${row.name} published box only`).toEqual(['box']);
    expect(incumbent!.live, `${row.name} incumbent superseded`).toBe(false);

    const receipt = await run!.settled;
    expect(receipt.outcome, `${row.name} outcome`).toEqual(row.expectedOutcome);
  }

  await multi.cleanup();
});

it('A6: unknown-target strictness and malformed/legacy pre-read rejection', async () => {
  const multi = setupMultiTargetRig([
    {
      name: 'box',
      properties: ['opacity'],
      stable: { opacity: '0' },
    },
  ]);
  const playback = createMotionPlayback(multi.binding, { play: multi.engine.play });

  // 1. Direct binding.stable('badge', ...) throws Unknown binding target
  expect(() => multi.binding.stable('badge', { opacity: '1' })).toThrow('Unknown binding target');

  // 2. Direct binding.stable('ghost', ...) throws Unknown binding target
  expect(() => multi.binding.stable('ghost', { opacity: '1' })).toThrow('Unknown binding target');

  // Start an incumbent to verify it stays live across rejections
  const recipeIncumbent = defineMotionRecipe({
    targets: { box: { properties: ['opacity'] } },
    states: {
      A: { box: { opacity: 0 } },
      B: { box: { opacity: 0.7 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 200 },
    interruption: 'replace',
  });
  const incumbent = playback.request(planPlayback(recipeIncumbent, { from: 'A', to: 'B' }));
  expect(incumbent).toBeDefined();
  expect(incumbent!.live).toBe(true);

  const startSpy = vi.fn(multi.binding.start.bind(multi.binding));
  multi.binding.start = startSpy;

  // 3. Hand-built decision whose publishable includes 'ghost'
  const handBuiltGhost = Object.freeze({
    kind: 'play' as const,
    compiled: incumbent!.live ? (planPlayback(recipeIncumbent, { from: 'A', to: 'B' }) as any).compiled : undefined,
    publishable: Object.freeze({
      box: Object.freeze({ opacity: '0.7' }),
      ghost: Object.freeze({ opacity: '1' }),
    }),
    stable: Object.freeze({
      box: Object.freeze({ opacity: '0.7' }),
    }),
  });

  const runGhost = playback.request(handBuiltGhost as any);
  expect(runGhost).toBeUndefined();
  expect(startSpy).not.toHaveBeenCalled();
  expect(incumbent!.live).toBe(true);
  const ghostDiag = playback.diagnostics[playback.diagnostics.length - 1];
  expect(ghostDiag).toMatchObject({
    kind: 'request-rejected',
    phase: 'publication',
    message: expect.stringContaining('Unknown binding target'),
  });

  // 4. Legacy-shaped decision with no publishable field
  const legacyDecision = Object.freeze({
    kind: 'play' as const,
    compiled: (planPlayback(recipeIncumbent, { from: 'A', to: 'B' }) as any).compiled,
    stable: Object.freeze({
      box: Object.freeze({ opacity: '0.7' }),
    }),
  });

  const stableSpy = vi.fn(multi.binding.stable.bind(multi.binding));
  multi.binding.stable = stableSpy;

  const runLegacy = playback.request(legacyDecision as any);
  expect(runLegacy).toBeUndefined();
  expect(stableSpy).not.toHaveBeenCalled();
  expect(startSpy).not.toHaveBeenCalled();
  expect(incumbent!.live).toBe(true);
  const legacyDiag = playback.diagnostics[playback.diagnostics.length - 1];
  expect(legacyDiag).toMatchObject({
    kind: 'request-rejected',
    phase: 'pre-read',
    message: expect.stringContaining('non-null record'),
  });

  // 5. Empty publishable record rejected at pre-read
  const emptyPublishableDecision = Object.freeze({
    kind: 'play' as const,
    compiled: (planPlayback(recipeIncumbent, { from: 'A', to: 'B' }) as any).compiled,
    publishable: Object.freeze({}),
    stable: Object.freeze({
      box: Object.freeze({ opacity: '0.7' }),
    }),
  });

  const runEmpty = playback.request(emptyPublishableDecision as any);
  expect(runEmpty).toBeUndefined();
  expect(stableSpy).not.toHaveBeenCalled();
  expect(startSpy).not.toHaveBeenCalled();
  expect(incumbent!.live).toBe(true);
  const emptyDiag = playback.diagnostics[playback.diagnostics.length - 1];
  expect(emptyDiag).toMatchObject({
    kind: 'request-rejected',
    phase: 'pre-read',
    message: expect.stringContaining('cannot be empty'),
  });

  await multi.cleanup();
});

it('A7: valid paths publish exactly binding names before start; precondition violation causes publication rejection without start', async () => {
  const multi = setupMultiTargetRig([
    {
      name: 'box',
      properties: ['opacity'],
      stable: { opacity: '0' },
    },
  ]);
  const playback = createMotionPlayback(multi.binding, { play: multi.engine.play });

  const recipe = defineMotionRecipe({
    targets: {
      box: { properties: ['opacity'] },
      badge: { properties: ['opacity'], optional: true },
    },
    states: {
      A: { box: { opacity: 0 }, badge: { opacity: 0 } },
      B: { box: { opacity: 1 }, badge: { opacity: 0.5 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 100 },
    interruption: 'replace',
  });

  // Valid path: binding names === keys(publishable)
  const sequence: string[] = [];
  multi.binding.stable = (target, values) => {
    sequence.push(`stable:${target}`);
  };
  const originalStart = multi.binding.start.bind(multi.binding);
  multi.binding.start = (plan) => {
    sequence.push('start');
    return originalStart(plan);
  };

  const decision = planPlayback(recipe, { from: 'A', to: 'B', availableTargets: ['box'] });
  const run = playback.request(decision);
  expect(run).toBeDefined();
  expect(sequence).toEqual(['stable:box', 'start']);
  expect(playback.diagnostics.some((d) => d.kind === 'request-rejected')).toBe(false);

  // Mismatch control: recipe declares box then badge (required), availableTargets omitted, binding has only box
  const recipeTwoRequired = defineMotionRecipe({
    targets: {
      box: { properties: ['opacity'] },
      badge: { properties: ['opacity'] },
    },
    states: {
      A: { box: { opacity: 0 }, badge: { opacity: 0 } },
      B: { box: { opacity: 1 }, badge: { opacity: 0.5 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 100 },
    interruption: 'replace',
  });

  // Start a live incumbent
  const incumbent = playback.request(planPlayback(recipe, { from: 'A', to: 'B', availableTargets: ['box'] }));
  expect(incumbent).toBeDefined();
  expect(incumbent!.live).toBe(true);

  const startSpy = vi.fn(multi.binding.start.bind(multi.binding));
  multi.binding.start = startSpy;

  const mismatchStableCalls: string[] = [];
  multi.binding.stable = (target, values) => {
    mismatchStableCalls.push(target);
    if (target !== 'box') throw new Error('Unknown binding target');
  };

  const decisionMismatch = planPlayback(recipeTwoRequired, { from: 'A', to: 'B' }); // omitted availability
  const mismatchRun = playback.request(decisionMismatch);

  expect(mismatchRun).toBeUndefined();
  expect(mismatchStableCalls).toEqual(['box', 'badge']);
  expect(startSpy).not.toHaveBeenCalled();
  expect(incumbent!.live).toBe(true);

  const rejectionDiag = playback.diagnostics[playback.diagnostics.length - 1];
  expect(rejectionDiag).toMatchObject({
    kind: 'request-rejected',
    phase: 'publication',
    message: expect.stringContaining('Unknown binding target'),
  });

  await multi.cleanup();
});

it('A8: adapter reads publishable getter once and never reads stable getter', async () => {
  const multi = setupMultiTargetRig([
    {
      name: 'surface',
      properties: ['opacity'],
      stable: { opacity: '0' },
    },
  ]);
  const playback = createMotionPlayback(multi.binding, { play: multi.engine.play });

  const recipe = defineMotionRecipe({
    targets: { surface: { properties: ['opacity'] } },
    states: {
      A: { surface: { opacity: 0 } },
      B: { surface: { opacity: 1 } },
    },
    graph: { kind: 'track', target: 'surface', properties: ['opacity'], durationMs: 100 },
    interruption: 'replace',
  });

  const basePlay = planPlayback(recipe, { from: 'A', to: 'B' });

  // Play decision
  let playPublishableReads = 0;
  let playStableReads = 0;
  const playDecisionWithGetters = {
    kind: 'play' as const,
    compiled: basePlay.compiled!,
    get publishable() {
      playPublishableReads++;
      return Object.freeze({ surface: Object.freeze({ opacity: '1' }) });
    },
    get stable() {
      playStableReads++;
      return Object.freeze({ surface: Object.freeze({ opacity: '1' }) });
    },
  };

  const runPlay = playback.request(playDecisionWithGetters as any);
  expect(runPlay).toBeDefined();
  expect(playPublishableReads).toBe(1);
  expect(playStableReads).toBe(0);

  // Compile-rejected decision
  let rejectedPublishableReads = 0;
  let rejectedStableReads = 0;
  const rejectedDecisionWithGetters = {
    kind: 'stable-only' as const,
    reason: 'compile-rejected' as const,
    diagnostic: { name: 'TypeError', message: 'test' },
    error: { name: 'TypeError', message: 'test' },
    get publishable() {
      rejectedPublishableReads++;
      return Object.freeze({ surface: Object.freeze({ opacity: '1' }) });
    },
    get stable() {
      rejectedStableReads++;
      return Object.freeze({ surface: Object.freeze({ opacity: '1' }) });
    },
  };

  const runRejected = playback.request(rejectedDecisionWithGetters as any);
  expect(runRejected).toBeDefined();
  expect(rejectedPublishableReads).toBe(1);
  expect(rejectedStableReads).toBe(0);

  await multi.cleanup();
});
