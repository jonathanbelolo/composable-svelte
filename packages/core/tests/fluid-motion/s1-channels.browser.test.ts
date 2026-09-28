/**
 * S1 browser witnesses (run in Chromium, Firefox and WebKit by vitest.fluid-motion.config.ts): CSS cubic-bezier
 * reference accuracy, channel easing through a real run (opacity, geometry, radius, clip, waypoint override), and
 * outgoing/incoming slide + scale composed with stable transforms, hit boxes, focus and lease cleanup.
 */
import { afterEach, expect, it } from 'vitest';
import { RouteHost } from '../../src/lib/application/renderer/choreography/route-host.js';
import { ChoreographyRun, type VisualClock } from '../../src/lib/application/renderer/choreography/run.js';
import { defineChoreography } from '../../src/lib/application/renderer/choreography/plan.js';
import { sampleEasing } from '../../src/lib/application/renderer/choreography/channels.js';
import type { ChannelEasing, CubicBezierPoints } from '../../src/lib/application/renderer/choreography/channel-types.js';
import { liveChoreographyLeases } from '../../src/lib/application/renderer/target-registry.js';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); expect(liveChoreographyLeases()).toBe(0); });
function rig() {
  let now = 0, id = 0;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: VisualClock = {
    now: () => now,
    frame: fn => { frames.set(++id, fn); return id; },
    cancelFrame: id => { frames.delete(id as number); },
    timeout: (fn, delay) => { timers.set(++id, { at: now + delay, fn }); return id; },
    clearTimeout: id => { timers.delete(id as number); }
  };
  const host = new RouteHost(undefined, window, clock, {});
  const owner = {};
  stops.push(() => host.dispose());
  const step = (ms: number) => { now = ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); for (const [id, t] of timers) if (t.at <= now) { timers.delete(id); t.fn(); } };
  const node = (key: string, scoped: object = owner, tag = 'div', css = '') => {
    const node = document.createElement(tag); node.textContent = key; node.style.cssText = `position:absolute;left:100px;top:100px;width:100px;height:40px;background:rgb(20, 40, 60);margin:0;padding:0;border:0;${css}`; document.body.append(node);
    const release = host.register(node, key, scoped); stops.push(() => { release(); node.remove(); }); return node;
  };
  const plan = (tracks: Parameters<typeof defineChoreography>[0]['tracks']) => defineChoreography({ cueMs: 500, durationMs: 1000, tracks });
  const route = (p: ReturnType<typeof plan>) => { const run = new ChoreographyRun(host, 1 as never, p, owner, [], () => {}); stops.push(() => run.settle('hostDisposed')); step(0); return run; };
  const rep = (key: string) => document.querySelector<HTMLElement>(`[data-route-representation="${key}"]`)!;
  return { host, owner, step, node, plan, route, rep };
}
const progress = (easing: ChannelEasing, u: number) => sampleEasing(easing, u).progress;
const translateOf = (node: HTMLElement) => node.style.translate.split(' ').map(Number.parseFloat);

it('CSS reference: engine cubic-bezier() timing matches the sampler within 1e-3 (named aliases and arbitrary curves)', () => {
  const curves: (string | CubicBezierPoints)[] = ['ease', 'ease-in', 'ease-out', 'ease-in-out', [0.2, 0, 0, 1], [0.34, 1.56, 0.64, 1], [0.68, -0.6, 0.32, 1.6], [0.9, 0, 0.1, 1], [0.05, 0.7, 0.1, 1], [0, 0, 1, 0.5], [1, 0, 0, 1]];
  const box = document.createElement('div'); box.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px'; document.body.append(box); stops.push(() => box.remove());
  const errors: Record<string, number> = {};
  for (const curve of curves) {
    const css = typeof curve === 'string' ? curve : `cubic-bezier(${curve.join(', ')})`;
    const easing = (typeof curve === 'string' ? curve : { cubicBezier: curve }) as ChannelEasing;
    const animation = box.animate([{ left: '0px' }, { left: '10000px' }], { duration: 1000, easing: css, fill: 'both' });
    animation.pause();
    let worst = 0;
    for (let i = 0; i <= 100; i++) {
      animation.currentTime = i * 10;
      const engine = Number.parseFloat(getComputedStyle(box).left) / 10000;
      worst = Math.max(worst, Math.abs(engine - progress(easing, i / 100)));
    }
    animation.cancel();
    errors[css] = worst;
  }
  console.info('[S1 css reference]', navigator.userAgent, JSON.stringify(errors));
  for (const [css, error] of Object.entries(errors)) expect(error, css).toBeLessThanOrEqual(1e-3);
});

it('channel easing through a run: outgoing opacity follows a cubic-bezier track easing', () => {
  const f = rig(); const node = f.node('x');
  const easing: ChannelEasing = { cubicBezier: [0.2, 0, 0, 1] };
  f.route(f.plan([{ participant: 'x', side: 'outgoing', startMs: 0, durationMs: 1000, easing: 'cubic-bezier(0.2, 0, 0, 1)', opacity: { from: 1, to: 0 } }]));
  for (const t of [100, 250, 600]) { f.step(t); expect(Number(node.style.opacity)).toBeCloseTo(1 - progress(easing, t / 1000), 5); }
});

it('waypoint override: waypoint.easing governs the segment ending at it; other segments use the track easing (geometry, radius, clip)', () => {
  const f = rig(); f.node('x');
  const over: ChannelEasing = { cubicBezier: [0.34, 1.56, 0.64, 1] };
  f.route(f.plan([{ participant: 'x', side: 'shared', startMs: 0, durationMs: 1000, easing: 'ease-in', radius: { from: 0, to: 0 }, clip: { from: [0, 0, 0, 0], to: [0, 0, 0, 0] }, path: [
    { atMs: 400, pose: { relativeTo: 'source', dx: 200 }, radius: 20, clip: [10, 0, 10, 0], easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    { atMs: 800, pose: { relativeTo: 'source', dx: 300 }, radius: 4, clip: [0, 0, 0, 0] }
  ] }]));
  const x = () => Number.parseFloat(/translate\(([-\d.e]+)px/.exec(f.rep('x').style.transform)![1]!);
  const radius = () => Number.parseFloat(f.rep('x').style.borderRadius);
  const clipTop = () => Number.parseFloat(/inset\(([-\d.e]+)px/.exec(f.rep('x').style.clipPath)![1]!);
  // Segment 1 (ends at the overriding waypoint): the overshoot curve, on geometry, radius and clip alike.
  f.step(200);
  expect(x()).toBeCloseTo(100 + 200 * progress(over, 0.5), 3);
  expect(radius()).toBeCloseTo(20 * progress(over, 0.5), 3);
  expect(clipTop()).toBeCloseTo(10 * progress(over, 0.5), 3);
  f.step(300);
  expect(x()).toBeGreaterThan(300); // overshoots its waypoint (position channels may overshoot)
  // Segment 2 (ends at a waypoint without override): the track easing.
  f.step(600);
  expect(x()).toBeCloseTo(300 + 100 * progress('ease-in', 0.5), 3);
  expect(radius()).toBeCloseTo(20 + (4 - 20) * progress('ease-in', 0.5), 3);
  expect(clipTop()).toBeCloseTo(10 - 10 * progress('ease-in', 0.5), 3);
});

it('bounded channels under overshoot: radius and clip never go negative; size stays nonnegative', () => {
  const f = rig(); f.node('x');
  f.route(f.plan([{ participant: 'x', side: 'shared', startMs: 0, durationMs: 1000, easing: { cubicBezier: [0.68, -0.6, 0.32, 1.6] }, radius: { from: 12, to: 0 }, clip: { from: [6, 6, 6, 6], to: [0, 0, 0, 0] }, path: [
    { atMs: 800, pose: { relativeTo: 'source', dw: -100, dh: -40 }, radius: 0, clip: [0, 0, 0, 0] }
  ] }]));
  const seen: number[] = [];
  for (let t = 0; t <= 800; t += 10) {
    f.step(t);
    const style = f.rep('x').style;
    seen.push(Number.parseFloat(style.width), Number.parseFloat(style.height), ...style.borderRadius.split(' ').map(Number.parseFloat), ...(/inset\(([^)]*?)(?: round|\))/.exec(style.clipPath)?.[1] ?? '0px').split(' ').map(Number.parseFloat));
  }
  expect(seen.every(value => Number.isFinite(value) && value >= 0)).toBe(true);
});

it('outgoing slide + scale: real node composes with its stable translate/scale before commit; the copy continues about its centre; leases clean up', () => {
  const f = rig(); const node = f.node('x');
  node.style.translate = '10px 5px'; node.style.scale = '2';
  const before = node.getBoundingClientRect();
  const run = f.route(f.plan([{ participant: 'x', side: 'outgoing', startMs: 0, durationMs: 1000, easing: 'linear', opacity: { from: 1, to: 1 }, slide: { dx: 40, dy: -20 }, scale: { from: 1, to: 0.5 } }]));
  f.step(400);
  expect(translateOf(node)).toEqual([10 + 16, 5 - 8]);
  expect(Number(node.style.scale)).toBeCloseTo(2 * 0.8, 9);
  const painted = node.getBoundingClientRect();
  // Real transform composition: scale about the element's centre origin, plus the translation change.
  expect(painted.width).toBeCloseTo(before.width * 0.8, 3);
  expect(painted.x + painted.width / 2).toBeCloseTo(before.x + before.width / 2 + 16, 3);
  expect(painted.y + painted.height / 2).toBeCloseTo(before.y + before.height / 2 - 8, 3);
  // Hit box follows paint (a non-control outgoing element is moved for real before commit).
  expect(document.elementFromPoint(painted.x + painted.width / 2, painted.y + painted.height / 2)).toBe(node);
  f.step(416);
  run.beforeRemoval(f.owner);
  const copy = f.rep('x');
  const atReveal = copy.getBoundingClientRect(), realAtReveal = node.getBoundingClientRect();
  // No jump at the handoff: the copy paints where the node painted when it was sampled.
  expect(atReveal.width).toBeCloseTo(realAtReveal.width, 1);
  expect(atReveal.x + atReveal.width / 2).toBeCloseTo(realAtReveal.x + realAtReveal.width / 2, 0);
  node.remove();
  f.step(700);
  const later = copy.getBoundingClientRect();
  // Revealed at t = 416 (factor 0.792); at t = 700 the factor is 0.65 and the offset advanced by 0.284 of the slide.
  const factor = (1 - 0.5 * 0.7) / (1 - 0.5 * 0.416);
  expect(later.width).toBeCloseTo(atReveal.width * factor, 1);
  expect(later.x + later.width / 2).toBeCloseTo(atReveal.x + atReveal.width / 2 + 40 * 0.284, 1);
  expect(later.y + later.height / 2).toBeCloseTo(atReveal.y + atReveal.height / 2 - 20 * 0.284, 1);
  expect(getComputedStyle(copy).pointerEvents === 'none' || copy.inert || copy.closest('[inert]') !== null).toBe(true);
  f.step(1100); f.step(1800);
  expect(f.host.resources().leases).toBe(0);
});

it('outgoing control: slide/scale are held at stable before commit (hit box and focus stay put); the copy then moves', () => {
  const f = rig(); const button = f.node('b', f.owner, 'button');
  button.style.scale = '1.5';
  button.focus();
  const before = button.getBoundingClientRect();
  const run = f.route(f.plan([{ participant: 'b', side: 'outgoing', startMs: 0, durationMs: 1000, easing: 'linear', opacity: { from: 1, to: 1 }, slide: { dx: 60 }, scale: { from: 1, to: 0.5 } }]));
  f.step(400);
  const held = button.getBoundingClientRect();
  expect([held.x, held.y, held.width, held.height]).toEqual([before.x, before.y, before.width, before.height]);
  expect(document.activeElement).toBe(button);
  expect(document.elementFromPoint(held.x + held.width / 2, held.y + held.height / 2)).toBe(button);
  run.beforeRemoval(f.owner);
  const copy = f.rep('b'); const start = copy.getBoundingClientRect();
  button.remove();
  f.step(700);
  const moved = copy.getBoundingClientRect();
  expect(moved.x + moved.width / 2).toBeGreaterThan(start.x + start.width / 2 + 5);
  expect(moved.width).toBeLessThan(start.width);
  f.step(1100); f.step(1800);
  expect(f.host.resources().leases).toBe(0);
});

it('incoming slide + scale: the real element (also a focused control) enters from offset/factor to its stable transform; hit box follows paint; restored at settlement', () => {
  const f = rig();
  f.host.local(f.plan([{ participant: 'n', side: 'incoming', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 1 }, slide: { dy: 24 }, scale: { from: 0.5, to: 1 } }]), f.owner, () => {});
  const incoming = f.node('n', f.owner, 'button', 'translate:4px 0px;scale:1');
  // Registration wrote the initial pose, composed with the stable values recorded before any write.
  expect(incoming.style.scale).toBe('0.5');
  expect(translateOf(incoming)).toEqual([4, 24]);
  incoming.focus();
  f.step(150);
  expect(translateOf(incoming)).toEqual([4, 12]);
  expect(Number(incoming.style.scale)).toBeCloseTo(0.75, 9);
  const r = incoming.getBoundingClientRect();
  expect(r.width).toBeCloseTo(75, 3);
  expect(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)).toBe(incoming);
  expect(document.activeElement).toBe(incoming);
  f.step(400); f.step(1100);
  expect(incoming.style.scale).toBe('1');
  expect(incoming.style.translate).toMatch(/^4px( 0px)?$/);
  expect(f.host.resources().leases).toBe(0);
});

it('unsupported stable transforms are skipped with diagnostics (non-uniform scale); teardown mid-flight restores stable values', () => {
  const f = rig(); const node = f.node('x'); node.style.scale = '1 2';
  const run = f.route(f.plan([{ participant: 'x', side: 'outgoing', startMs: 0, durationMs: 1000, slide: { dx: 30 }, scale: { from: 1, to: 0.5 } }]));
  expect(f.host.diagnostics).toContainEqual(expect.objectContaining({ type: 'unsupported', participant: 'x', reason: 'scaleSkipped:unsupportedStableScale' }));
  f.step(500);
  expect(node.style.scale).toBe('1 2');
  expect(translateOf(node)[0]).toBeCloseTo(15, 9);
  run.settle('hostDisposed');
  expect(node.style.translate).toBe('');
  expect(node.style.scale).toBe('1 2');
  expect(liveChoreographyLeases()).toBe(0);
});
