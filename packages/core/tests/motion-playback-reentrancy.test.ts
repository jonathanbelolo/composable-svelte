import { describe, expect, it, vi } from 'vitest';
import { defineMotionRecipe, type CompiledProperty, type CompiledMotion, type TargetSchema, type StableProjection } from '../src/lib/application/motion/compiler.js';
import { planPlayback, type PlaybackDecision, type PlayDecision, type StableOnlyDecision } from '../src/lib/application/motion/playback-plan.js';
import { normalizeMotionValue, type MotionProperty } from '../src/lib/application/motion/properties.js';
import type { EngineSettlement, MotionTrackSpec } from '../src/lib/application/renderer/motion-engine.js';
import { createMotionPlayback, type MotionPlaybackDiagnostic, type MotionPlaybackPlay } from '../src/lib/application/renderer/motion-playback.js';
import { createMotionClock, type MotionPlan, type MotionRun } from '../src/lib/application/renderer/motion-run.js';
import { TargetRegistry, type BindingTarget, type RootTargetResources } from '../src/lib/application/renderer/target-registry.js';
import { ResourceScope, safeCleanup } from '../src/lib/execution/resources.js';
import { ProductionScheduler } from '../src/lib/execution/scheduler.js';

function fixture(targets: readonly string[] = ['box']) {
  const scheduler = new ProductionScheduler();
  const clock = createMotionClock(scheduler);
  const scope = new ResourceScope();
  const styles = new Map<string, Map<string, string>>();
  const bindingTargets: BindingTarget[] = targets.map((name) => {
    const targetStyles = new Map<string, string>([['opacity', '1'], ['width', '100px']]);
    styles.set(name, targetStyles);
    const mockElement = {
      nodeType: 1 as const,
      style: {
        setProperty: (k: string, v: string) => { targetStyles.set(k, v); },
        getPropertyValue: (k: string) => targetStyles.get(k) ?? '',
      },
      getAttribute: () => null,
      parentElement: null,
      querySelectorAll: () => [],
    } as unknown as HTMLElement;
    return { name, node: mockElement, properties: ['opacity', 'width'] as const, stable: { opacity: '1', width: '100px' } };
  });
  const rootResources: RootTargetResources = {
    clock,
    register: (opts) => scope.createRecord(opts),
    observeCleanup: (fn) => { void safeCleanup(fn); },
  };
  const registry = new TargetRegistry({}, () => true, undefined, rootResources, clock);
  registry.attach();
  const binding = registry.bind(registry.rootOwner, bindingTargets, { channel: 'test', priority: 0 });
  return {
    binding,
    styles,
    dispose: () => { binding.release(); registry.dispose(); scope.dispose(); },
  };
}

function makePlayDecision(opts: { fallbacks?: number; durationMs?: number; stable?: StableProjection<any> } = {}): PlayDecision<any> {
  const stable = opts.stable ?? { box: { opacity: '1', width: '100px' } };
  const from = normalizeMotionValue('width', 0);
  const to = normalizeMotionValue('width', { value: 10, unit: '%' });
  const properties: CompiledProperty[] = Array.from({ length: opts.fallbacks ?? 0 }, (_, i) => ({
    property: `prop-${i}` as MotionProperty,
    from,
    to,
    interpolation: { native: false, ticker: false, fallback: 'stable' as const },
  }));
  const compiled: CompiledMotion<any> = {
    tracks: properties.length ? [{ target: Object.keys(stable)[0]!, startMs: 0, durationMs: 100, properties, easing: 'linear', channel: 'default', priority: 0, optional: false, available: 'ready' }] : [],
    durationMs: opts.durationMs ?? 100,
    outcome: 'playback',
    missingRequired: [],
    skippedOptional: [],
    tokens: { durationMs: 100, easing: 'linear', amplitude: 1, reduction: 'instant', disabled: false, reduced: false },
    stable,
  };
  return { kind: 'play', compiled, publishable: Object.freeze({ ...stable }), stable };
}

function classifiedDecision(
  reason: 'disabled' | 'reduced',
  stable: StableProjection<any>,
): StableOnlyDecision<any> {
  const play = makePlayDecision({ stable });
  return { kind: 'stable-only', reason, stable, publishable: play.publishable, compiled: play.compiled };
}

describe('motion playback reentrancy and boundary contracts', () => {
  describe('Proof 10 & 15: pre-read and publication boundaries', () => {
    it('hostile getter in decision leaves incumbent untouched and reads each getter exactly once', async () => {
      const { binding, dispose } = fixture();
      const playback = createMotionPlayback(binding);
      const incumbent = binding.start({ deadlineMs: 100, execute() {}, stable() {} });
      const reads = { kind: 0, stable: 0, compiled: 0 };
      const hostile = {
        get kind(): never { reads.kind++; throw new Error('hostile getter'); },
        get stable() { reads.stable++; return { box: { opacity: '1' } }; },
        get compiled() { reads.compiled++; return { durationMs: 100, tracks: [] }; },
      } as unknown as PlaybackDecision;
      expect(playback.request(hostile)).toBeUndefined();
      expect(reads).toEqual({ kind: 1, stable: 0, compiled: 0 });
      expect(binding.current).toBe(incumbent);
      expect(incumbent.live).toBe(true);
      expect(playback.diagnostics[0]).toMatchObject({ kind: 'request-rejected', phase: 'pre-read', message: 'hostile getter' });
      expect((await incumbent.settled).outcome.status).toBe('completed');
      dispose();
    });

    it('capability pre-read duration failure leaves incumbent untouched', () => {
      const { binding, dispose } = fixture();
      const playback = createMotionPlayback(binding);
      const incumbent = binding.start({ deadlineMs: 100, execute() {}, stable() {} });
      expect(playback.request(makePlayDecision({ durationMs: -1 }))).toBeUndefined();
      expect(binding.current).toBe(incumbent);
      expect(playback.diagnostics[0]).toMatchObject({ kind: 'request-rejected', phase: 'pre-read', name: 'RangeError' });
      dispose();
    });

    it('publication failure is contained, leaves incumbent, and is never retried', () => {
      const { binding, dispose } = fixture();
      const playback = createMotionPlayback(binding);
      const incumbent = binding.start({ deadlineMs: 100, execute() {}, stable() {} });
      let stableCalls = 0;
      vi.spyOn(binding, 'stable').mockImplementation(() => { stableCalls++; throw new Error('pub failed'); });
      const startSpy = vi.spyOn(binding, 'start');
      const decision = classifiedDecision('disabled', { box: { opacity: '0.5' } });
      expect(playback.request(decision)).toBeUndefined();
      expect(stableCalls).toBe(1);
      expect(startSpy).not.toHaveBeenCalled();
      expect(binding.current).toBe(incumbent);
      expect(playback.diagnostics[0]).toMatchObject({ kind: 'request-rejected', phase: 'publication', message: 'pub failed' });
      dispose();
    });

    it('start failure is contained and never retried', () => {
      const { binding, dispose } = fixture();
      const playback = createMotionPlayback(binding);
      let startCalls = 0;
      vi.spyOn(binding, 'start').mockImplementation(() => { startCalls++; throw new Error('start failed'); });
      const decision = classifiedDecision('disabled', { box: { opacity: '0.5' } });
      expect(playback.request(decision)).toBeUndefined();
      expect(startCalls).toBe(1);
      expect(playback.diagnostics[0]).toMatchObject({ kind: 'request-rejected', phase: 'start', message: 'start failed' });
      dispose();
    });

    it('Proof 15: later stable publication throw leaves first stable update visible and produces one frozen diagnostic', () => {
      const { binding, styles, dispose } = fixture(['box1', 'box2']);
      const playback = createMotionPlayback(binding);
      const incumbent = binding.start({ deadlineMs: 100, execute() {}, stable() {} });
      const originalStable = binding.stable.bind(binding);
      vi.spyOn(binding, 'stable').mockImplementation((target, values) => {
        if (target === 'box2') throw new Error('box2 pub failed');
        originalStable(target, values);
      });
      const decision = classifiedDecision('disabled', { box1: { opacity: '0.2' }, box2: { opacity: '0.8' } });
      expect(playback.request(decision)).toBeUndefined();
      expect(styles.get('box1')?.get('opacity')).toBe('0.2');
      expect(styles.get('box2')?.get('opacity')).toBe('1');
      expect(binding.current).toBe(incumbent);
      expect(playback.diagnostics).toHaveLength(1);
      expect(Object.isFrozen(playback.diagnostics)).toBe(true);
      expect(Object.isFrozen(playback.diagnostics[0]!)).toBe(true);
      expect(playback.diagnostics[0]!).toMatchObject({ kind: 'request-rejected', phase: 'publication', message: 'box2 pub failed' });
      dispose();
    });
  });

  describe('Proof 11: diagnostic sink resilience', () => {
    it('synchronous throwing diagnostic sink cannot change request receipt or throw out', () => {
      const { binding, dispose } = fixture();
      const sink = vi.fn(() => { throw new Error('sink throw'); });
      const playback = createMotionPlayback(binding, { diagnostic: sink });
      const bad = { get kind(): never { throw new Error('bad'); } } as unknown as PlaybackDecision;
      expect(() => playback.request(bad)).not.toThrow();
      expect(sink).toHaveBeenCalledTimes(1);
      expect(playback.diagnostics[0]!.kind).toBe('request-rejected');
      dispose();
    });

    it('asynchronous rejected diagnostic sink does not leak unhandled rejection or alter receipt', async () => {
      const { binding, dispose } = fixture();
      const sink = vi.fn(async () => { throw new Error('async sink reject'); });
      const playback = createMotionPlayback(binding, { diagnostic: sink });
      const unhandled: unknown[] = [];
      const onUnhandled = (err: unknown) => { unhandled.push(err); };
      process.on('unhandledRejection', onUnhandled);
      try {
        const stable = { box: { opacity: '0.7' } };
        const decision: StableOnlyDecision<any> = { kind: 'stable-only', reason: 'compile-rejected', stable, publishable: Object.freeze({ ...stable }), diagnostic: { name: 'E', message: 'M' }, error: { name: 'E', message: 'M' } };
        const run = playback.request(decision);
        expect(run).toBeDefined();
        expect((await run!.settled).outcome).toEqual({ status: 'skipped', reason: 'unavailable' });
        await Promise.resolve();
        await Promise.resolve();
        expect(unhandled).toHaveLength(0);
        expect(sink).toHaveBeenCalledTimes(1);
      } finally {
        process.off('unhandledRejection', onUnhandled);
        dispose();
      }
    });
  });

  describe('Proof 13: nested request reentrancy during stable publication', () => {
    it('nested same-adapter request during first stable publication increments generation and suppresses outer execution', async () => {
      const { binding, styles, dispose } = fixture(['box1', 'box2']);
      const sinkSpy = vi.fn();
      const playback = createMotionPlayback(binding, { diagnostic: sinkSpy });
      let nestedRun: MotionRun | undefined;
      let nestedStarted = false;
      let inNestedRequest = false;
      let outerBox2Calls = 0;
      const originalStable = binding.stable.bind(binding);
      const nestedDecision = classifiedDecision('reduced', { box1: { opacity: '0.99' }, box2: { opacity: '0.88' } });
      const outerStable = { box1: { opacity: '0.11' }, box2: { opacity: '0.22' } };
      const outerDecision: PlaybackDecision<any> = { kind: 'stable-only', reason: 'compile-rejected', stable: outerStable, publishable: Object.freeze({ ...outerStable }), diagnostic: { name: 'E', message: 'M' }, error: { name: 'E', message: 'M' } };
      vi.spyOn(binding, 'stable').mockImplementation((target, values) => {
        originalStable(target, values);
        if (target === 'box1' && !nestedStarted) {
          nestedStarted = true;
          inNestedRequest = true;
          nestedRun = playback.request(nestedDecision);
          inNestedRequest = false;
        }
        else if (target === 'box2' && !inNestedRequest) outerBox2Calls++;
      });
      expect(playback.request(outerDecision)).toBeUndefined();
      expect(nestedRun).toBeDefined();
      expect(binding.current).toBe(nestedRun);
      expect(outerBox2Calls).toBe(0);
      expect(styles.get('box1')?.get('opacity')).toBe('0.99');
      expect(styles.get('box2')?.get('opacity')).toBe('0.88');
      expect(sinkSpy).not.toHaveBeenCalled();
      expect(playback.diagnostics).toHaveLength(0);
      expect((await nestedRun!.settled).outcome).toEqual({ status: 'skipped', reason: 'reducedMotion' });
      dispose();
    });
  });

  describe('Proof 14: direct binding.start reentrancy during stable publication', () => {
    it('direct binding.start reentry during stable changes binding.current and suppresses outer fallback diagnostic', async () => {
      const { binding, dispose } = fixture(['box1', 'box2']);
      const sinkSpy = vi.fn();
      const playback = createMotionPlayback(binding, { diagnostic: sinkSpy });
      let directRun: MotionRun | undefined;
      let outerBox2Published = false;
      const originalStable = binding.stable.bind(binding);
      vi.spyOn(binding, 'stable').mockImplementation((target, values) => {
        originalStable(target, values);
        if (target === 'box1') directRun = binding.start({ deadlineMs: 50, complete: true, execute() {}, stable() {} });
        else if (target === 'box2') outerBox2Published = true;
      });
      const outerDecision = makePlayDecision({ fallbacks: 1, stable: { box1: { opacity: '0.33', width: '50%' }, box2: { opacity: '0.44', width: '50%' } } });
      expect(playback.request(outerDecision)).toBeUndefined();
      expect(outerBox2Published).toBe(false);
      expect(binding.current).toBe(directRun);
      expect(sinkSpy).not.toHaveBeenCalled();
      expect(playback.diagnostics).toHaveLength(0);
      expect((await directRun!.settled).outcome).toEqual({ status: 'completed' });
      dispose();
    });
  });

  describe('Proof 12: handle lifecycle, sequential gating, and liveness loss', () => {
    it('loss of liveness during reentrant lease acquisition aborts playback before engine start', async () => {
      const { binding, dispose } = fixture();
      const playSpy = vi.fn<MotionPlaybackPlay>();
      const playback = createMotionPlayback(binding, { play: playSpy });
      const originalLease = binding.lease.bind(binding);
      vi.spyOn(binding, 'lease').mockImplementation((target, property, run, cleanup) => {
        binding.release();
        return originalLease(target, property, run, cleanup);
      });
      const decision = makePlayDecision({ stable: { box: { opacity: '1', width: '100px' } } });
      // Add playable track
      const from = normalizeMotionValue('opacity', 0), to = normalizeMotionValue('opacity', 1);
      (decision.compiled.tracks as unknown as object[]).push({
        target: 'box', startMs: 0, durationMs: 100, properties: [{ property: 'opacity', from, to, interpolation: { native: true, ticker: true, fallback: 'stable' } }],
        easing: 'linear', channel: 'default', priority: 0, optional: false, available: 'ready',
      });
      const run = playback.request(decision);
      expect(run).toBeDefined();
      expect(playSpy).not.toHaveBeenCalled();
      const receipt = await run!.settled;
      expect(['disposed', 'failed']).toContain(receipt.outcome.status);
      dispose();
    });

    it('synchronous injected completion settles microtask deferred and cannot write after liveness loss', async () => {
      const { binding, styles, dispose } = fixture();
      let capturedSink!: (val: string) => void;
      const syncPlay: MotionPlaybackPlay = (_track, write) => {
        capturedSink = write;
        return { stop() {}, settled: Promise.resolve({ status: 'completed' as const }) };
      };
      const playback = createMotionPlayback(binding, { play: syncPlay });
      const from = normalizeMotionValue('opacity', 0), to = normalizeMotionValue('opacity', 1);
      const decision = makePlayDecision();
      (decision.compiled.tracks as unknown as object[]).push({
        target: 'box', startMs: 0, durationMs: 100, properties: [{ property: 'opacity', from, to, interpolation: { native: true, ticker: true, fallback: 'stable' } }],
        easing: 'linear', channel: 'default', priority: 0, optional: false, available: 'ready',
      });
      const run = playback.request(decision);
      expect(run).toBeDefined();
      expect((await run!.settled).outcome.status).toBe('completed');
      expect(run!.live).toBe(false);
      const before = styles.get('box')?.get('opacity');
      capturedSink('0.999');
      expect(styles.get('box')?.get('opacity')).toBe(before);
      dispose();
    });

    it('stopped handle stays pending and late failed handle does not leak unhandled rejection', async () => {
      const { binding, styles, dispose } = fixture();
      let settleHandle!: (s: EngineSettlement) => void;
      const settled = new Promise<EngineSettlement>((r) => { settleHandle = r; });
      let sink!: (v: string) => void;
      const play: MotionPlaybackPlay = (_track, write) => {
        sink = write;
        return { stop() { settleHandle({ status: 'stopped' }); }, settled };
      };
      const playback = createMotionPlayback(binding, { play });
      const unhandled: unknown[] = [];
      const onUnhandled = (err: unknown) => { unhandled.push(err); };
      process.on('unhandledRejection', onUnhandled);
      try {
        const from = normalizeMotionValue('opacity', 0), to = normalizeMotionValue('opacity', 1);
        const decision = makePlayDecision();
        (decision.compiled.tracks as unknown as object[]).push({
          target: 'box', startMs: 0, durationMs: 100, properties: [{ property: 'opacity', from, to, interpolation: { native: true, ticker: true, fallback: 'stable' } }],
          easing: 'linear', channel: 'default', priority: 0, optional: false, available: 'ready',
        });
        const run = playback.request(decision);
        expect(run).toBeDefined();
        sink('0.3');
        expect(styles.get('box')?.get('opacity')).toBe('0.3');
        binding.start({ deadlineMs: 50, complete: true, execute() {}, stable() {} });
        await run!.settled;
        settleHandle({ status: 'failed', error: new Error('late engine catastrophe') });
        await Promise.resolve();
        await Promise.resolve();
        expect(unhandled).toHaveLength(0);
        sink('0.7');
        expect(styles.get('box')?.get('opacity')).not.toBe('0.7');
      } finally {
        process.off('unhandledRejection', onUnhandled);
        dispose();
      }
    });
  });

  describe('Proof 16: diagnostics bounds, frozen snapshots, string bounding, and single-instance reuse', () => {
    it('repeated requests share one adapter instance and ring caps at 32 with eviction', () => {
      const { binding, dispose } = fixture();
      const playback = createMotionPlayback(binding);
      for (let i = 0; i < 35; i++) {
        const bad = { get kind(): never { throw new Error(`err-${i}`); } } as unknown as PlaybackDecision;
        playback.request(bad);
      }
      expect(playback.diagnostics).toHaveLength(32);
      expect(playback.diagnostics[0]).toMatchObject({ kind: 'request-rejected', message: 'err-3' });
      expect(playback.diagnostics[31]).toMatchObject({ kind: 'request-rejected', message: 'err-34' });
      dispose();
    });

    it('fallback entries cap at 8 while total reflects count, with frozen snapshot and bounded strings', () => {
      const { binding, dispose } = fixture();
      const playback = createMotionPlayback(binding);
      const decision = makePlayDecision({ fallbacks: 12 });
      playback.request(decision);
      expect(playback.diagnostics).toHaveLength(1);
      const diag = playback.diagnostics[0]!;
      expect(diag.kind).toBe('interpolation-fallback');
      if (diag.kind === 'interpolation-fallback') {
        expect(diag.entries).toHaveLength(8);
        expect(diag.total).toBe(12);
        expect(Object.isFrozen(diag)).toBe(true);
        expect(Object.isFrozen(diag.entries)).toBe(true);
        for (const entry of diag.entries) expect(Object.isFrozen(entry)).toBe(true);
      }
      const snap1 = playback.diagnostics, snap2 = playback.diagnostics;
      expect(Object.isFrozen(snap1)).toBe(true);
      expect(snap1).not.toBe(snap2);

      const giantErr = new Error('M'.repeat(2000));
      giantErr.name = 'N'.repeat(300);
      Object.assign(giantErr, { domNode: { nodeType: 1 }, decision });
      playback.request({ get kind(): never { throw giantErr; } } as unknown as PlaybackDecision);
      const rec = playback.diagnostics[1]!;
      expect(rec.kind).toBe('request-rejected');
      if (rec.kind === 'request-rejected') {
        expect(rec.name.length).toBeLessThanOrEqual(128);
        expect(rec.message.length).toBeLessThanOrEqual(1024);
        expect(rec).not.toHaveProperty('domNode');
        expect(rec).not.toHaveProperty('decision');
      }
      dispose();
    });
  });

  describe('Generic recipe type witness', () => {
    it('witness: compiles and requests a concrete recipe without widening to TargetSchema', async () => {
      const { binding, styles, dispose } = fixture();
      const recipe = defineMotionRecipe({
        targets: { box: { properties: ['opacity'] } },
        states: { base: { box: { opacity: 0 } }, active: { box: { opacity: 1 } } },
        graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 50 },
        interruption: 'replace',
      });
      const decision = planPlayback(recipe, { from: 'base', to: 'active' });
      const fakePlay: MotionPlaybackPlay = (_track, write) => {
        write('0.5');
        return { stop() {}, settled: Promise.resolve({ status: 'completed' as const }) };
      };
      const playback = createMotionPlayback(binding, { play: fakePlay });
      const run1 = playback.request(decision);
      expect(run1).toBeDefined();
      expect((await run1!.settled).outcome.status).toBe('completed');
      expect(styles.get('box')?.get('opacity')).toBe('1');
      const run2 = playback.request(decision);
      expect(run2).toBeDefined();
      expect((await run2!.settled).outcome.status).toBe('completed');
      dispose();
    });
  });

  describe('Opus B2 discriminators', () => {
    it('(1) generation-only invalidation: nested pre-read failure during outer publication aborts outer publication and start without changing binding.current', () => {
      const { binding, styles, dispose } = fixture(['box1', 'box2']);
      const startSpy = vi.spyOn(binding, 'start');
      const playback = createMotionPlayback(binding);
      const incumbent = binding.start({ deadlineMs: 100, execute() {}, stable() {} });
      expect(binding.current).toBe(incumbent);
      expect(startSpy).toHaveBeenCalledTimes(1);

      let outerBox2Published = false;
      let nestedCalled = false;
      const originalStable = binding.stable.bind(binding);
      vi.spyOn(binding, 'stable').mockImplementation((target, values) => {
        originalStable(target, values);
        if (target === 'box1' && !nestedCalled) {
          nestedCalled = true;
          const failingNested = {
            get kind(): never {
              throw new Error('nested pre-read failure');
            },
          } as unknown as PlaybackDecision;
          const nestedResult = playback.request(failingNested);
          expect(nestedResult).toBeUndefined();
        } else if (target === 'box2') {
          outerBox2Published = true;
        }
      });

      const outerDecision = classifiedDecision('disabled', {
        box1: { opacity: '0.2' },
        box2: { opacity: '0.8' },
      });

      const outerResult = playback.request(outerDecision);
      expect(outerResult).toBeUndefined();
      expect(outerBox2Published).toBe(false);
      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(binding.current).toBe(incumbent);
      expect(styles.get('box1')?.get('opacity')).toBe('0.2');
      expect(styles.get('box2')?.get('opacity')).toBe('1');
      expect(playback.diagnostics).toHaveLength(1);
      expect(playback.diagnostics[0]).toMatchObject({
        kind: 'request-rejected',
        phase: 'pre-read',
        message: 'nested pre-read failure',
      });
      dispose();
    });

    describe('(2) stale outer failure silence', () => {
      it('pre-read getter throwing after nested accepted request suppresses outer diagnostic and leaves nested run current', async () => {
        const { binding, dispose } = fixture();
        const incumbent = binding.start({ deadlineMs: 100, execute() {}, stable() {} });
        expect(binding.current).toBe(incumbent);
        const sinkSpy = vi.fn();
        const playback = createMotionPlayback(binding, { diagnostic: sinkSpy });

        let nestedRun: MotionRun | undefined;
        const nestedDecision = classifiedDecision('disabled', { box: { opacity: '0.4' } });

        const hostileDecision = {
          get kind(): never {
            nestedRun = playback.request(nestedDecision);
            throw new Error('outer pre-read throw after nested accepted');
          },
        } as unknown as PlaybackDecision;

        const outerResult = playback.request(hostileDecision);
        expect(outerResult).toBeUndefined();
        expect(nestedRun).toBeDefined();
        expect(binding.current).toBe(nestedRun);
        expect(incumbent.live).toBe(false);
        expect((await nestedRun!.settled).outcome).toEqual({ status: 'skipped', reason: 'disabled' });
        expect(sinkSpy).not.toHaveBeenCalled();
        expect(playback.diagnostics).toHaveLength(0);

        dispose();
      });

      it('stable publication throwing after nested accepted request suppresses outer diagnostic and leaves nested run current', async () => {
        const { binding, styles, dispose } = fixture(['box1', 'box2']);
        const incumbent = binding.start({ deadlineMs: 100, execute() {}, stable() {} });
        expect(binding.current).toBe(incumbent);
        const sinkSpy = vi.fn();
        const playback = createMotionPlayback(binding, { diagnostic: sinkSpy });

        let nestedRun: MotionRun | undefined;
        let nestedStarted = false;
        const originalStable = binding.stable.bind(binding);
        vi.spyOn(binding, 'stable').mockImplementation((target, values) => {
          originalStable(target, values);
          if (target === 'box1' && !nestedStarted) {
            nestedStarted = true;
            const nestedDecision = classifiedDecision('disabled', {
              box1: { opacity: '0.9' },
              box2: { opacity: '0.9' },
            });
            nestedRun = playback.request(nestedDecision);
            throw new Error('outer publication throw after nested accepted');
          }
        });

        const outerDecision = classifiedDecision('reduced', {
          box1: { opacity: '0.1' },
          box2: { opacity: '0.2' },
        });

        const outerResult = playback.request(outerDecision);
        expect(outerResult).toBeUndefined();
        expect(nestedRun).toBeDefined();
        expect(binding.current).toBe(nestedRun);
        expect(incumbent.live).toBe(false);
        expect((await nestedRun!.settled).outcome).toEqual({ status: 'skipped', reason: 'disabled' });
        expect(styles.get('box1')?.get('opacity')).toBe('0.9');
        expect(styles.get('box2')?.get('opacity')).toBe('0.9');
        expect(sinkSpy).not.toHaveBeenCalled();
        expect(playback.diagnostics).toHaveLength(0);

        dispose();
      });
    });

    it('(3) diagnostic ordering: prepared fallback diagnostic invokes external sink only after binding.start supersedes incumbent and installs returned run', () => {
      const { binding, dispose } = fixture();
      const incumbent = binding.start({ deadlineMs: 100, execute() {}, stable() {} });
      expect(incumbent.live).toBe(true);
      expect(binding.current).toBe(incumbent);

      let sinkCalls = 0;
      let incumbentLiveAtSink: boolean | undefined;
      let bindingCurrentAtSink: MotionRun | undefined;
      let startedRun: MotionRun | undefined;

      const originalStart = binding.start.bind(binding);
      vi.spyOn(binding, 'start').mockImplementation((plan) => {
        startedRun = originalStart(plan);
        return startedRun;
      });

      const sink = vi.fn((record: MotionPlaybackDiagnostic) => {
        if (record.kind === 'interpolation-fallback') {
          sinkCalls++;
          incumbentLiveAtSink = incumbent.live;
          bindingCurrentAtSink = binding.current;
          expect(incumbent.live).toBe(false);
          expect(binding.current).toBe(startedRun);
        }
      });

      const playback = createMotionPlayback(binding, { diagnostic: sink });
      const decision = makePlayDecision({ fallbacks: 1 });
      const run = playback.request(decision);

      expect(run).toBeDefined();
      expect(startedRun).toBe(run);
      expect(sinkCalls).toBe(1);
      expect(sink).toHaveBeenCalledTimes(1);
      expect(incumbentLiveAtSink).toBe(false);
      expect(bindingCurrentAtSink).toBe(run);
      expect(binding.current).toBe(run);
      expect(incumbent.live).toBe(false);
      expect(playback.diagnostics).toHaveLength(1);
      expect(playback.diagnostics[0]!.kind).toBe('interpolation-fallback');

      dispose();
    });

    describe('(4) root post-start guard', () => {
      it('direct binding.start replacement during incumbent cleanup displaces outer run and suppresses fallback diagnostic', () => {
        const { binding, dispose } = fixture();
        const sinkSpy = vi.fn();
        const playback = createMotionPlayback(binding, { diagnostic: sinkSpy });

        let reentrantRun: MotionRun | undefined;
        const incumbent = binding.start({
          deadlineMs: 100,
          execute(context) {
            context.adopt(() => {
              reentrantRun = binding.start({
                deadlineMs: 0,
                complete: true,
                execute() {},
                stable() {},
              });
            });
          },
          stable() {},
        });
        expect(binding.current).toBe(incumbent);

        const outerDecision = makePlayDecision({ fallbacks: 1 });
        const outerRun = playback.request(outerDecision);

        expect(outerRun).toBeDefined();
        expect(reentrantRun).toBeDefined();
        expect(binding.current).toBe(reentrantRun);
        expect(binding.current).not.toBe(outerRun);
        expect(outerRun!.live).toBe(false);
        expect(sinkSpy).not.toHaveBeenCalled();
        expect(playback.diagnostics).toHaveLength(0);

        dispose();
      });

      it('binding release during incumbent cleanup retires binding and suppresses fallback diagnostic', () => {
        const { binding, dispose } = fixture();
        const sinkSpy = vi.fn();
        const playback = createMotionPlayback(binding, { diagnostic: sinkSpy });

        const incumbent = binding.start({
          deadlineMs: 100,
          execute(context) {
            context.adopt(() => {
              binding.release();
            });
          },
          stable() {},
        });
        expect(binding.current).toBe(incumbent);

        const outerDecision = makePlayDecision({ fallbacks: 1 });
        const outerRun = playback.request(outerDecision);

        expect(outerRun).toBeDefined();
        expect(binding.live).toBe(false);
        // release retires the binding but intentionally does not erase its last
        // current receipt. This equality makes the live-clause discriminator:
        // a guard that checked current alone would incorrectly emit.
        expect(binding.current).toBe(outerRun);
        expect(sinkSpy).not.toHaveBeenCalled();
        expect(playback.diagnostics).toHaveLength(0);

        dispose();
      });
    });
  });
});
