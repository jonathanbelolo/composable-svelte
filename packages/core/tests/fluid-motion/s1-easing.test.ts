/** S1: easing normalization, numeric accuracy, bounded channels and finite continuation (pure; no DOM). */
import { describe, expect, it } from 'vitest';
import { channelTracks, normalizeEasing, sampleEasing } from '../../src/lib/application/renderer/choreography/channels.js';
import { hermite } from '../../src/lib/application/renderer/choreography/hermite.js';
import type { ChannelEasing, CubicBezierPoints } from '../../src/lib/application/renderer/choreography/channel-types.js';
import { defineChoreography } from '../../src/lib/application/renderer/choreography/plan.js';

/** Independent reference: 200-step bisection on x(t) in double precision (no Newton, no shared code). */
function reference([x1, y1, x2, y2]: CubicBezierPoints, u: number): number {
  const b = (a: number, c: number, t: number) => 3 * a * (1 - t) ** 2 * t + 3 * c * (1 - t) * t * t + t ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (b(x1, x2, mid) < u) lo = mid; else hi = mid; }
  return b(y1, y2, (lo + hi) / 2);
}
const grid = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);
const NAMED: Record<string, CubicBezierPoints> = { ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] };
const CURVES: CubicBezierPoints[] = [[0.2, 0, 0, 1], [0.34, 1.56, 0.64, 1], [0.68, -0.6, 0.32, 1.6], [0.9, 0, 0.1, 1], [0, 0, 0.9, 0.5], [0.05, 0.7, 0.1, 1], [0, 0, 1, 0.5], [1, 0, 0, 1], [0, 1, 1, 0], [1, 0.5, 1, 0.5], [0.5, -40, 0.5, 40]];

describe('normalization (validated once)', () => {
  it('names are retained; object and CSS string forms normalize to one frozen curve', () => {
    for (const name of ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out']) expect(normalizeEasing(name)).toBe(name);
    const fromCss = normalizeEasing('cubic-bezier(0.2, 0, 0, 1)');
    const fromObject = normalizeEasing({ cubicBezier: [0.2, 0, 0, 1] });
    expect(fromCss).toEqual({ cubicBezier: [0.2, 0, 0, 1] });
    expect(fromObject).toEqual(fromCss);
    expect(Object.isFrozen(fromCss) && Object.isFrozen((fromCss as { cubicBezier: object }).cubicBezier)).toBe(true);
    // Re-normalizing a normalized value returns the same object (no revalidation or allocation per tween).
    expect(normalizeEasing(fromCss)).toBe(fromCss);
    expect(normalizeEasing(' CUBIC-BEZIER( .2 ,-1e-1, 1 , 1.5e0 ) ')).toEqual({ cubicBezier: [0.2, -0.1, 1, 1.5] });
    // Points on the diagonal are exactly linear.
    expect(normalizeEasing({ cubicBezier: [0, 0, 1, 1] })).toBe('linear');
    expect(normalizeEasing('cubic-bezier(0.3, 0.3, 0.7, 0.7)')).toBe('linear');
  });
  it('rejects non-finite values, x outside [0,1], malformed forms and unknown names; accepts any finite y', () => {
    const bad: unknown[] = [
      { cubicBezier: [Number.NaN, 0, 1, 1] }, { cubicBezier: [0, Number.POSITIVE_INFINITY, 1, 1] }, { cubicBezier: [-0.01, 0, 1, 1] }, { cubicBezier: [0, 0, 1.01, 1] },
      { cubicBezier: [0, 0, 1] }, { cubicBezier: [0, 0, 1, 1, 0] }, { cubicBezier: ['0', 0, 1, 1] }, { cubicBezier: [0, 0, 1, 1], extra: 1 },
      'cubic-bezier(0, 0, 1)', 'cubic-bezier(a, 0, 1, 1)', 'cubic-bezier(1.5, 0, 1, 1)', 'cubic-bezier(0, 0, 1, 1) x', 'steps(4)', 'spring', 'EASE', [0, 0, 1, 1], 42, null
    ];
    for (const value of bad) expect(() => normalizeEasing(value), JSON.stringify(value)).toThrow();
    for (const y of [1e6, -1e12, 1e300, Number.MAX_VALUE, -Number.MAX_VALUE, 5e-324]) expect(() => normalizeEasing({ cubicBezier: [0.5, y, 0.5, -y] })).not.toThrow();
  });
  it('defineChoreography normalizes track and waypoint easing once, and rejects invalid ones', () => {
    const plan = defineChoreography({ cueMs: 100, durationMs: 400, tracks: [
      { participant: 'a', side: 'shared', startMs: 0, durationMs: 400, easing: 'cubic-bezier(0.2, 0, 0, 1)', path: [{ atMs: 200, pose: { relativeTo: 'source', dx: 10 }, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }, { atMs: 300, pose: { relativeTo: 'source', dx: 20 } }] },
      { participant: 'b', side: 'incoming', startMs: 0, durationMs: 300, easing: { cubicBezier: [0.2, 0, 0, 1] }, slide: { dy: 8 }, scale: { from: 0.94, to: 1 } },
      { participant: 'c', side: 'outgoing', startMs: 0, durationMs: 300, easing: 'ease-in', slide: { dx: -8 }, scale: { from: 1, to: 0.96 } }
    ] });
    expect(plan.tracks[0]!.easing).toEqual({ cubicBezier: [0.2, 0, 0, 1] });
    expect(plan.tracks[0]!.path![0]!.easing).toEqual({ cubicBezier: [0.34, 1.56, 0.64, 1] });
    expect(plan.tracks[0]!.path![1]!.easing).toBeUndefined();
    expect(plan.tracks[2]!.easing).toBe('ease-in');
    expect(plan.tracks[1]!.scale).toEqual({ from: 0.94, to: 1 });
    expect(plan.diagnostics).toEqual([]);
    const track = (extra: object) => defineChoreography({ cueMs: 100, durationMs: 400, tracks: [{ participant: 'a', side: 'incoming', startMs: 0, durationMs: 300, ...extra }] });
    expect(() => track({ easing: 'cubic-bezier(2, 0, 0, 1)' })).toThrow(RangeError);
    expect(() => track({ easing: 'bounce' })).toThrow(TypeError);
    expect(() => track({ scale: 0.5 })).toThrow();
    expect(() => track({ scale: { from: -0.5, to: 1 } })).toThrow(RangeError);
    expect(() => track({ scale: { from: 0.5, to: Number.NaN } })).toThrow();
    expect(() => track({ scale: { from: 0.5 } })).toThrow(RangeError);
    expect(() => track({ scale: { from: 0.5, to: 1, x: 1 } })).toThrow();
    // An incoming end factor other than 1 is released to the stable scale at settlement: said at construction.
    expect(track({ scale: { from: 0, to: 1.2 } }).diagnostics).toEqual(['scaleReleasedAtSettle:a:1.2->1']);
    expect(() => defineChoreography({ cueMs: 100, durationMs: 400, tracks: [{ participant: 'a', side: 'shared', startMs: 0, durationMs: 300, path: [{ atMs: 100, pose: { relativeTo: 'source' }, easing: { cubicBezier: [0, 0, 2, 1] } }] }] })).toThrow(RangeError);
    expect(() => defineChoreography({ cueMs: 100, durationMs: 400, tracks: [{ participant: 'a', side: 'shared', startMs: 0, durationMs: 300, scale: { from: 0.5, to: 1 } } as never] })).toThrow('Only incoming and outgoing tracks declare scale');
  });
});

describe('sampling accuracy and derivatives', () => {
  it('named aliases are unchanged: identical to their explicit control points and to the reference within 1e-9', () => {
    for (const [name, points] of Object.entries(NAMED)) {
      for (const u of grid(400)) {
        const a = sampleEasing(name as ChannelEasing, u), b = sampleEasing({ cubicBezier: points }, u);
        expect(a.progress).toBe(b.progress);
        expect(a.slope).toBe(b.slope);
        expect(Math.abs(a.progress - reference(points, u))).toBeLessThan(1e-9);
      }
    }
    // Endpoint limits of degenerate named endpoints (dx/dt = dy/dt = 0) are exact, not approximations.
    expect(sampleEasing('ease-out', 0).slope).toBeCloseTo(1 / 0.58, 12);
    expect(sampleEasing('ease-in', 1).slope).toBeCloseTo(1 / 0.58, 12);
    expect(sampleEasing('ease-in-out', 0).slope).toBe(0);
  });
  it('arbitrary and overshoot curves match the reference: 1e-9 nonsingular, 1e-4 at vertical tangents (acceptance bound 1e-3)', () => {
    let regular = 0, singular = 0;
    for (const points of CURVES) for (const u of grid(1000)) {
      const sample = sampleEasing({ cubicBezier: points }, u), error = Math.abs(sample.progress - reference(points, u));
      if (sample.singular) singular = Math.max(singular, error); else regular = Math.max(regular, error);
    }
    // Measured: ~1e-13 regular; ~6e-6 at a vertical tangent, where inverting x(t) is ill-conditioned for any solver.
    expect(regular).toBeLessThan(1e-9);
    expect(singular).toBeLessThan(1e-4);
  });
  it('nonsingular curves keep their exact finite analytic slope (never capped): matches a finite difference', () => {
    // cubic-bezier(0.9, 0, 0.1, 1): slope exactly 10 at u = 0.5.
    expect(sampleEasing({ cubicBezier: [0.9, 0, 0.1, 1] }, 0.5).slope).toBeCloseTo(10, 9);
    // cubic-bezier(0.05, 0.7, 0.1, 1): steep start, slope 14 at u = 0.
    expect(sampleEasing({ cubicBezier: [0.05, 0.7, 0.1, 1] }, 0).slope).toBeCloseTo(14, 9);
    for (const points of CURVES.filter(points => !sampleEasing({ cubicBezier: points }, 0.5).singular)) {
      for (const u of grid(200).filter(u => u > 0.01 && u < 0.99)) {
        const h = 1e-6, slope = sampleEasing({ cubicBezier: points }, u).slope;
        const fd = (reference(points, u + h) - reference(points, u - h)) / (2 * h);
        expect(Math.abs(slope - fd), `${points} @${u}`).toBeLessThan(1e-4 * Math.max(1, Math.abs(fd)));
      }
    }
  });
  it('vertical tangents (dx/dt = 0, dy/dt != 0) are flagged singular and get a finite approximated slope', () => {
    for (const points of [[1, 0, 0, 1], [0, 1, 1, 0], [1, 0.5, 1, 0.5], [0, 0, 1, 0.5]] as CubicBezierPoints[]) {
      expect(sampleEasing({ cubicBezier: points }, 0.5).singular).toBe(true);
      for (const u of [...grid(2000), 0.5 - 1e-12, 0.5 + 1e-12, 1e-15, 1 - 1e-15]) {
        const { progress, slope } = sampleEasing({ cubicBezier: points }, u);
        expect(Number.isFinite(progress) && Number.isFinite(slope), `${points} @${u}`).toBe(true);
      }
    }
    for (const points of CURVES.slice(0, 6)) expect(sampleEasing({ cubicBezier: points }, 0.5).singular).toBe(false);
  });
});

describe('tracks: bounded channels, velocity and continuation', () => {
  const tween = (channel: Parameters<typeof channelTracks.tween>[0], from: number, to: number, easing: ChannelEasing) => channelTracks.tween(channel, { from, to, startMs: 0, durationMs: 1000, easing });
  it('position channels overshoot; bounded channels (opacity, size, radius, inset, scale) clamp and report constrained', () => {
    const back: ChannelEasing = { cubicBezier: [0.68, -0.6, 0.32, 1.6] };
    const x = tween('x', 0, 100, back);
    const xs = grid(200).map(u => x.sample(u * 1000).value);
    expect(Math.min(...xs)).toBeLessThan(-5); expect(Math.max(...xs)).toBeGreaterThan(105);
    expect(x.constrained).toBe(false);
    for (const [channel, from, to, min, max] of [['opacity', 0, 1, 0, 1], ['width', 100, 0, 0, Infinity], ['radiusTopLeft', 20, 0, 0, Infinity], ['clipTop', 0, 30, 0, Infinity], ['scale', 1, 0.02, 0, Infinity]] as const) {
      const track = tween(channel, from, to, channel === 'opacity' || channel === 'clipTop' ? { cubicBezier: [0.68, -0.6, 0.32, 1.6] } : { cubicBezier: [0.34, 1.56, 0.64, 1] });
      const values = grid(400).map(u => track.sample(u * 1000));
      expect(values.every(({ value }) => value >= min && value <= max && Number.isFinite(value)), channel).toBe(true);
      expect(track.constrained, channel).toBe(true);
    }
    // In-range overshoot on a bounded channel is not constrained (opacity 0.2 -> 0.8 with ±60% overshoot stays in [0,1]).
    expect(tween('opacity', 0.2, 0.8, back).constrained).toBe(false);
  });
  it('velocity is the derivative of the sampled position (C1) on nonsingular curves', () => {
    for (const easing of ['ease', 'ease-out', { cubicBezier: [0.2, 0, 0, 1] }, { cubicBezier: [0.34, 1.56, 0.64, 1] }, { cubicBezier: [0.9, 0, 0.1, 1] }] as ChannelEasing[]) {
      const track = tween('x', 0, 500, easing);
      expect(track.constrained).toBe(false);
      for (const t of grid(100).map(u => u * 1000).filter(t => t > 5 && t < 995)) {
        const h = 1e-3, fd = (track.sample(t + h).value - track.sample(t - h).value) / (2 * h);
        expect(Math.abs(track.sample(t).velocity - fd)).toBeLessThan(1e-4 * Math.max(1, Math.abs(fd)));
      }
    }
  });
  it('near-singular curves: finite samples and finite continuation from any retarget instant; the track reports constrained', () => {
    const singular = tween('x', 0, 300, { cubicBezier: [1, 0, 0, 1] });
    expect(singular.constrained).toBe(true);
    for (const at of [0, 250, 499.999, 500, 500.001, 750, 999.999]) {
      const continued = singular.retarget(at, 120, 300);
      const displayed = singular.sample(at);
      expect(continued.sample(at).value).toBeCloseTo(displayed.value, 9);
      for (const t of grid(300).map(u => at + u * 300)) { const s = continued.sample(t); expect(Number.isFinite(s.value) && Number.isFinite(s.velocity)).toBe(true); }
      expect(continued.sample(at + 300).value).toBe(120);
    }
    // Arbitrary finite y (up to ±Number.MAX_VALUE): scaled arithmetic never yields NaN; an actual overflow of the
    // double range is clamped and observable as `constrained` on that track only.
    for (const y of [1e6, 1e300, Number.MAX_VALUE]) {
      const extreme = tween('x', 0, 1, { cubicBezier: [0.5, y, 0.5, -y] });
      for (const t of grid(500).map(u => u * 1000)) { const s = extreme.sample(t); expect(Number.isFinite(s.value) && Number.isFinite(s.velocity), `${y} @${t}`).toBe(true); }
      const reference = sampleEasing({ cubicBezier: [0.5, y, 0.5, -y] }, 0.25).progress;
      expect(Number.isFinite(reference)).toBe(true);
    }
    const moderate = tween('x', 0, 1, { cubicBezier: [0.5, 1e6, 0.5, -1e6] });
    for (const t of grid(100).map(u => u * 1000)) moderate.sample(t);
    expect(moderate.constrained).toBe(false);
    expect(Number.isFinite(moderate.retarget(400, 0, 200).sample(500).value)).toBe(true);
    const overflowing = tween('x', -1e300, 1e300, { cubicBezier: [0.5, Number.MAX_VALUE, 0.5, 0] });
    expect(overflowing.constrained).toBe(false);
    const sampled = grid(100).map(u => overflowing.sample(u * 1000));
    expect(sampled.every(s => Number.isFinite(s.value) && Number.isFinite(s.velocity))).toBe(true);
    expect(overflowing.constrained).toBe(true);
    // Other tracks are unaffected.
    expect(tween('x', 0, 1, 'ease').constrained).toBe(false);
  });
  it('a retarget continues from displayed value and velocity: the remaining shape is a continuation, not the declared bezier', () => {
    const easing: ChannelEasing = { cubicBezier: [0.2, 0, 0, 1] };
    const original = tween('x', 0, 100, easing);
    const at = 300, shown = original.sample(at);
    // Retarget to the same endpoint over the same remaining time.
    const continued = original.retarget(at, 100, 700);
    expect(continued.sample(at).value).toBeCloseTo(shown.value, 12);
    const h = 1e-3;
    expect((continued.sample(at + h).value - continued.sample(at).value) / h).toBeCloseTo(shown.velocity, 3);
    const differs = grid(20).slice(1, -1).some(u => Math.abs(continued.sample(at + u * 700).value - original.sample(at + u * 700).value) > 0.5);
    expect(differs).toBe(true);
  });
});

describe('numeric correction 1 (fresh Astra findings)', () => {
  const finiteState = (s: { value: number; velocity: number }) => Number.isFinite(s.value) && Number.isFinite(s.velocity);
  it('finite-y overflow: continuation and repeated retargets from a clamped display stay finite and observable', () => {
    const base = channelTracks.tween('x', { from: 0, to: 100, startMs: 0, durationMs: 1000, easing: { cubicBezier: [0.5, 1e308, 0.5, 0] } });
    // The finding's exact reproduction: velocity was -Infinity at 325/400/475 ms.
    const once = base.retarget(250, 100, 300);
    for (const t of [250, 251, 300, 325, 400, 475, 549, 550, 600]) expect(finiteState(once.sample(t)), `t=${t}`).toBe(true);
    expect(once.sample(250).value).toBe(Number.MAX_VALUE);
    expect(once.sample(550).value).toBe(100);
    expect(once.constrained).toBe(true);
    // Repeated retargets (each from the displayed, possibly clamped, state) never throw and never leave the finite domain.
    let track = once;
    for (const [at, to] of [[325, -50], [400, 1e300], [410, -1e308], [475, 0], [480, 7]] as const) {
      expect(() => { track = track.retarget(at, to, 120); }).not.toThrow();
      for (let t = at; t <= at + 130; t += 5) expect(finiteState(track.sample(t)), `after ${at}->${to} at ${t}`).toBe(true);
    }
    expect(track.sample(600).value).toBe(7);
    // Direct Hermite requests at the edge of the double range.
    for (const [value, velocity, to] of [[Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE], [-Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE], [0, Number.MAX_VALUE, 0], [1e308, 1e308, -1e308]] as const) {
      const segment = hermite({ from: { value, velocity }, to, durationMs: 3, allowOvershoot: true });
      for (let t = 0; t <= 3; t += 0.25) expect(finiteState(segment.sample(t)), `${value},${velocity}->${to} @${t}`).toBe(true);
      expect(Number.isFinite(segment.startVelocity)).toBe(true);
    }
    // A span of the whole double range (to - from overflows) is evaluated in scaled units.
    const wide = channelTracks.tween('x', { from: -Number.MAX_VALUE, to: Number.MAX_VALUE, startMs: 0, durationMs: 1000, easing: 'linear' });
    for (let t = 0; t <= 1000; t += 50) expect(finiteState(wide.sample(t)), `wide ${t}`).toBe(true);
    expect(wide.sample(500).value).toBeCloseTo(0, -300);
    expect(finiteState(wide.retarget(500, 0, 100).sample(550))).toBe(true);
  });
  it('ordinary magnitudes are bit-identical to unscaled Hermite arithmetic', () => {
    const segment = hermite({ from: { value: 12.5, velocity: -0.37 }, to: 240, durationMs: 300, allowOvershoot: true });
    for (const t of [1, 17, 150, 299]) {
      const s = t / 300, p0 = 12.5, p1 = 240, v = segment.startVelocity;
      expect(segment.sample(t).value).toBe(p0 + s * s * (3 - 2 * s) * (p1 - p0) + t * (1 - s) * (1 - s) * v);
      expect(segment.sample(t).velocity).toBe((6 * s * (1 - s) * (p1 - p0)) / 300 + (1 - s) * (1 - 3 * s) * v);
    }
    expect(segment.constrained).toBe(false);
  });
  it('a small but nonzero dx/dt is an ordinary finite slope: exact, not singular, not approximated', () => {
    // cubic-bezier(1e-8, 1, 0.5, 1): dx/dt(0) = 3e-8, dy/dt(0) = 3, so the slope at u = 0 is exactly 1e8.
    const tiny = { cubicBezier: [1e-8, 1, 0.5, 1] } as const;
    const start = sampleEasing(tiny, 0);
    expect(start.singular).toBe(false);
    expect(start.slope / 1e8).toBeCloseTo(1, 12);
    for (const u of [1e-12, 1e-10, 1e-9]) {
      const { slope } = sampleEasing(tiny, u);
      const h = u * 1e-4, fd = (reference(tiny.cubicBezier, u + h) - reference(tiny.cubicBezier, u - h)) / (2 * h);
      expect(Math.abs(slope - fd) / fd, `u=${u}`).toBeLessThan(1e-6);
    }
    expect(channelTracks.tween('x', { from: 0, to: 1, startMs: 0, durationMs: 1000, easing: tiny }).constrained).toBe(false);
    // Nonzero near-tangent interior minimum (not a double root): ordinary, finite, uncapped.
    const near = sampleEasing({ cubicBezier: [1, 0, 1e-9, 1] }, 0.5);
    expect(near.singular).toBe(false);
    expect(Number.isFinite(near.slope) && near.slope > 1e3).toBe(true);
    // The smallest positive x1: a slope beyond the double range reports ±MAX_VALUE (finite), still not singular.
    const denormal = sampleEasing({ cubicBezier: [Number.MIN_VALUE, 1, 0.5, 1] }, 0);
    expect(denormal.singular).toBe(false);
    expect(denormal.slope).toBe(Number.MAX_VALUE);
    // Actual singular points stay classified: x1 = 0 with y1 != 0, x2 = 1 with y2 != 1, an interior double root.
    for (const points of [[0, 1, 0.5, 1], [0.5, 0, 1, 0.5], [1, 0, 0, 1]] as CubicBezierPoints[]) expect(sampleEasing({ cubicBezier: points }, 0.3).singular, String(points)).toBe(true);
    // Degenerate (0/0) endpoints are not singular: ease-out, ease-in, ease-in-out and cubic-bezier(0, 0, 1, 1)-like curves.
    for (const name of ['ease-out', 'ease-in', 'ease-in-out'] as const) expect(sampleEasing(name, 0).singular).toBe(false);
  });
});

describe('numeric correction 2 (independent follow-up findings)', () => {
  const MAX = Number.MAX_VALUE;
  it('a representable channel velocity is kept when the progress slope alone exceeds the double range', () => {
    // cubic-bezier(0.5, MAX, 0.5, 0): d(progress)/du at 0 is 2 * MAX (beyond the range); x 0 -> 1 over 1000 ms makes
    // the channel velocity 2 * MAX / 1000 = 3.5953862697246315e305, which is representable.
    const track = channelTracks.tween('x', { from: 0, to: 1, startMs: 0, durationMs: 1000, easing: { cubicBezier: [0.5, MAX, 0.5, 0] } });
    const start = track.sample(0.000001);
    expect(track.sample(0).value).toBe(0);
    // Reviewer N1 exact probe: sample(0).
    expect(track.sample(0).velocity).toBe((MAX / 1000) * 2);
    expect(start.velocity / (2 * (MAX / 1000))).toBeCloseTo(1, 6);
    for (let t = 0; t <= 1000; t += 10) { const s = track.sample(t); expect(Number.isFinite(s.value) && Number.isFinite(s.velocity), `t=${t}`).toBe(true); }
    // Nothing overflowed: no constraint is reported.
    expect(track.constrained).toBe(false);
    // The progress slope itself is reported saturated (it is beyond the range), never Infinity.
    expect(sampleEasing({ cubicBezier: [0.5, MAX, 0.5, 0] }, 0).slope).toBe(MAX);
    // An actually overflowing velocity is still clamped and reported.
    const fast = channelTracks.tween('x', { from: 0, to: 1e10, startMs: 0, durationMs: 1e-6, easing: { cubicBezier: [0.5, MAX, 0.5, 0] } });
    expect(Number.isFinite(fast.sample(1e-9).velocity)).toBe(true);
    expect(fast.constrained).toBe(true);
  });
  it('interior singularity is exactly x1 = 1, x2 = 0; cubic-bezier(1, 0, 1e-16, 1) has a positive derivative and an analytic slope', () => {
    const almost = sampleEasing({ cubicBezier: [1, 0, 1e-16, 1] }, 0.5);
    expect(almost.singular).toBe(false);
    expect(Number.isFinite(almost.slope)).toBe(true);
    expect(almost.slope).toBeGreaterThan(1e8);
    // Where well-conditioned, the slope matches a reference central difference.
    for (const u of [0.1, 0.25, 0.75, 0.9]) {
      const points: CubicBezierPoints = [1, 0, 1e-16, 1];
      const h = 1e-6, fd = (reference(points, u + h) - reference(points, u - h)) / (2 * h);
      expect(Math.abs(sampleEasing({ cubicBezier: points }, u).slope - fd) / fd, `u=${u}`).toBeLessThan(1e-6);
    }
    expect(channelTracks.tween('x', { from: 0, to: 1, startMs: 0, durationMs: 1000, easing: { cubicBezier: [1, 0, 1e-16, 1] } }).constrained).toBe(false);
    expect(sampleEasing({ cubicBezier: [1, 0, 0, 1] }, 0.3).singular).toBe(true);
    expect(sampleEasing({ cubicBezier: [1, 0, 0, 0.5] }, 0.3).singular).toBe(true);
    for (const points of [[0.9999999999999999, 0, 0, 1], [1, 0.3, 5e-324, 0.7], [0.75, 0, 0.25, 1]] as CubicBezierPoints[]) expect(sampleEasing({ cubicBezier: points }, 0.5).singular, String(points)).toBe(false);
  });
  it('a saturated Hermite display is flat: velocity 0 at ±MAX_VALUE, constraint exposed, continuation finite', () => {
    // Reviewer N3 exact probe: linear 0 -> MAX over 1 ms, retargeted at 0 to 0 over 8 ms; clamped at 2 and 2.5 ms.
    const next = channelTracks.tween('x', { from: 0, to: MAX, startMs: 0, durationMs: 1, easing: 'linear' }).retarget(0, 0, 8);
    for (const t of [2, 2.5]) expect(next.sample(t), `t=${t}`).toEqual({ value: MAX, velocity: 0 });
    expect(next.constrained).toBe(true);
    const onward = next.retarget(2.5, 0, 8);
    expect(onward.sample(2.5)).toEqual({ value: MAX, velocity: 0 });
    for (let t = 2.5; t <= 10.5; t += 0.25) expect(Number.isFinite(onward.sample(t).value) && Number.isFinite(onward.sample(t).velocity)).toBe(true);
    const segment = hermite({ from: { value: 0.9 * MAX, velocity: MAX }, to: 0.9 * MAX, durationMs: 1000, allowOvershoot: true });
    let saturated = 0;
    for (let t = 1; t < 1000; t += 1) {
      const s = segment.sample(t);
      expect(Number.isFinite(s.value) && Number.isFinite(s.velocity), `t=${t}`).toBe(true);
      if (Math.abs(s.value) === MAX) { saturated++; expect(s.velocity, `t=${t}`).toBe(0); }
    }
    expect(saturated).toBeGreaterThan(0);
    expect(segment.constrained).toBe(true);
    // Negative side, and a tween-level retarget chain through the saturated display.
    const negative = hermite({ from: { value: -0.9 * MAX, velocity: -MAX }, to: -0.9 * MAX, durationMs: 1000, allowOvershoot: true });
    for (let t = 1; t < 1000; t += 7) { const s = negative.sample(t); if (s.value === -MAX) expect(s.velocity).toBe(0); }
    let track = channelTracks.tween('x', { from: 0, to: 100, startMs: 0, durationMs: 1000, easing: { cubicBezier: [0.5, 1e308, 0.5, 0] } });
    track = track.retarget(250, 100, 300);
    const shown = track.sample(250);
    expect(shown.value).toBe(MAX);
    expect(shown.velocity).toBe(0);
    for (let t = 250; t <= 560; t += 5) { const s = track.sample(t); if (Math.abs(s.value) === MAX) expect(s.velocity, `t=${t}`).toBe(0); }
  });
});

describe('numeric correction 3 (scaled product/quotient)', () => {
  const MAX = Number.MAX_VALUE;
  const finiteState = (s: { value: number; velocity: number }) => Number.isFinite(s.value) && Number.isFinite(s.velocity);
  it('reviewer probe: cubic-bezier(1e-310, 1, 0.5, 1), x 0 -> 1 over 1000 ms, at 0: velocity 1e307 (finite, unconstrained)', () => {
    const track = channelTracks.tween('x', { from: 0, to: 1, startMs: 0, durationMs: 1000, easing: { cubicBezier: [1e-310, 1, 0.5, 1] } });
    const s = track.sample(0);
    expect(s.value).toBe(0);
    expect(Number.isFinite(s.velocity)).toBe(true);
    expect(s.velocity / 1e307).toBeCloseTo(1, 9);
    expect(track.constrained).toBe(false);
    // The bare progress slope 1e310 exceeds the double range: the evidence helper reports MAX_VALUE.
    expect(sampleEasing({ cubicBezier: [1e-310, 1, 0.5, 1] }, 0).slope).toBe(MAX);
  });
  it('small positive x1 with ordinary and huge y: exact representable velocity, or a clamped and constrained true overflow', () => {
    for (const x1 of [1e-300, 1e-310, 5e-324]) for (const y1 of [1, 1e300, MAX]) for (const [span, duration] of [[1, 1000], [1e-300, 1], [1e10, 1e-6]] as const) {
      const track = channelTracks.tween('x', { from: 0, to: span, startMs: 0, durationMs: duration, easing: { cubicBezier: [x1, y1, 0.5, 1] } });
      const s = track.sample(0);
      const label = `x1=${x1} y1=${y1} span=${span} T=${duration}`;
      expect(finiteState(s), label).toBe(true);
      // True velocity at 0 is span * (y1 / x1) / duration: log2 decides representability without overflowing.
      const log2 = Math.log2(span) + Math.log2(y1) - Math.log2(x1) - Math.log2(duration);
      if (log2 < 1023.9) {
        expect(((s.velocity * x1) / y1) * (duration / span), label).toBeCloseTo(1, 9);
        expect(track.constrained, label).toBe(false);
      } else if (log2 > 1024.1) {
        expect(s.velocity, label).toBe(MAX);
        expect(track.constrained, label).toBe(true);
      }
    }
  });
  it('no finite public input yields NaN: sweep of x/y controls (incl. 0, subnormal, ±MAX), spans and durations, plus a retarget', () => {
    const xs = [0, 5e-324, 1e-310, 1e-8, 0.5, 1 - 2 ** -53, 1];
    const ys = [-MAX, -1e300, 0, 0.5, 1e300, MAX];
    const spans = [[0, 1], [-MAX, MAX], [MAX, -1e300]] as const;
    let samples = 0;
    for (const x1 of xs) for (const x2 of xs) for (const y1 of ys) for (const y2 of [ys[0]!, ys[3]!, ys[5]!]) for (const [from, to] of spans) for (const duration of [5e-324, 1000]) {
      const track = channelTracks.tween('x', { from, to, startMs: 0, durationMs: duration, easing: normalizeEasing({ cubicBezier: [x1, y1, x2, y2] }) });
      for (const u of [0, 0.25, 0.5, 1 - 2 ** -30]) { const s = track.sample(u * duration); samples++; if (!finiteState(s)) throw new Error(`non-finite ${JSON.stringify({ x1, x2, y1, y2, from, to, duration, u, s })}`); }
      const next = track.retarget(duration / 2, 0, 1);
      for (const t of [duration / 2, duration / 2 + 0.5]) { const s = next.sample(t); if (!finiteState(s)) throw new Error(`non-finite retarget ${JSON.stringify({ x1, x2, y1, y2, from, to, duration, t, s })}`); }
    }
    expect(samples).toBeGreaterThan(10000);
  });
  it('Hermite with a zero range gap and a subnormal duration has a finite start velocity (no Infinity × 0)', () => {
    for (const [value, velocity, min, max] of [[0.5, 1, 0, 0.5], [0, -1, 0, 1]] as const) {
      const segment = hermite({ from: { value, velocity }, to: value, durationMs: 5e-324, range: { min, max }, allowOvershoot: true });
      expect(Number.isFinite(segment.startVelocity)).toBe(true);
      for (const t of [0, 2e-324, 5e-324]) expect(finiteState(segment.sample(t))).toBe(true);
    }
  });
});
