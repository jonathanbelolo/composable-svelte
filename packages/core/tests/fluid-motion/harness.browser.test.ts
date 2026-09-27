/**
 * Browser motion evidence test suite.
 * Exercises the reusable real-browser harness (recorder, rendering checkpoints, removal witness,
 * diagnostics, semantics and safety checks) against the public S1 staged route application
 * assembly, with positive controls that each check detects a real bad state.
 *
 * Evidence is DOM/style state at rendering checkpoints (after all rAF callbacks, before paint),
 * not compositor output. Discrete checks are not analytic continuity proof.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, tick } from 'svelte';
import { page } from 'vitest/browser';
import { reactiveProps } from './slice-fixtures/props.svelte.js';
import SliceApp from './slice-fixtures/SliceApp.svelte';
import {
  choreography,
  requesters,
  type SliceState,
  type SliceAction,
  type Intent
} from './slice-fixtures/SliceModel.js';
import { getApplicationInternal } from '../../src/lib/application/instance.svelte.js';
import { captureHTML } from '../../src/lib/application/renderer/capture-html.js';
import type { ApplicationInstance, StagedRouteRequester } from '../../src/lib/application/index.js';
import {
  analyzeMotionAcrossBoundary,
  analyzeRemovalBoundary,
  checkDecorationSafety,
  countTextExposure,
  createRemovalWitness,
  detectDiscontinuities,
  estimateAdjacentVelocities,
  evaluateHandoff,
  findOpacityIncreases,
  nextRenderingCheckpoint,
  observeElement,
  startMotionRecorder,
  waitForRenderingCheckpoint,
  type FrameSample,
  type MotionAcrossBoundary,
  type RemovalWitness
} from './harness/index.js';

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const stop of cleanups.splice(0).reverse()) {
    await stop();
  }
  vi.restoreAllMocks();
  requesters.length = 0;
  // Bounded cleanup: every recorder/witness released its checkpoint probe.
  expect(document.querySelectorAll('[data-motion-harness-probe]').length).toBe(0);
});

const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
const PLANE = '[data-composable-route-plane]';
const BODY_REP = '[data-route-representation="body"]';
const HERO_REP = '[data-route-representation="hero"]';
const BODY_TEXT = 'Home body text';

function setup(url = '/') {
  const oldURL = location.href;
  const oldState = history.state;
  history.replaceState(null, '', url);

  const target = document.createElement('div');
  document.body.append(target);

  const trace: string[] = [];
  let app!: ApplicationInstance<SliceState, SliceAction>;
  const props = reactiveProps({
    url,
    dependencies: { trace },
    onApp: (value: ApplicationInstance<SliceState, SliceAction>) => {
      app = value;
    },
    hostVisible: true as boolean
  });

  const component = mount(SliceApp, { target, props });
  let destroyed = false;
  const destroy = async () => {
    if (destroyed) return;
    destroyed = true;
    await unmount(component);
    target.remove();
  };

  cleanups.push(async () => {
    await destroy();
    history.replaceState(oldState, '', oldURL);
  });

  const staged = () => getApplicationInternal(app).staged!;

  return {
    target,
    trace,
    props,
    destroy,
    get app() {
      return app;
    },
    staged,
    requester(where: string): StagedRouteRequester<Intent> {
      return [...requesters].reverse().find(entry => entry.where === where)!.requester;
    }
  };
}

/** Runs the S1 home → detail motion to completion (plane released) with the given observers. */
async function runMotion(fixture: ReturnType<typeof setup>, witness?: RemovalWitness) {
  const handle = fixture.requester('home').request({ to: '/detail' }, { motion: choreography });
  expect(handle.status).toEqual({ type: 'admitted', transaction: expect.any(Number) });
  const finished = await waitForRenderingCheckpoint(
    () => document.querySelector(PLANE) === null && fixture.target.querySelector('[data-body]') === null && (!witness || witness.followUp !== undefined),
    3000
  );
  expect(finished).toBe(true);
}

const center = (rect: DOMRect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const contains = (rect: DOMRect, point: { x: number; y: number }) =>
  point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;

function fixedBox(rect: { left: number; top: number; width: number; height: number }, tag = 'div') {
  const el = document.createElement(tag);
  el.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;margin:0;padding:0;border:0;`;
  document.body.append(el);
  cleanups.push(() => el.remove());
  return el;
}

/**
 * Synthetic handoff driven like the route host: a fading source is removed and a prepared
 * representation revealed inside a rAF callback registered after the observers. `mode` injects
 * one specific bad state so each check is shown to detect it.
 */
async function runSyntheticHandoff(mode: 'correct' | 'earlyReveal' | 'lateReveal' | 'restoration' | 'snap') {
  const container = document.createElement('div');
  document.body.append(container);
  cleanups.push(() => container.remove());
  const source = document.createElement('div');
  source.textContent = 'Synthetic source';
  source.style.cssText = 'position:absolute;left:20px;top:200px;width:160px;height:24px;';
  container.append(source);
  const plane = document.createElement('div');
  plane.inert = true;
  plane.setAttribute('aria-hidden', 'true');
  plane.style.cssText = 'position:fixed;inset:0;pointer-events:none;';
  const rep = document.createElement('div');
  rep.textContent = 'Synthetic source';
  rep.style.cssText = 'position:fixed;left:20px;top:200px;width:160px;height:24px;opacity:0;';
  plane.append(rep);
  document.body.append(plane);
  cleanups.push(() => plane.remove());

  const recorder = startMotionRecorder({ targets: { source: () => source, rep: () => rep } });
  cleanups.push(() => recorder.dispose());
  const witness = createRemovalWitness({ container, source, representation: () => rep });
  cleanups.push(() => witness.disconnect());

  const REMOVAL = 6;
  const value = (n: number) => 1 - n * 0.05;
  let n = 0;
  let done = false;
  const writer = () => {
    n++;
    if (n < REMOVAL) {
      source.style.opacity = mode === 'restoration' && n === REMOVAL - 1 ? '' : String(value(n));
      if (mode === 'earlyReveal' && n === REMOVAL - 1) rep.style.opacity = String(value(n));
    } else if (n === REMOVAL) {
      source.remove();
      if (mode !== 'lateReveal') rep.style.opacity = mode === 'snap' ? '1' : String(value(n));
    } else {
      rep.style.opacity = String(value(n));
    }
    if (n < REMOVAL + 3) requestAnimationFrame(writer);
    else done = true;
  };
  await nextFrame();
  await nextFrame();
  requestAnimationFrame(writer);
  expect(await waitForRenderingCheckpoint(() => done && witness.followUp !== undefined, 2000)).toBe(true);
  const result = recorder.stop();
  return { result, witness, boundary: analyzeRemovalBoundary(result.frames, 'source', 'rep') };
}

/**
 * Shared "motion crosses the commit" predicate. `declared` is the track the participant is known to
 * follow before the commit; thresholds are fractions of it:
 * - both 50 ms windows around the boundary hold sampled intervals and move at ≥ 50% of the declared
 *   mean speed;
 * - it has covered ≥ 25% of the declared pre-commit distance by the boundary;
 * - ≥ 50% of the whole recorded travel still remains after the boundary.
 * Discrete sampled displacement, not analytic C1.
 */
const CROSSING_WINDOW_MS = 50;
function crossesBoundary(motion: MotionAcrossBoundary | undefined, declared: { distancePx: number; durationMs: number }): boolean {
  if (!motion) return false;
  const minSpeed = 0.5 * (declared.distancePx / declared.durationMs);
  const total = motion.travelledBeforeBoundary + motion.remainingAfterBoundary;
  return (
    motion.timeBefore >= CROSSING_WINDOW_MS / 2 &&
    motion.timeAfter >= CROSSING_WINDOW_MS / 2 &&
    motion.speedBefore >= minSpeed &&
    motion.speedAfter >= minSpeed &&
    motion.travelledBeforeBoundary >= 0.25 * declared.distancePx &&
    total > 0 &&
    motion.remainingAfterBoundary >= 0.5 * total
  );
}

/** S1 hero track before commit (SliceModel `choreography`): via dy -20 px over 700 ms, ease-in-out. */
const HERO_DECLARED = { distancePx: 20, durationMs: 700 };

/** Mean speed over intervals in which the target moved (px/ms). */
function meanMovingSpeed(frames: readonly FrameSample[], target: string): number {
  const moving = estimateAdjacentVelocities(frames, target).filter(v => v.speed > 1e-3);
  const time = moving.reduce((sum, v) => sum + v.dt, 0);
  return time > 0 ? moving.reduce((sum, v) => sum + v.speed * v.dt, 0) / time : 0;
}

function opacityHandoff(witness: RemovalWitness) {
  const event = witness.event!;
  const last = event.lastCheckpointBeforeRemoval!;
  const previous = event.previousCheckpointBeforeRemoval!;
  return evaluateHandoff(
    { time: previous.time, value: previous.sourceOpacity },
    { time: last.time, value: last.sourceOpacity },
    { time: event.time, value: event.contemporaneousRepresentation.computedOpacity ?? Number.NaN },
    { absoluteTolerance: 0.01 }
  );
}

describe('Browser motion evidence harness', () => {
  it('rendering checkpoint samples a one-frame bad state written after the recorder; animation-frame phase misses it', async () => {
    const box = fixedBox({ left: 10, top: 10, width: 40, height: 40 });
    // Both recorders start before the writer, so their rAF callbacks precede it in every frame.
    const entry = startMotionRecorder({ targets: { box }, phase: 'animationFrame' });
    const checkpoint = startMotionRecorder({ targets: { box } });
    cleanups.push(() => entry.dispose(), () => checkpoint.dispose());

    let n = 0;
    const writer = () => {
      n++;
      if (n === 4) {
        box.style.opacity = '0';
        // Reverted by a task, i.e. after this frame's rendering update: exactly one bad frame.
        setTimeout(() => (box.style.opacity = '1'), 0);
      }
      if (n < 10) requestAnimationFrame(writer);
    };
    requestAnimationFrame(writer);
    expect(await waitForRenderingCheckpoint(() => n >= 10, 2000)).toBe(true);
    await nextRenderingCheckpoint();

    const entryResult = entry.stop();
    const checkpointResult = checkpoint.stop();
    expect(checkpointResult.phase).toBe('renderingCheckpoint');
    expect(checkpointResult.missedCheckpoints).toBe(0);
    expect(checkpointResult.frames.filter(f => f.elements.box?.opacity === 0)).toHaveLength(1);
    expect(entryResult.phase).toBe('animationFrame');
    expect(entryResult.frames.length).toBeGreaterThanOrEqual(8);
    expect(entryResult.frames.filter(f => f.elements.box?.opacity === 0)).toHaveLength(0);
  });

  it('records the shared hero across the mid-timeline commit: starts at the source, moves continuously, lands on the destination; source suppressed, landing crossfade complementary', async () => {
    const fixture = setup('/');
    await tick();
    await nextFrame();

    const sourceHero = fixture.target.querySelector('[data-hero="home"]')!;
    expect(sourceHero).not.toBeNull();
    const sourceHeroRect = sourceHero.getBoundingClientRect();

    const recorder = startMotionRecorder({
      maxFrames: 400,
      targets: {
        heroSource: () => sourceHero,
        heroDestination: '[data-hero="detail"]',
        heroRep: HERO_REP,
        plane: PLANE
      }
    });
    cleanups.push(() => recorder.dispose());

    await runMotion(fixture);
    const result = recorder.stop();
    expect(result.truncated).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.missedCheckpoints).toBe(0);
    expect(detectDiscontinuities(result.frames, 'heroRep', { maxSpeed: Number.POSITIVE_INFINITY, maxOpacityJump: 1 })
      .filter(v => v.reason.startsWith('Non-monotonic'))).toEqual([]);

    const repFrames = result.frames.filter(f => f.elements.heroRep?.paintEligible);
    expect(repFrames.length).toBeGreaterThanOrEqual(8);

    // Starts at the source hero geometry.
    const first = repFrames[0]!.elements.heroRep!.rect!;
    expect(Math.abs(first.left - sourceHeroRect.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(first.top - sourceHeroRect.top)).toBeLessThanOrEqual(1);

    // Lands on the destination hero geometry.
    const destination = fixture.target.querySelector('[data-hero="detail"]')!;
    expect(destination).not.toBeNull();
    const destinationRect = destination.getBoundingClientRect();
    const last = repFrames.at(-1)!.elements.heroRep!.rect!;
    expect(Math.abs(last.left - destinationRect.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(last.top - destinationRect.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(last.width - destinationRect.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(last.height - destinationRect.height)).toBeLessThanOrEqual(1);

    // Moves, and crosses the commit (source removal) while moving.
    const travel = Math.hypot(last.left - first.left, last.top - first.top);
    expect(travel).toBeGreaterThan(100);
    const commitIndex = repFrames.findIndex(f => !f.elements.heroSource?.connected);
    expect(commitIndex).toBeGreaterThan(0);
    expect(commitIndex).toBeLessThan(repFrames.length - 1);
    const crossing = analyzeMotionAcrossBoundary(repFrames, 'heroRep', commitIndex, CROSSING_WINDOW_MS);
    expect(crossesBoundary(crossing, HERO_DECLARED), JSON.stringify(crossing)).toBe(true);

    // No teleport: per-frame speed stays within 5× the run's own mean moving speed.
    const meanSpeed = meanMovingSpeed(repFrames, 'heroRep');
    expect(meanSpeed).toBeGreaterThan(0);
    expect(detectDiscontinuities(repFrames, 'heroRep', { maxSpeed: 5 * meanSpeed, maxJumpPx: 0, maxOpacityJump: 1 })).toEqual([]);

    // The source hero is never painted alongside its representation.
    for (const frame of repFrames) expect(frame.elements.heroSource?.paintEligible ?? false).toBe(false);

    // The destination hero appears only through the runtime's landing crossfade (text-bearing
    // shared content, run.ts): at the landed geometry, with complementary opacity. Whether that
    // crossfade meets the visual "no double opacity" policy is the visual author's decision.
    const crossfade = repFrames.filter(f => f.elements.heroDestination?.paintEligible);
    expect(crossfade.length).toBeGreaterThanOrEqual(1);
    const firstCrossfade = repFrames.indexOf(crossfade[0]!);
    expect(repFrames.slice(firstCrossfade).every(f => f.elements.heroDestination?.paintEligible)).toBe(true);
    for (const frame of crossfade) {
      const repRect = frame.elements.heroRep!.rect!;
      expect(Math.abs(repRect.left - destinationRect.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(repRect.top - destinationRect.top)).toBeLessThanOrEqual(1);
      expect(Math.abs(frame.elements.heroRep!.opacity! + frame.elements.heroDestination!.opacity! - 1)).toBeLessThanOrEqual(0.02);
    }
  });

  it('positive control: hero teleport and double paint are detected by the same assertions', () => {
    const sample = (i: number, left: number, repOpacity: number, sourceEligible: boolean): FrameSample => ({
      time: 100 + i * 16,
      frameIndex: i,
      elements: {
        heroRep: { ...observeElement(null), connected: true, rect: new DOMRect(left, 0, 50, 20), opacity: repOpacity, paintEligible: repOpacity > 0 },
        heroSource: { ...observeElement(null), connected: true, paintEligible: sourceEligible }
      }
    });
    // Ten 10px steps, one 280px teleport at frame 11, then rest; frame 5 double-paints.
    const lefts = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 380, 380];
    const frames = lefts.map((left, i) => sample(i, left, 1, i === 5));
    const teleports = detectDiscontinuities(frames, 'heroRep', { maxSpeed: 5 * meanMovingSpeed(frames, 'heroRep'), maxJumpPx: 0, maxOpacityJump: 1 });
    expect(teleports.map(v => v.frameIndex)).toEqual([11]);
    expect(frames.filter(f => f.elements.heroRep?.paintEligible && f.elements.heroSource?.paintEligible).map(f => f.frameIndex)).toEqual([5]);
  });

  it('positive/negative controls: motion crossing a real removal passes; motion stopped before it fails', async () => {
    const run = async (moveMs: number) => {
      const container = document.createElement('div');
      document.body.append(container);
      cleanups.push(() => container.remove());
      const source = document.createElement('p');
      source.textContent = 'Outgoing';
      container.append(source);
      const box = fixedBox({ left: 0, top: 100, width: 40, height: 40 });
      const recorder = startMotionRecorder({ targets: { box, source: () => source } });
      cleanups.push(() => recorder.dispose());
      // Declared track: 300 px in 500 ms; removal once 200 ms have elapsed. `moveMs` < 200 stops early.
      let start: number | undefined;
      let done = false;
      const writer = (time: number) => {
        start ??= time;
        const elapsed = time - start;
        box.style.transform = `translateX(${300 * Math.min(1, elapsed / moveMs)}px)`;
        if (elapsed >= 200 && source.isConnected) source.remove();
        if (elapsed < 500) requestAnimationFrame(writer);
        else done = true;
      };
      requestAnimationFrame(writer);
      expect(await waitForRenderingCheckpoint(() => done, 2000)).toBe(true);
      const { frames } = recorder.stop();
      const boundary = analyzeRemovalBoundary(frames, 'source', 'box').firstAfter!;
      expect(boundary).toBeGreaterThan(0);
      return analyzeMotionAcrossBoundary(frames, 'box', boundary, CROSSING_WINDOW_MS);
    };
    const declared = { distancePx: 300, durationMs: 500 };
    const crossing = await run(500);
    expect(crossesBoundary(crossing, declared), JSON.stringify(crossing)).toBe(true);
    const stopped = await run(120);
    expect(crossesBoundary(stopped, declared), JSON.stringify(stopped)).toBe(false);
    expect(stopped!.speedBefore).toBe(0);
    expect(stopped!.speedAfter).toBe(0);
    expect(stopped!.remainingAfterBoundary).toBe(0);

    // Review counterexample (harness-astra-review.md A2): moves during frames 0–10, commit at 20.
    const frames: FrameSample[] = Array.from({ length: 30 }, (_, i) => ({
      time: i * 16,
      frameIndex: i,
      elements: { heroRep: { ...observeElement(null), connected: true, rect: new DOMRect(Math.min(i, 10) * 30, 0, 50, 20) } }
    }));
    expect(crossesBoundary(analyzeMotionAcrossBoundary(frames, 'heroRep', 20, CROSSING_WINDOW_MS), { distancePx: 300, durationMs: 160 })).toBe(false);
  });

  it('witness failure in either callback ends both observers with one error and no later observations', async () => {
    const run = async (failAt: 'checkpoint' | 'removal') => {
      const container = document.createElement('div');
      document.body.append(container);
      cleanups.push(() => container.remove());
      const source = document.createElement('p');
      source.textContent = 'Source';
      container.append(source);
      const rep = fixedBox({ left: 0, top: 0, width: 20, height: 20 });
      let reads = 0;
      let thrown = false;
      const representation = () => {
        reads++;
        const due = failAt === 'checkpoint' || !source.isConnected;
        if (due && !thrown) {
          thrown = true;
          throw new Error(`one-shot representation read failed at ${failAt}`);
        }
        return rep;
      };
      const witness = createRemovalWitness({ container, source, representation });
      cleanups.push(() => witness.disconnect());
      await nextRenderingCheckpoint();
      await nextRenderingCheckpoint();
      source.remove();
      await nextRenderingCheckpoint();
      await nextRenderingCheckpoint();
      const readsAfter = reads;
      container.append(document.createElement('span'));
      await nextRenderingCheckpoint();
      await nextRenderingCheckpoint();
      return { witness, thrown, reads, readsAfter };
    };

    for (const phase of ['checkpoint', 'removal'] as const) {
      const { witness, thrown, reads, readsAfter } = await run(phase);
      expect(thrown).toBe(true);
      expect(witness.error).toBe(`${phase}: Error: one-shot representation read failed at ${phase}`);
      expect(witness.isObserving).toBe(false);
      expect(witness.isTriggered).toBe(false);
      expect(witness.event).toBeUndefined();
      expect(witness.followUp).toBeUndefined();
      expect(reads).toBe(readsAfter);
      expect(document.querySelectorAll('[data-motion-harness-probe]').length).toBe(0);
    }

    // Negative control: the same scenario without a failure completes normally and ends observing.
    const container = document.createElement('div');
    document.body.append(container);
    cleanups.push(() => container.remove());
    const source = document.createElement('p');
    source.textContent = 'Source';
    container.append(source);
    const rep = fixedBox({ left: 0, top: 0, width: 20, height: 20 });
    const witness = createRemovalWitness({ container, source, representation: () => rep });
    cleanups.push(() => witness.disconnect());
    await nextRenderingCheckpoint();
    source.remove();
    expect(await waitForRenderingCheckpoint(() => witness.followUp !== undefined, 1000)).toBe(true);
    expect(witness.error).toBeUndefined();
    expect(witness.isTriggered).toBe(true);
    expect(witness.event).toBeDefined();
    expect(witness.isObserving).toBe(false);
    expect(document.querySelectorAll('[data-motion-harness-probe]').length).toBe(0);
  });

  it('outgoing body: no double paint, no blank gap, no restored-style frame, and value/geometry handoff within the sampled-time bound', async () => {
    const fixture = setup('/');
    await tick();
    await nextFrame();

    // Original source captured by identity: the selector later matches nothing or incoming content.
    const bodySource = fixture.target.querySelector('[data-body]')!;
    expect(bodySource).not.toBeNull();

    const recorder = startMotionRecorder({ targets: { bodySource: () => bodySource, bodyRep: BODY_REP } });
    cleanups.push(() => recorder.dispose());
    const witness = createRemovalWitness({ container: fixture.target, source: bodySource, representation: BODY_REP });
    cleanups.push(() => witness.disconnect());

    await runMotion(fixture, witness);
    const result = recorder.stop();
    expect(result.truncated).toBe(false);
    expect(result.missedCheckpoints).toBe(0);
    expect(witness.error).toBeUndefined();

    // The fade is actually observed on both sides of the removal.
    const boundary = analyzeRemovalBoundary(result.frames, 'bodySource', 'bodyRep');
    expect(boundary.lastBefore).toBeGreaterThanOrEqual(3);
    expect(boundary.firstAfter).toBe(boundary.lastBefore! + 1);
    expect(result.frames[boundary.lastBefore!]!.elements.bodySource?.paintEligible).toBe(true);
    expect(result.frames[boundary.firstAfter!]!.elements.bodyRep?.paintEligible).toBe(true);
    expect(boundary.doublePaintFrames).toEqual([]);
    expect(boundary.gapFrames).toEqual([]);
    expect(boundary.revealedAfterRemoval).toBe(true);

    // No cancellation-restored styles: the source never brightens before removal,
    // and the representation continues the fade.
    expect(findOpacityIncreases(result.frames, 'bodySource')).toEqual([]);
    expect(findOpacityIncreases(result.frames.slice(boundary.firstAfter), 'bodyRep')).toEqual([]);

    // Removal interval: hidden at the last checkpoint before removal, eligible at removal and after.
    const event = witness.event!;
    expect(event.revealedWithinRemovalInterval).toBe(true);
    expect(event.sameFlushReveal).toBe(true);
    expect(event.lastCheckpointBeforeRemoval!.representation.isPaintEligible).toBe(false);
    expect(event.lastCheckpointBeforeRemoval!.sourcePaintEligible).toBe(true);
    expect(event.contemporaneousRepresentation.isPaintEligible).toBe(true);
    expect(witness.followUp!.representation.isPaintEligible).toBe(true);

    // Value handoff: representation opacity continues the sampled source fade.
    const opacity = opacityHandoff(witness);
    expect(opacity.slope).toBeLessThan(0);
    expect(opacity, JSON.stringify(opacity)).toMatchObject({ ok: true });

    // Geometry handoff: the stationary source's last sampled box, both axes and size.
    const sourceRect = event.lastCheckpointBeforeRemoval!.sourceRect;
    const repRect = event.contemporaneousRepresentation.rect!;
    expect(sourceRect.top).toBeGreaterThan(0);
    for (const key of ['left', 'top', 'width', 'height'] as const) {
      expect(Math.abs(repRect[key] - sourceRect[key]), key).toBeLessThanOrEqual(0.5);
    }
  });

  it('positive controls: early reveal, late reveal, restored styles and snapped values are each detected', async () => {
    const correct = await runSyntheticHandoff('correct');
    expect(correct.boundary.doublePaintFrames).toEqual([]);
    expect(correct.boundary.gapFrames).toEqual([]);
    expect(findOpacityIncreases(correct.result.frames, 'source')).toEqual([]);
    expect(correct.witness.event!.revealedWithinRemovalInterval).toBe(true);
    expect(opacityHandoff(correct.witness).ok).toBe(true);

    const early = await runSyntheticHandoff('earlyReveal');
    expect(early.boundary.doublePaintFrames).toHaveLength(1);
    expect(early.witness.event!.contemporaneousRepresentation.isPaintEligible).toBe(true);
    expect(early.witness.event!.revealedWithinRemovalInterval).toBe(false);
    expect(early.witness.event!.sameFlushReveal).toBe(false);

    const late = await runSyntheticHandoff('lateReveal');
    expect(late.boundary.gapFrames).toHaveLength(1);
    expect(late.boundary.revealedAfterRemoval).toBe(true);
    expect(late.witness.event!.revealedWithinRemovalInterval).toBe(false);
    expect(late.witness.followUp!.representation.isPaintEligible).toBe(false);

    const restoration = await runSyntheticHandoff('restoration');
    expect(findOpacityIncreases(restoration.result.frames, 'source')).toHaveLength(1);

    const snap = await runSyntheticHandoff('snap');
    expect(snap.boundary.doublePaintFrames).toEqual([]);
    expect(snap.witness.event!.revealedWithinRemovalInterval).toBe(true);
    expect(opacityHandoff(snap.witness).ok).toBe(false);
  });

  it('paint eligibility requires a two-dimensional box, rendering and visible ancestors', () => {
    const zeroWidth = fixedBox({ left: 0, top: 0, width: 0, height: 20 });
    zeroWidth.textContent = 'x';
    const zeroHeight = fixedBox({ left: 0, top: 0, width: 20, height: 0 });
    const hiddenParent = fixedBox({ left: 0, top: 0, width: 20, height: 20 });
    hiddenParent.style.opacity = '0';
    const child = document.createElement('div');
    child.style.cssText = 'width:10px;height:10px;';
    hiddenParent.append(child);
    const visible = fixedBox({ left: 0, top: 0, width: 20, height: 20 });

    expect(observeElement(zeroWidth).paintEligible).toBe(false);
    expect(observeElement(zeroHeight).paintEligible).toBe(false);
    expect(observeElement(child).paintEligible).toBe(false);
    expect(observeElement(child).hasHiddenAncestor).toBe(true);
    expect(observeElement(child).effectiveOpacity).toBe(0);
    expect(observeElement(visible).paintEligible).toBe(true);
  });

  it('pointer input reaches a live control under a moving representation; a pointer-accepting overlay is detected', async () => {
    const fixture = setup('/');
    await tick();
    await nextFrame();

    // Live control placed over the source hero, below the later-appended plane in paint order.
    const heroRect = fixture.target.querySelector('[data-hero="home"]')!.getBoundingClientRect();
    const button = fixedBox({ left: heroRect.left + 20, top: heroRect.top + 20, width: 60, height: 30 }, 'button') as HTMLButtonElement;
    button.type = 'button';
    button.textContent = 'Live';
    const buttonCenter = center(button.getBoundingClientRect());

    const recorder = startMotionRecorder({ targets: { button, heroRep: HERO_REP, plane: PLANE } });
    cleanups.push(() => recorder.dispose());
    await runMotion(fixture);
    const { frames } = recorder.stop();

    const covered = frames.filter(f => f.elements.plane?.connected && f.elements.heroRep?.paintEligible && contains(f.elements.heroRep.rect!, buttonCenter));
    expect(covered.length).toBeGreaterThanOrEqual(3);
    for (const frame of covered) {
      expect(frame.elements.button?.hitTested).toBe(true);
      expect(frame.elements.button?.isHitTarget).toBe(true);
      expect(frame.elements.button?.hitElementTag).toBe('button');
    }

    // Positive control on the same geometry: a pointer-accepting overlay blocks, pointer-events:none does not.
    const overlay = fixedBox(button.getBoundingClientRect());
    await nextRenderingCheckpoint();
    const blocked = observeElement(button);
    expect(blocked.hitTested).toBe(true);
    expect(blocked.isHitTarget).toBe(false);
    expect(blocked.hitElementTag).toBe('div');
    overlay.style.pointerEvents = 'none';
    expect(observeElement(button).isHitTarget).toBe(true);
  });

  it('semantics while the plane exists: one main/navigation landmark and no duplicated exposed text; a leaked copy is detected', async () => {
    const fixture = setup('/');
    await tick();
    await nextFrame();

    await expect.element(page.getByRole('navigation')).toBeVisible();
    await expect.element(page.getByRole('main')).toBeVisible();

    fixture.requester('home').request({ to: '/detail' }, { motion: choreography });
    expect(await waitForRenderingCheckpoint(() => document.querySelector(PLANE) !== null, 1000)).toBe(true);
    let checkpoints = 0;
    let duplicatedInDom = 0;
    while (document.querySelector(PLANE)) {
      checkpoints++;
      expect(page.getByRole('main').elements().length).toBeLessThanOrEqual(1);
      expect(page.getByRole('navigation').elements()).toHaveLength(1);
      const body = countTextExposure(BODY_TEXT);
      const hero = countTextExposure('Hero');
      expect(body.exposed).toBeLessThanOrEqual(1);
      expect(hero.exposed).toBeLessThanOrEqual(1);
      if (body.dom > body.exposed || hero.dom > hero.exposed) duplicatedInDom++;
      expect(checkpoints).toBeLessThan(400);
      await nextRenderingCheckpoint();
    }
    // Non-vacuous: checks ran while representations duplicated content in the DOM.
    expect(checkpoints).toBeGreaterThanOrEqual(5);
    expect(duplicatedInDom).toBeGreaterThanOrEqual(3);

    // Positive control on the same queries: an exposed copy is counted, an aria-hidden one is not.
    const mains = page.getByRole('main').elements().length;
    const baseline = countTextExposure(BODY_TEXT);
    const leaked = document.createElement('main');
    leaked.innerHTML = `<p>${BODY_TEXT} leaked</p>`;
    document.body.append(leaked);
    cleanups.push(() => leaked.remove());
    expect(page.getByRole('main').elements().length).toBe(mains + 1);
    expect(countTextExposure(BODY_TEXT)).toEqual({ dom: baseline.dom + 1, exposed: baseline.exposed + 1 });
    leaked.setAttribute('aria-hidden', 'true');
    expect(page.getByRole('main').elements().length).toBe(mains);
    expect(countTextExposure(BODY_TEXT)).toEqual({ dom: baseline.dom + 1, exposed: baseline.exposed });
  });

  it('live route plane is safe decoration; unsafe content injected into it and exposed plane flags are detected', async () => {
    const fixture = setup('/');
    await tick();
    await nextFrame();

    fixture.requester('home').request({ to: '/detail' }, { motion: choreography });
    expect(await waitForRenderingCheckpoint(() => document.querySelector(`${PLANE} ${BODY_REP}`) !== null, 1000)).toBe(true);

    // Non-vacuous: the expected active plane exists and holds representations.
    const plane = document.querySelector(PLANE)!;
    expect(plane).not.toBeNull();
    expect(plane.querySelector(HERO_REP)).not.toBeNull();

    const safety = checkDecorationSafety(plane);
    expect(safety.violations).toEqual([]);
    expect(safety.isSafe).toBe(true);
    expect(safety.inert).toBe(true);
    expect(safety.ariaHidden).toBe(true);

    // Positive controls against the live plane.
    const injected = document.createElement('button');
    injected.id = 'injected-live-id';
    injected.setAttribute('onclick', 'void 0');
    plane.append(injected);
    const unsafe = checkDecorationSafety(plane);
    injected.remove();
    expect(unsafe.isSafe).toBe(false);
    expect(unsafe.bannedIds).toEqual(['injected-live-id']);
    expect(unsafe.bannedControls).toEqual(['button']);
    expect(unsafe.violations.some(v => v.startsWith('Inline event handler'))).toBe(true);

    (plane as HTMLElement).inert = false;
    const exposed = checkDecorationSafety(plane);
    (plane as HTMLElement).inert = true;
    expect(exposed.isSafe).toBe(false);
    expect(exposed.inert).toBe(false);
    expect(checkDecorationSafety(plane).isSafe).toBe(true);
  });

  it('runtime capture neutralizes controls and identities that a raw clone of the same source keeps', () => {
    const source = document.createElement('div');
    source.innerHTML = '<span>Card</span> <button id="card-action" type="button">Open</button> <a id="card-link" href="#card">More</a>';
    document.body.append(source);
    cleanups.push(() => source.remove());

    const capture = captureHTML(source);
    expect(capture.kind).toBe('captured');
    if (capture.kind !== 'captured') return;
    expect(capture.node.textContent).toContain('Open');
    const captured = checkDecorationSafety(capture.node);
    expect(captured.violations).toEqual([]);

    const raw = source.cloneNode(true) as HTMLElement;
    raw.inert = true;
    raw.setAttribute('aria-hidden', 'true');
    const cloned = checkDecorationSafety(raw);
    expect(cloned.isSafe).toBe(false);
    expect(cloned.bannedIds).toEqual(['card-action', 'card-link']);
    expect(cloned.bannedControls).toEqual(['button', 'a']);
  });

  it('records focus identity, containment and :focus-visible', async () => {
    const wrapper = fixedBox({ left: 0, top: 0, width: 200, height: 40 });
    const input = document.createElement('input');
    wrapper.append(input);
    const recorder = startMotionRecorder({ targets: { wrapper, input } });
    cleanups.push(() => recorder.dispose());

    await nextRenderingCheckpoint();
    input.focus();
    await nextRenderingCheckpoint();
    await nextRenderingCheckpoint();
    const { frames } = recorder.stop();
    const before = frames[0]!.elements;
    const after = frames.at(-1)!.elements;
    expect(before.input?.isFocused).toBe(false);
    expect(before.wrapper?.containsFocus).toBe(false);
    expect(after.input?.isFocused).toBe(true);
    expect(after.input?.focusVisible).toBe(true);
    expect(after.wrapper?.isFocused).toBe(false);
    expect(after.wrapper?.containsFocus).toBe(true);
  });

  it('cleanly stops recorder and witness, releasing rAF loops and probes without leaked frames', async () => {
    setup('/');
    await tick();
    await nextFrame();

    const recorder = startMotionRecorder({ targets: { body: '[data-body]' } });
    cleanups.push(() => recorder.dispose());
    const witness = createRemovalWitness({ container: document.body, source: '[data-body]' });
    cleanups.push(() => witness.disconnect());

    await nextRenderingCheckpoint();
    await nextRenderingCheckpoint();
    expect(recorder.isRecording).toBe(true);
    expect(document.querySelectorAll('[data-motion-harness-probe]').length).toBe(2);

    const result = recorder.stop();
    witness.disconnect();
    expect(recorder.isRecording).toBe(false);
    const countAtStop = result.frames.length;
    expect(countAtStop).toBeGreaterThanOrEqual(1);
    expect(document.querySelectorAll('[data-motion-harness-probe]').length).toBe(0);

    await nextFrame();
    await nextFrame();
    expect(recorder.frames.length).toBe(countAtStop);

    recorder.dispose();
    expect(recorder.frames.length).toBe(0);
  });

  it('a sampling error stops the recorder and is reported instead of truncating silently', async () => {
    const broken = { isConnected: true } as unknown as Element;
    const recorder = startMotionRecorder({ targets: { broken: () => broken } });
    cleanups.push(() => recorder.dispose());
    await nextRenderingCheckpoint();
    await nextRenderingCheckpoint();
    expect(recorder.isRecording).toBe(false);
    expect(recorder.error).toMatch(/TypeError/);
    const result = recorder.stop();
    expect(result.error).toMatch(/TypeError/);
    expect(result.recordedCount).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('bounded retention reports truncation', async () => {
    const recorder = startMotionRecorder({ maxFrames: 3, targets: { root: () => document.body } });
    cleanups.push(() => recorder.dispose());
    expect(await waitForRenderingCheckpoint(() => !recorder.isRecording, 1000)).toBe(true);
    const result = recorder.stop();
    expect(result.recordedCount).toBe(3);
    expect(result.truncated).toBe(true);
  });

  it('positive control: diagnostic detects intentional synthetic discontinuities', () => {
    const base = observeElement(null);
    const frame = (time: number, frameIndex: number, left: number, opacity: number): FrameSample => ({
      time,
      frameIndex,
      elements: { testBox: { ...base, connected: true, rect: new DOMRect(left, 10, 50, 50), opacity } }
    });
    // Frame 2 teleports 338px in 16ms and drops opacity by 0.88.
    const syntheticFrames = [frame(100, 0, 10, 1.0), frame(116, 1, 12, 0.98), frame(132, 2, 350, 0.1)];

    const velocities = estimateAdjacentVelocities(syntheticFrames, 'testBox');
    expect(velocities.length).toBe(2);
    const [v0, v1] = velocities;
    if (!v0 || !v1) throw new Error('velocities undefined');
    expect(v0.speed).toBeCloseTo(2 / 16, 2);
    expect(v1.speed).toBeGreaterThan(20);

    const violations = detectDiscontinuities(syntheticFrames, 'testBox', { maxSpeed: 4.0, maxJumpPx: 80, maxOpacityJump: 0.35 });
    expect(violations.length).toBe(2);
    expect(violations.some(v => v.reason.includes('Position discontinuity'))).toBe(true);
    expect(violations.some(v => v.reason.includes('Opacity discontinuity'))).toBe(true);
  });

  it('positive control: safety checker detects unsafe decorative clones with root controls, duplicate IDs, and resources', () => {
    // Root itself is an interactive button with a duplicate ID, containing a resource element
    const unsafeRoot = document.createElement('button');
    unsafeRoot.id = 'banned-root-id';
    unsafeRoot.innerHTML = `
      <span>Unsafe decoration content</span>
      <video src="track.mp4"></video>
      <input type="text" value="banned-input" />
      <span role="checkbox"></span>
    `;

    const report = checkDecorationSafety(unsafeRoot);
    expect(report.isSafe).toBe(false);
    expect(report.inert).toBe(false);
    expect(report.ariaHidden).toBe(false);
    expect(report.bannedIds).toContain('banned-root-id');
    expect(report.bannedControls.some(c => c.startsWith('button'))).toBe(true);
    expect(report.bannedControls.some(c => c.startsWith('input'))).toBe(true);
    expect(report.bannedControls).toContain('span[role=checkbox]');
    expect(report.bannedResources).toContain('video');
    expect(report.violations.length).toBeGreaterThanOrEqual(5);

    // Also verify that null target is rejected
    const nullReport = checkDecorationSafety(null);
    expect(nullReport.isSafe).toBe(false);
  });
});
