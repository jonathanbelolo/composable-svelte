import { describe, expect, it } from 'vitest';
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
} from '../src/lib/execution/resources.js';
import { ProductionScheduler } from '../src/lib/execution/scheduler.js';
import {
  createMotionClock,
  type MotionClock,
} from '../src/lib/application/renderer/motion-run.js';
import {
  createMotionPlayback,
  type MotionPlaybackPlay,
} from '../src/lib/application/renderer/motion-playback.js';
import { playMotionValue } from '../src/lib/application/renderer/motion-engine.js';
import { defineMotionRecipe } from '../src/lib/application/motion/compiler.js';
import { planPlayback } from '../src/lib/application/motion/playback-plan.js';
import type { MotionProperty } from '../src/lib/application/motion/properties.js';

interface RecordedWrite {
  readonly property: string;
  readonly value: string;
}

interface RecordingElement {
  readonly node: HTMLElement;
  readonly writes: readonly RecordedWrite[];
  dispose(): void;
}

function createRecordingElement(): RecordingElement {
  const node = document.createElement('div');
  const recordedWrites: RecordedWrite[] = [];
  const originalSetProperty = node.style.setProperty.bind(node.style);
  node.style.setProperty = (property: string, value: string | null, priority?: string): void => {
    if (value !== null) {
      recordedWrites.push(Object.freeze({ property, value }));
    }
    originalSetProperty(property, value, priority);
  };
  document.body.appendChild(node);
  return {
    node,
    get writes(): readonly RecordedWrite[] {
      return recordedWrites;
    },
    dispose(): void {
      node.remove();
    },
  };
}

async function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000,
  message = 'Condition timed out',
): Promise<void> {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error(`${message} (exceeded ${timeoutMs}ms)`);
    }
    await nextFrame();
  }
}

function parseScale(val: string): number | undefined {
  const match = /^scale\(([^)]+)\)$/.exec(val.trim());
  if (!match || !match[1]) return undefined;
  const num = Number.parseFloat(match[1]);
  return Number.isFinite(num) ? num : undefined;
}

interface BrowserRig {
  readonly registry: TargetRegistry;
  readonly resources: ResourceScope;
  readonly scheduler: ProductionScheduler;
  readonly clock: MotionClock;
  readonly node: HTMLElement;
  readonly writes: readonly RecordedWrite[];
  readonly binding: MotionBinding;
  cleanup(): Promise<void>;
}

function createBrowserRig(options?: {
  readonly properties?: readonly MotionProperty[];
  readonly initialStable?: Readonly<Record<string, string>>;
  readonly channel?: string;
  readonly priority?: number;
}): BrowserRig {
  const elementBundle = createRecordingElement();
  const properties = options?.properties ?? (['opacity'] as const);
  const initialStable = options?.initialStable ?? Object.freeze({ opacity: '0.1' });
  const channel = options?.channel ?? 'browser-test';
  const priority = options?.priority ?? 0;

  const resources = new ResourceScope();
  const scheduler = new ProductionScheduler();
  const clock = createMotionClock(scheduler);
  const root = {};

  const rootResources: RootTargetResources = {
    clock,
    register: (opts) => resources.createRecord(opts),
    observeCleanup: (cleanup: CleanupFunction) => {
      void safeCleanup(cleanup);
    },
  };

  const registry = new TargetRegistry(root, () => true, undefined, rootResources, clock);
  registry.attach();

  const target: BindingTarget = {
    name: 'surface',
    node: elementBundle.node,
    properties,
    stable: initialStable,
  };

  const binding = registry.bind(registry.rootOwner, [target], { channel, priority });

  const cleanup = async (): Promise<void> => {
    binding.release();
    registry.dispose();
    resources.dispose();
    await resources.whenCleanupsSettled();
    elementBundle.dispose();
  };

  return {
    registry,
    resources,
    scheduler,
    clock,
    node: elementBundle.node,
    writes: elementBundle.writes,
    binding,
    cleanup,
  };
}

describe('Packet 2 real-browser motion playback qualification', () => {
  it('proof 1: actual opacity playback writes intermediate CSS through leased sink, settles completed/current, and exposes exact latest destination stable with no post-settlement write', async () => {
    const rig = createBrowserRig({
      properties: ['opacity'],
      initialStable: { opacity: '0.1' },
    });
    const playback = createMotionPlayback(rig.binding);

    const recipe = defineMotionRecipe({
      targets: { surface: { properties: ['opacity'] } },
      states: {
        A: { surface: { opacity: 0.1 } },
        B: { surface: { opacity: 0.9 } },
      },
      graph: {
        kind: 'track',
        target: 'surface',
        properties: ['opacity'],
        durationMs: 120,
      },
      interruption: 'replace',
    });

    const decision = planPlayback(recipe, { from: 'A', to: 'B' });
    const run = playback.request(decision);
    expect(run).toBeDefined();
    if (!run) throw new Error('Expected run');

    expect(run.live).toBe(true);
    expect(rig.binding.live).toBe(true);
    expect(rig.binding.current).toBe(run);

    await waitFor(
      () =>
        rig.writes.some((w) => {
          if (w.property !== 'opacity') return false;
          const v = Number.parseFloat(w.value);
          return v > 0.1 && v < 0.9;
        }),
      2000,
      'Expected non-vacuous intermediate opacity write',
    );

    const intermediateWrites = rig.writes.filter((w) => {
      if (w.property !== 'opacity') return false;
      const v = Number.parseFloat(w.value);
      return v > 0.1 && v < 0.9;
    });
    expect(intermediateWrites.length).toBeGreaterThan(0);

    const receipt = await run.settled;
    expect(receipt.outcome).toEqual({ status: 'completed' });
    expect(receipt.current).toBe(true);
    expect(run.live).toBe(false);
    expect(rig.binding.current).toBe(run);

    expect(rig.node.style.opacity).toBe('0.9');

    const opacityWrites = rig.writes.filter((w) => w.property === 'opacity');
    expect(opacityWrites.length).toBeGreaterThanOrEqual(3);
    expect(opacityWrites[0]?.value).toBe('0.1');
    expect(opacityWrites[opacityWrites.length - 1]?.value).toBe('0.9');

    const writeCountAtSettlement = rig.writes.length;
    await nextFrame();
    await nextFrame();
    await nextFrame();
    expect(rig.writes.length).toBe(writeCountAtSettlement);
    expect(rig.node.style.opacity).toBe('0.9');

    await rig.cleanup();
  });

  it('proof 2: real interruption settles predecessor superseded, produces successor intermediate, completes current, and past predecessor deadline cannot overwrite final stable', async () => {
    const rig = createBrowserRig({
      properties: ['opacity'],
      initialStable: { opacity: '0.1' },
    });
    const playback = createMotionPlayback(rig.binding);

    const recipe = defineMotionRecipe({
      targets: { surface: { properties: ['opacity'] } },
      states: {
        A: { surface: { opacity: 0.1 } },
        B: { surface: { opacity: 0.5 } },
        C: { surface: { opacity: 0.9 } },
      },
      graph: {
        kind: 'track',
        target: 'surface',
        properties: ['opacity'],
        durationMs: 160,
      },
      interruption: 'replace',
    });

    const startB = performance.now();
    const decisionB = planPlayback(recipe, { from: 'A', to: 'B' });
    const runB = playback.request(decisionB);
    expect(runB).toBeDefined();
    if (!runB) throw new Error('Expected runB');

    expect(runB.live).toBe(true);
    expect(rig.binding.current).toBe(runB);

    await waitFor(
      () =>
        rig.writes.some((w) => {
          if (w.property !== 'opacity') return false;
          const v = Number.parseFloat(w.value);
          return v > 0.1 && v < 0.5;
        }),
      2000,
      'Expected intermediate write for B',
    );

    const segmentBWrites = [...rig.writes];
    const bIntermediateIndex = segmentBWrites.findIndex((w) => {
      const v = Number.parseFloat(w.value);
      return w.property === 'opacity' && v > 0.1 && v < 0.5;
    });
    expect(bIntermediateIndex).toBeGreaterThanOrEqual(0);

    const decisionC = planPlayback(recipe, { from: 'B', to: 'C' });
    const runC = playback.request(decisionC);
    expect(runC).toBeDefined();
    if (!runC) throw new Error('Expected runC');

    expect(runC.live).toBe(true);
    expect(runB.live).toBe(false);
    expect(rig.binding.current).toBe(runC);

    const receiptB = await runB.settled;
    expect(receiptB.outcome.status).toBe('superseded');
    expect(receiptB.current).toBe(false);

    await waitFor(
      () =>
        rig.writes.slice(segmentBWrites.length).some((w) => {
          if (w.property !== 'opacity') return false;
          const v = Number.parseFloat(w.value);
          return v > 0.5 && v < 0.9;
        }),
      2000,
      'Expected intermediate write for C',
    );

    const segmentCWrites = rig.writes.slice(segmentBWrites.length);
    const cIntermediateIndex = segmentCWrites.findIndex((w) => {
      const v = Number.parseFloat(w.value);
      return w.property === 'opacity' && v > 0.5 && v < 0.9;
    });
    expect(cIntermediateIndex).toBeGreaterThanOrEqual(0);

    const receiptC = await runC.settled;
    expect(receiptC.outcome).toEqual({ status: 'completed' });
    expect(receiptC.current).toBe(true);
    expect(runC.live).toBe(false);
    expect(rig.node.style.opacity).toBe('0.9');

    const writesAtSettlementCount = rig.writes.length;

    const bOriginalDeadline = startB + 160 + 100;
    await waitFor(
      () => performance.now() >= bOriginalDeadline + 30,
      2000,
      'Wait beyond B original deadline',
    );
    await nextFrame();
    await nextFrame();

    expect(rig.node.style.opacity).toBe('0.9');
    expect(rig.writes.length).toBe(writesAtSettlementCount);

    const lastWrite = rig.writes[rig.writes.length - 1];
    expect(lastWrite).toEqual({ property: 'opacity', value: '0.9' });

    await rig.cleanup();
  });

  it('proof 3: real cross-property authority on one node and root preserves concurrent transform across opacity replacement, showing intermediate writes and settling exact destinations', async () => {
    const elementBundle = createRecordingElement();
    const resources = new ResourceScope();
    const scheduler = new ProductionScheduler();
    const clock = createMotionClock(scheduler);
    const root = {};

    const rootResources: RootTargetResources = {
      clock,
      register: (opts) => resources.createRecord(opts),
      observeCleanup: (cleanup: CleanupFunction) => {
        void safeCleanup(cleanup);
      },
    };

    const registry = new TargetRegistry(root, () => true, undefined, rootResources, clock);
    registry.attach();

    const opacityTarget: BindingTarget = {
      name: 'surface',
      node: elementBundle.node,
      properties: ['opacity'],
      stable: { opacity: '0.1' },
    };

    const transformTarget: BindingTarget = {
      name: 'surface',
      node: elementBundle.node,
      properties: ['transform'],
      stable: { transform: 'scale(1)' },
    };

    const bindingOpacity = registry.bind(registry.rootOwner, [opacityTarget], {
      channel: 'opacity-channel',
      priority: 0,
    });

    const bindingTransform = registry.bind(registry.rootOwner, [transformTarget], {
      channel: 'transform-channel',
      priority: 0,
    });

    const playbackOpacity = createMotionPlayback(bindingOpacity);
    const playbackTransform = createMotionPlayback(bindingTransform);

    const recipeTransform = defineMotionRecipe({
      targets: { surface: { properties: ['transform'] } },
      states: {
        A: { surface: { transform: 'scale(1)' } },
        B: { surface: { transform: 'scale(2)' } },
      },
      graph: {
        kind: 'track',
        target: 'surface',
        properties: ['transform'],
        durationMs: 240,
      },
      interruption: 'replace',
    });

    const recipeOpacity1 = defineMotionRecipe({
      targets: { surface: { properties: ['opacity'] } },
      states: {
        A: { surface: { opacity: 0.1 } },
        B: { surface: { opacity: 0.9 } },
      },
      graph: {
        kind: 'track',
        target: 'surface',
        properties: ['opacity'],
        durationMs: 140,
      },
      interruption: 'replace',
    });

    const recipeOpacity2 = defineMotionRecipe({
      targets: { surface: { properties: ['opacity'] } },
      states: {
        A: { surface: { opacity: 0.9 } },
        B: { surface: { opacity: 0.4 } },
      },
      graph: {
        kind: 'track',
        target: 'surface',
        properties: ['opacity'],
        durationMs: 120,
      },
      interruption: 'replace',
    });

    const decisionTransform = planPlayback(recipeTransform, { from: 'A', to: 'B' });
    const runTransform = playbackTransform.request(decisionTransform);
    expect(runTransform).toBeDefined();
    if (!runTransform) throw new Error('Expected runTransform');
    expect(runTransform.live).toBe(true);

    const decisionOpacity1 = planPlayback(recipeOpacity1, { from: 'A', to: 'B' });
    const runOpacity1 = playbackOpacity.request(decisionOpacity1);
    expect(runOpacity1).toBeDefined();
    if (!runOpacity1) throw new Error('Expected runOpacity1');
    expect(runOpacity1.live).toBe(true);

    await waitFor(
      () =>
        elementBundle.writes.some((w) => {
          if (w.property !== 'opacity') return false;
          const v = Number.parseFloat(w.value);
          return v > 0.1 && v < 0.9;
        }),
      2000,
      'Expected intermediate opacity 1 write',
    );

    await waitFor(
      () =>
        elementBundle.writes.some((w) => {
          if (w.property !== 'transform') return false;
          const s = parseScale(w.value);
          return s !== undefined && s > 1.0 && s < 2.0;
        }),
      2000,
      'Expected intermediate transform write',
    );

    const transformWritesBeforeReplacement = elementBundle.writes.filter((w) => w.property === 'transform').length;
    const opacity2StartIndex = elementBundle.writes.length;

    const decisionOpacity2 = planPlayback(recipeOpacity2, { from: 'A', to: 'B' });
    const runOpacity2 = playbackOpacity.request(decisionOpacity2);
    expect(runOpacity2).toBeDefined();
    if (!runOpacity2) throw new Error('Expected runOpacity2');

    expect(runOpacity1.live).toBe(false);
    const receiptOpacity1 = await runOpacity1.settled;
    expect(receiptOpacity1.outcome.status).toBe('superseded');

    expect(runTransform.live).toBe(true);
    expect(bindingTransform.current).toBe(runTransform);

    await waitFor(
      () =>
        elementBundle.writes.filter((w) => w.property === 'transform').length > transformWritesBeforeReplacement,
      2000,
      'Expected transform to continue producing writes after opacity replacement',
    );

    await waitFor(
      () =>
        elementBundle.writes.slice(opacity2StartIndex).some((w) => {
          if (w.property !== 'opacity') return false;
          const v = Number.parseFloat(w.value);
          return v > 0.4 && v < 0.9;
        }),
      2000,
      'Expected intermediate opacity 2 write',
    );

    const receiptOpacity2 = await runOpacity2.settled;
    expect(receiptOpacity2.outcome).toEqual({ status: 'completed' });
    expect(receiptOpacity2.current).toBe(true);
    expect(elementBundle.node.style.opacity).toBe('0.4');

    const receiptTransform = await runTransform.settled;
    expect(receiptTransform.outcome).toEqual({ status: 'completed' });
    expect(receiptTransform.current).toBe(true);
    expect(elementBundle.node.style.transform).toBe('scale(2)');

    bindingOpacity.release();
    bindingTransform.release();
    registry.dispose();
    resources.dispose();
    await resources.whenCleanupsSettled();
    elementBundle.dispose();
  });

  it('proof 4: binding release during active playback stops authority, halts engine writes past original duration, and leaks no unhandled rejection', async () => {
    const unhandledRejections: unknown[] = [];
    const onUnhandled = (event: PromiseRejectionEvent): void => {
      unhandledRejections.push(event.reason);
    };
    window.addEventListener('unhandledrejection', onUnhandled);

    try {
      const rig = createBrowserRig({
        properties: ['opacity'],
        initialStable: { opacity: '0.1' },
      });
      const playback = createMotionPlayback(rig.binding);

      const recipe = defineMotionRecipe({
        targets: { surface: { properties: ['opacity'] } },
        states: {
          A: { surface: { opacity: 0.1 } },
          B: { surface: { opacity: 0.9 } },
        },
        graph: {
          kind: 'track',
          target: 'surface',
          properties: ['opacity'],
          durationMs: 160,
        },
        interruption: 'replace',
      });

      const startTime = performance.now();
      const decision = planPlayback(recipe, { from: 'A', to: 'B' });
      const run = playback.request(decision);
      expect(run).toBeDefined();
      if (!run) throw new Error('Expected run');

      expect(run.live).toBe(true);
      expect(rig.binding.live).toBe(true);

      await waitFor(
        () =>
          rig.writes.some((w) => {
            if (w.property !== 'opacity') return false;
            const v = Number.parseFloat(w.value);
            return v > 0.1 && v < 0.9;
          }),
        2000,
        'Expected intermediate write before release',
      );

      rig.binding.release();
      expect(rig.binding.live).toBe(false);

      const receipt = await run.settled;
      expect(receipt.outcome.status).toBe('disposed');
      expect(receipt.current).toBe(false);
      expect(run.live).toBe(false);

      const writeCountAtRelease = rig.writes.length;
      const styleAtRelease = rig.node.style.opacity;

      const originalEnd = startTime + 160 + 100;
      await waitFor(
        () => performance.now() >= originalEnd + 30,
        2000,
        'Wait past original duration',
      );
      await nextFrame();
      await nextFrame();

      expect(rig.writes.length).toBe(writeCountAtRelease);
      expect(rig.node.style.opacity).toBe(styleAtRelease);

      expect(unhandledRejections).toHaveLength(0);

      await rig.cleanup();
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled);
    }
  });

  it('proof 5 (paired control): test-only injected immediate-completion engine discriminates adapter seam, settling microtask-deferred and suppressing post-completion writes', async () => {
    const rig = createBrowserRig({
      properties: ['opacity'],
      initialStable: { opacity: '0.1' },
    });

    let capturedSink: ((value: string) => void) | undefined;
    let playInvocationCount = 0;

    const syncPlay: MotionPlaybackPlay = (_track, write) => {
      playInvocationCount++;
      capturedSink = write;
      return {
        stop() {},
        settled: Promise.resolve({ status: 'completed' as const }),
      };
    };

    const playback = createMotionPlayback(rig.binding, { play: syncPlay });

    const recipe = defineMotionRecipe({
      targets: { surface: { properties: ['opacity'] } },
      states: {
        A: { surface: { opacity: 0.1 } },
        B: { surface: { opacity: 0.8 } },
      },
      graph: {
        kind: 'track',
        target: 'surface',
        properties: ['opacity'],
        durationMs: 100,
      },
      interruption: 'replace',
    });

    const decision = planPlayback(recipe, { from: 'A', to: 'B' });
    const run = playback.request(decision);
    expect(run).toBeDefined();
    if (!run) throw new Error('Expected run');

    expect(playInvocationCount).toBe(1);
    expect(capturedSink).toBeDefined();

    const receipt = await run.settled;
    expect(receipt.outcome).toEqual({ status: 'completed' });
    expect(receipt.current).toBe(true);
    expect(run.live).toBe(false);
    expect(rig.binding.current).toBe(run);

    expect(rig.node.style.opacity).toBe('0.8');

    const writesBeforeLateAttempt = rig.writes.length;
    capturedSink!('0.999-late');

    expect(rig.writes.length).toBe(writesBeforeLateAttempt);
    expect(rig.node.style.opacity).toBe('0.8');

    await rig.cleanup();
  });

  it('proof 6: real-Motion sequential same-address tracks acquire one lease, create two upfront handles, gate successor delay-phase emissions until predecessor completion, and settle exact destination', async () => {
    let rig: BrowserRig | undefined;
    const unhandledRejections: unknown[] = [];
    const onUnhandled = (event: PromiseRejectionEvent): void => {
      unhandledRejections.push(event.reason);
    };
    window.addEventListener('unhandledrejection', onUnhandled);

    try {
      rig = createBrowserRig({
        properties: ['opacity'],
        initialStable: { opacity: '0.1' },
      });

      let leaseAcquisitions = 0;
      const originalLease = rig.binding.lease.bind(rig.binding);
      rig.binding.lease = (...args: Parameters<MotionBinding['lease']>) => {
        leaseAcquisitions++;
        return originalLease(...args);
      };

      let handleCount = 0;
      const wrappedPlay: MotionPlaybackPlay = (track, write) => {
        handleCount++;
        // A deterministic delay-phase probe: the successor sink is invoked while
        // its predecessor still owns this address. The production gate must drop
        // it; both handles then continue through the real Motion engine.
        if (handleCount === 2) write('0.9');
        return playMotionValue(track, write);
      };

      const playback = createMotionPlayback(rig.binding, { play: wrappedPlay });

      const recipe = defineMotionRecipe({
        targets: { surface: { properties: ['opacity'] } },
        states: {
          A: { surface: { opacity: 0.1 } },
          B: { surface: { opacity: 0.5 } },
          C: { surface: { opacity: 0.9 } },
          D: { surface: { opacity: 0.3 } },
        },
        graph: {
          kind: 'sequence',
          steps: [
            {
              kind: 'track',
              target: 'surface',
              properties: ['opacity'],
              from: 'A',
              to: 'B',
              durationMs: 150,
            },
            {
              kind: 'track',
              target: 'surface',
              properties: ['opacity'],
              from: 'C',
              to: 'D',
              durationMs: 150,
            },
          ],
        },
        interruption: 'replace',
      });

      const decision = planPlayback(recipe, { from: 'A', to: 'D' });
      const run = playback.request(decision);
      expect(run).toBeDefined();
      if (!run) throw new Error('Expected run');

      expect(handleCount).toBe(2);
      expect(leaseAcquisitions).toBe(1);
      expect(run.live).toBe(true);
      expect(rig.binding.current).toBe(run);

      // Verify intermediate writes from segment 1 (0.1 -> 0.5) appear:
      await waitFor(
        () =>
          rig!.writes.some((w) => {
            if (w.property !== 'opacity') return false;
            const v = Number.parseFloat(w.value);
            return v > 0.1 && v < 0.5;
          }),
        2000,
        'Expected intermediate write from segment 1',
      );

      // While segment 1 is in-flight, verify no successor write near 0.9 has leaked through:
      const inFlightSeg1Writes = rig.writes.filter((w) => w.property === 'opacity');
      expect(inFlightSeg1Writes.length).toBeGreaterThan(0);
      for (const w of inFlightSeg1Writes) {
        const v = Number.parseFloat(w.value);
        expect(v).toBeLessThanOrEqual(0.5);
      }

      // Wait for segment 2 to begin writing values (values > 0.5):
      await waitFor(
        () =>
          rig!.writes.some((w) => {
            if (w.property !== 'opacity') return false;
            const v = Number.parseFloat(w.value);
            return v > 0.5;
          }),
        2000,
        'Expected successor segment write after predecessor completion',
      );

      // Wait for segment 2 intermediate writes descending towards 0.3:
      await waitFor(
        () => {
          const writes = rig!.writes.filter((w) => w.property === 'opacity');
          const successorStartIndex = writes.findIndex((w) => Number.parseFloat(w.value) > 0.5);
          if (successorStartIndex < 0) return false;
          const successorWrites = writes.slice(successorStartIndex);
          return successorWrites.some((w) => {
            const v = Number.parseFloat(w.value);
            return v > 0.3 && v < 0.9;
          });
        },
        2000,
        'Expected intermediate write from segment 2',
      );

      const receipt = await run.settled;
      expect(receipt.outcome).toEqual({ status: 'completed' });
      expect(receipt.current).toBe(true);
      expect(run.live).toBe(false);
      expect(rig.binding.current).toBe(run);

      const opacityWrites = rig.writes.filter((w) => w.property === 'opacity');
      const successorStartIndex = opacityWrites.findIndex((w) => Number.parseFloat(w.value) > 0.5);
      expect(successorStartIndex).toBeGreaterThan(0);

      const segment1Writes = opacityWrites.slice(0, successorStartIndex);
      const segment2Writes = opacityWrites.slice(successorStartIndex);

      // Require non-vacuous intermediate writes from both segments:
      const seg1Intermediates = segment1Writes.filter((w) => {
        const v = Number.parseFloat(w.value);
        return v > 0.1 && v < 0.5;
      });
      expect(seg1Intermediates.length).toBeGreaterThan(0);

      const seg2Intermediates = segment2Writes.filter((w) => {
        const v = Number.parseFloat(w.value);
        return v > 0.3 && v < 0.9;
      });
      expect(seg2Intermediates.length).toBeGreaterThan(0);

      // Prove no successor-source/delay-phase value near 0.9 was accepted before predecessor completed:
      for (const w of segment1Writes) {
        const v = Number.parseFloat(w.value);
        expect(v).toBeLessThanOrEqual(0.5);
      }

      const lastSeg1Write = segment1Writes[segment1Writes.length - 1];
      expect(lastSeg1Write).toBeDefined();
      const lastSeg1Val = Number.parseFloat(lastSeg1Write!.value);
      expect(lastSeg1Val).toBeGreaterThan(0.1);
      expect(lastSeg1Val).toBeLessThanOrEqual(0.5);

      // Successor begins from its distinct source near 0.9:
      const firstSeg2Val = Number.parseFloat(segment2Writes[0]!.value);
      expect(firstSeg2Val).toBeGreaterThan(0.5);
      expect(firstSeg2Val).toBeLessThanOrEqual(0.9);

      // Exact final stable destination after settlement:
      expect(rig.node.style.opacity).toBe('0.3');
      const lastWrite = opacityWrites[opacityWrites.length - 1];
      expect(lastWrite).toEqual({ property: 'opacity', value: '0.3' });

      // No post-settlement writes over next animation frames:
      const writeCountAtSettlement = rig.writes.length;
      await nextFrame();
      await nextFrame();
      await nextFrame();
      expect(rig.writes.length).toBe(writeCountAtSettlement);
      expect(rig.node.style.opacity).toBe('0.3');

      expect(unhandledRejections).toHaveLength(0);
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled);
      if (rig) {
        await rig.cleanup();
      }
    }
  });
});
