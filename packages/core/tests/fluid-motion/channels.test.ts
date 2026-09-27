import { describe, expect, it } from 'vitest';
import { CHANNEL_RANGES } from '../../src/lib/application/renderer/choreography/channel-types.js';
import { hermite } from '../../src/lib/application/renderer/choreography/hermite.js';
import { channelTracks } from '../../src/lib/application/renderer/choreography/channels.js';

describe('Hermite cubic segments (hermite.ts)', () => {
  it('samples endpoint values and velocities exactly', () => {
    const segment = hermite({
      from: { value: 10, velocity: 0.5 },
      to: 40,
      durationMs: 100,
      allowOvershoot: true
    });

    const atStart = segment.sample(0);
    expect(atStart.value).toBe(10);
    expect(atStart.velocity).toBe(0.5);

    const beforeStart = segment.sample(-20);
    expect(beforeStart.value).toBe(10);
    expect(beforeStart.velocity).toBe(0.5);

    const atEnd = segment.sample(100);
    expect(atEnd.value).toBe(40);
    expect(atEnd.velocity).toBe(0);

    const afterEnd = segment.sample(150);
    expect(afterEnd.value).toBe(40);
    expect(afterEnd.velocity).toBe(0);

    // Each sample returns a fresh object
    const s1 = segment.sample(50);
    const s2 = segment.sample(50);
    expect(s1).toEqual(s2);
    expect(s1).not.toBe(s2);
  });

  it('guarantees velocity continuity at t = 0 when unconstrained', () => {
    const segment = hermite({
      from: { value: 0, velocity: 0.02 },
      to: 10,
      durationMs: 300,
      allowOvershoot: false
    });

    expect(segment.constrained).toBe(false);
    expect(segment.startVelocity).toBe(0.02);
    expect(segment.sample(0).velocity).toBe(0.02);
  });

  it('enforces monotone condition by default (allowOvershoot: false)', () => {
    // Delta = 10, T = 100.
    // Monotone condition: 0 <= v0 * T / delta <= 3 => v0 in [0, 0.3].
    // Case 1: Within monotone bounds
    const seg1 = hermite({
      from: { value: 0, velocity: 0.2 },
      to: 10,
      durationMs: 100,
      allowOvershoot: false
    });
    expect(seg1.constrained).toBe(false);
    expect(seg1.startVelocity).toBe(0.2);

    // Case 2: Exceeding monotone bounds (overshoot rejected by default)
    const seg2 = hermite({
      from: { value: 0, velocity: 0.5 },
      to: 10,
      durationMs: 100,
      allowOvershoot: false
    });
    expect(seg2.constrained).toBe(true);
    expect(seg2.startVelocity).toBe(0.3); // Clamped to 3 * delta / T = 0.3

    // Case 3: Overshoot permitted when declared
    const seg3 = hermite({
      from: { value: 0, velocity: 0.5 },
      to: 10,
      durationMs: 100,
      allowOvershoot: true
    });
    expect(seg3.constrained).toBe(false);
    expect(seg3.startVelocity).toBe(0.5);

    // Midpoint exceeds endpoint 10 due to overshoot
    const mid = seg3.sample(40);
    expect(mid.value).toBeGreaterThan(10);
  });

  it('detects and constrains opacity range violations with clamp-free finite difference matching', () => {
    // Opacity range [0, 1]. From 0.8 to 1.0, duration 200ms.
    // An excessive positive velocity would push opacity > 1.
    const seg = hermite({
      from: { value: 0.8, velocity: 0.05 },
      to: 1.0,
      durationMs: 200,
      range: { min: 0, max: 1 },
      allowOvershoot: true
    });

    expect(seg.constrained).toBe(true);
    // Peak must stay <= 1.0 within documented float tolerance without piecewise value clamping
    for (let t = 0; t <= 200; t += 5) {
      const s = seg.sample(t);
      expect(s.value).toBeLessThanOrEqual(1.0 + 1e-12);
      expect(s.value).toBeGreaterThanOrEqual(0);
    }

    // Extremum witness: analytic extremum location s* = V / (3V - 6*delta)
    const V = 200 * seg.startVelocity;
    const delta = 1.0 - 0.8;
    const sExt = V / (3 * V - 6 * delta);
    if (sExt > 0 && sExt < 1) {
      const tExt = sExt * 200;
      const atExt = seg.sample(tExt);
      expect(atExt.value).toBeLessThanOrEqual(1.0 + 1e-12);
      expect(atExt.velocity).toBeCloseTo(0, 8);

      // Finite difference check around the constrained extremum
      const eps = 1e-3;
      const sPlus = seg.sample(tExt + eps);
      const sMinus = seg.sample(tExt - eps);
      const fd = (sPlus.value - sMinus.value) / (2 * eps);
      expect(Math.abs(atExt.velocity - fd)).toBeLessThan(1e-5);
    }
  });

  it('handles equal endpoints with and without overshoot', () => {
    // Without overshoot: must clamp velocity to 0
    const segNoOvershoot = hermite({
      from: { value: 5, velocity: 1.2 },
      to: 5,
      durationMs: 100,
      allowOvershoot: false
    });
    expect(segNoOvershoot.constrained).toBe(true);
    expect(segNoOvershoot.startVelocity).toBe(0);
    expect(segNoOvershoot.sample(50).value).toBe(5);

    // With overshoot: excursion is valid and returns to p0 with zero velocity
    const segOvershoot = hermite({
      from: { value: 5, velocity: 0.1 },
      to: 5,
      durationMs: 100,
      allowOvershoot: true
    });
    expect(segOvershoot.constrained).toBe(false);
    expect(segOvershoot.startVelocity).toBe(0.1);
    // Theoretical peak at s = 1/3 (t = 100/3): value = 5 + (4/27)*100*0.1 = 5 + 40/27 = 6.48148...
    const peak = segOvershoot.sample(100 / 3);
    expect(peak.value).toBeCloseTo(5 + 40 / 27, 5);
    expect(peak.velocity).toBeCloseTo(0, 5);
    // Reaches endpoint at T
    expect(segOvershoot.sample(100).value).toBe(5);
    expect(segOvershoot.sample(100).velocity).toBe(0);
  });

  it('handles negative velocities and direction reversals', () => {
    // Moving in positive direction (0 -> 10) with negative incoming velocity (-0.1)
    // When overshoot is false, must be constrained to 0
    const segConstrained = hermite({
      from: { value: 0, velocity: -0.1 },
      to: 10,
      durationMs: 200,
      allowOvershoot: false
    });
    expect(segConstrained.constrained).toBe(true);
    expect(segConstrained.startVelocity).toBe(0);

    // When overshoot is true, excursion dips negative
    const segOvershoot = hermite({
      from: { value: 0, velocity: -0.1 },
      to: 10,
      durationMs: 200,
      allowOvershoot: true
    });
    expect(segOvershoot.constrained).toBe(false);
    const dip = segOvershoot.sample(20);
    expect(dip.value).toBeLessThan(0);

    // Downward motion (10 -> 0) with negative velocity (monotone)
    const segDown = hermite({
      from: { value: 10, velocity: -0.05 },
      to: 0,
      durationMs: 200,
      allowOvershoot: false
    });
    expect(segDown.constrained).toBe(false);
    expect(segDown.startVelocity).toBe(-0.05);
  });

  it('maintains numeric stability at tiny and large durations', () => {
    // Tiny duration: 1 microsecond (1e-3 ms)
    const tiny = hermite({
      from: { value: 1, velocity: 100 },
      to: 2,
      durationMs: 1e-3,
      allowOvershoot: true
    });
    expect(Number.isFinite(tiny.sample(0.5e-3).value)).toBe(true);
    expect(Number.isFinite(tiny.sample(0.5e-3).velocity)).toBe(true);

    // Large duration: 10^7 ms
    const large = hermite({
      from: { value: 0, velocity: 1e-6 },
      to: 100,
      durationMs: 1e7,
      allowOvershoot: true
    });
    expect(Number.isFinite(large.sample(5e6).value)).toBe(true);
    expect(Number.isFinite(large.sample(5e6).velocity)).toBe(true);
  });

  it('throws RangeError for invalid inputs', () => {
    // Nonfinite or nonpositive duration
    expect(() => hermite({ from: { value: 0, velocity: 0 }, to: 1, durationMs: 0 })).toThrow(RangeError);
    expect(() => hermite({ from: { value: 0, velocity: 0 }, to: 1, durationMs: -10 })).toThrow(RangeError);
    expect(() => hermite({ from: { value: 0, velocity: 0 }, to: 1, durationMs: Number.NaN })).toThrow(RangeError);
    expect(() => hermite({ from: { value: 0, velocity: 0 }, to: 1, durationMs: Number.POSITIVE_INFINITY })).toThrow(RangeError);

    // Nonfinite values
    expect(() => hermite({ from: { value: Number.NaN, velocity: 0 }, to: 1, durationMs: 100 })).toThrow(RangeError);
    expect(() => hermite({ from: { value: 0, velocity: Number.POSITIVE_INFINITY }, to: 1, durationMs: 100 })).toThrow(RangeError);
    expect(() => hermite({ from: { value: 0, velocity: 0 }, to: Number.NaN, durationMs: 100 })).toThrow(RangeError);

    // Invalid range
    expect(() => hermite({
      from: { value: 0, velocity: 0 },
      to: 1,
      durationMs: 100,
      range: { min: 10, max: 5 }
    })).toThrow(RangeError);

    expect(() => hermite({
      from: { value: 0, velocity: 0 },
      to: 1,
      durationMs: 100,
      range: { min: Number.NaN, max: 5 }
    })).toThrow(RangeError);

    // Endpoints outside range
    expect(() => hermite({
      from: { value: -1, velocity: 0 },
      to: 1,
      durationMs: 100,
      range: { min: 0, max: 1 }
    })).toThrow(RangeError);

    expect(() => hermite({
      from: { value: 0, velocity: 0 },
      to: 2,
      durationMs: 100,
      range: { min: 0, max: 1 }
    })).toThrow(RangeError);
  });

  it('satisfies property tests over 1,000 pseudo-random cases', () => {
    let seed = 42;
    function random(): number {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    for (let i = 0; i < 1000; i++) {
      const min = (random() - 0.5) * 100;
      const max = min + random() * 100 + 0.1;
      const p0 = min + random() * (max - min);
      const p1 = min + random() * (max - min);
      const durationMs = 1 + random() * 1000;
      const v0 = (random() - 0.5) * 5;
      const allowOvershoot = random() > 0.5;
      const range = { min, max };

      const seg = hermite({
        from: { value: p0, velocity: v0 },
        to: p1,
        durationMs,
        range,
        allowOvershoot
      });

      // Invariant 1: sample stays within range whenever a range is given
      const samplePoints = [0, 0.1 * durationMs, 0.3 * durationMs, 0.5 * durationMs, 0.7 * durationMs, 0.9 * durationMs, durationMs];
      for (const t of samplePoints) {
        const s = seg.sample(t);
        expect(s.value).toBeGreaterThanOrEqual(min - 1e-11);
        expect(s.value).toBeLessThanOrEqual(max + 1e-11);
        expect(Number.isFinite(s.velocity)).toBe(true);
      }

      // Invariant 1b: the analytic interior extremum (the curve's only interior turning point)
      // respects the range, and without overshoot stays between the endpoints.
      const V = durationMs * seg.startVelocity;
      const sExt = V / (3 * V - 6 * (p1 - p0));
      const checkPoints = sExt > 0 && sExt < 1 ? [...samplePoints, sExt * durationMs] : samplePoints;
      for (const t of checkPoints) {
        const value = seg.sample(t).value;
        expect(value).toBeGreaterThanOrEqual(min - 1e-11);
        expect(value).toBeLessThanOrEqual(max + 1e-11);
        if (!allowOvershoot) {
          expect(value).toBeGreaterThanOrEqual(Math.min(p0, p1) - 1e-11);
          expect(value).toBeLessThanOrEqual(Math.max(p0, p1) + 1e-11);
        }
      }

      // Invariant 2: constrained is false whenever the monotone condition already held
      const delta = p1 - p0;
      if (delta !== 0) {
        const mono = (v0 * durationMs) / delta;
        if (mono >= 0 && mono <= 3) {
          expect(seg.constrained).toBe(false);
          expect(seg.startVelocity).toBeCloseTo(v0, 9);
        }
      } else if (v0 === 0) {
        expect(seg.constrained).toBe(false);
        expect(seg.startVelocity).toBe(0);
      }
    }
  });
});

describe('Channel tracks and choreography timeline (channels.ts)', () => {
  it('reproduces known cubic-bezier midpoints to 1e-6', () => {
    const easings: Array<{ easing: 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out'; expected: number }> = [
      { easing: 'ease', expected: 0.8024033876 },
      { easing: 'ease-in', expected: 0.3153568126 },
      { easing: 'ease-out', expected: 0.6846431874 },
      { easing: 'ease-in-out', expected: 0.5 }
    ];

    for (const { easing, expected } of easings) {
      const track = channelTracks.tween('x', {
        from: 0,
        to: 1,
        startMs: 0,
        durationMs: 1000,
        easing
      });
      const s = track.sample(500);
      expect(Math.abs(s.value - expected)).toBeLessThan(1e-6);
    }
  });

  it('checks analytic derivative against finite differences across interior points', () => {
    const track = channelTracks.tween('x', {
      from: 10,
      to: 110,
      startMs: 100,
      durationMs: 400,
      easing: 'ease-in-out'
    });

    const testTimes = [150, 200, 250, 300, 450];
    const eps = 1e-4;

    for (const t of testTimes) {
      const sample = track.sample(t);
      const sPlus = track.sample(t + eps);
      const sMinus = track.sample(t - eps);
      const numericalDerivative = (sPlus.value - sMinus.value) / (2 * eps);
      expect(Math.abs(sample.velocity - numericalDerivative)).toBeLessThan(1e-4);
    }
  });

  it('evaluates exact right derivative at startMs for ease-out and verifies start-time retarget continuity', () => {
    // ease-out cubic-bezier(0, 0, 0.58, 1): right derivative at t=0 is 1 / 0.58 ~= 1.724138
    const durationMs = 500;
    const from = 0;
    const to = 100;
    const track = channelTracks.tween('x', {
      from,
      to,
      startMs: 200,
      durationMs,
      easing: 'ease-out'
    });

    // Before startMs: returns { from, 0 }
    expect(track.sample(100)).toEqual({ value: 0, velocity: 0 });

    // At exact startMs (200): evaluates initial state with analytic right derivative
    const atStart = track.sample(200);
    expect(atStart.value).toBe(0);
    const expectedRightVel = ((to - from) * (1 / 0.58)) / durationMs;
    expect(atStart.velocity).toBeCloseTo(expectedRightVel, 6);

    // Finite difference check slightly into the segment (e.g. t = 200.01)
    const dt = 0.01;
    const sampleAfter = track.sample(200 + dt);
    const fd = (sampleAfter.value - atStart.value) / dt;
    expect(fd).toBeCloseTo(expectedRightVel, 2);

    // Retarget witness at startMs: retargeting at the start instant carries this right derivative continuously
    const retargeted = track.retarget(200, 150, 300);
    const retargetSample = retargeted.sample(200);
    expect(retargetSample.value).toBe(0);
    expect(retargetSample.velocity).toBeCloseTo(expectedRightVel, 6);
  });

  it('maintains continuity upon interior retarget within 1e-9', () => {
    const original = channelTracks.tween('x', {
      from: 0,
      to: 100,
      startMs: 0,
      durationMs: 500,
      easing: 'ease'
    });

    const retargetMs = 250;
    const oldSample = original.sample(retargetMs);

    const retargeted = original.retarget(retargetMs, 200, 400);

    const newSample = retargeted.sample(retargetMs);
    expect(Math.abs(newSample.value - oldSample.value)).toBeLessThan(1e-9);
    expect(Math.abs(newSample.velocity - oldSample.velocity)).toBeLessThan(1e-9);

    // Prior to retargetMs, delegates to old track
    expect(retargeted.sample(100).value).toBeCloseTo(original.sample(100).value, 9);
    expect(retargeted.sample(100).velocity).toBeCloseTo(original.sample(100).velocity, 9);
  });

  it('chains 1,000 retargets while keeping segment count strictly bounded', () => {
    let track = channelTracks.tween('x', {
      from: 0,
      to: 10,
      startMs: 0,
      durationMs: 1000,
      easing: 'linear'
    });

    expect((track as any).segmentCount).toBe(1);

    for (let i = 1; i <= 1000; i++) {
      track = track.retarget(i * 10, 10 + i, 50);
      expect((track as any).segmentCount).toBeLessThanOrEqual(2);
    }

    expect((track as any).segmentCount).toBe(2);
    // Track is still responsive and valid at latest retarget
    const s = track.sample(10000);
    expect(Number.isFinite(s.value)).toBe(true);
    expect(Number.isFinite(s.velocity)).toBe(true);
  });

  it('handles zero-duration tweens as steps', () => {
    const step = channelTracks.tween('width', {
      from: 100,
      to: 300,
      startMs: 250,
      durationMs: 0,
      easing: 'linear'
    });

    expect(step.startMs).toBe(250);
    expect(step.endMs).toBe(250);
    expect(step.constrained).toBe(false);

    expect(step.sample(200)).toEqual({ value: 100, velocity: 0 });
    expect(step.sample(250)).toEqual({ value: 300, velocity: 0 });
    expect(step.sample(300)).toEqual({ value: 300, velocity: 0 });
  });

  it('constrains opacity retarget with incoming velocity', () => {
    const opacityTrack = channelTracks.tween('opacity', {
      from: 0,
      to: 1,
      startMs: 0,
      durationMs: 300,
      easing: 'ease'
    });

    // At 200ms, opacity is moving upwards with positive velocity.
    // Retargeting backwards to 0.5 requires a reversal; because allowOvershoot is false for opacity,
    // a positive velocity moving to a lower endpoint violates the monotone condition (v0 * T / delta < 0)
    // and must be constrained to 0.
    const sample200 = opacityTrack.sample(200);
    expect(sample200.velocity).toBeGreaterThan(0);

    const retargetedConstrained = opacityTrack.retarget(200, 0.5, 100);
    expect(retargetedConstrained.channel).toBe('opacity');
    expect(retargetedConstrained.constrained).toBe(true);

    // Verify opacity stays within [0, 1] and monotonic towards 0.5 without overshoot
    for (let t = 200; t <= 300; t += 5) {
      const s = retargetedConstrained.sample(t);
      expect(s.value).toBeLessThanOrEqual(sample200.value + 1e-12);
      expect(s.value).toBeGreaterThanOrEqual(0.5 - 1e-12);
    }

    // Also verify unconstrained forward continuation when within monotone bounds
    const retargetedUnconstrained = opacityTrack.retarget(200, 1, 50);
    expect(retargetedUnconstrained.constrained).toBe(false);
  });

  it('holds constant value via hold track', () => {
    const held = channelTracks.hold('y', 42, 100);
    expect(held.channel).toBe('y');
    expect(held.startMs).toBe(100);
    expect(held.endMs).toBe(100);
    expect(held.constrained).toBe(false);

    expect(held.sample(0)).toEqual({ value: 42, velocity: 0 });
    expect(held.sample(100)).toEqual({ value: 42, velocity: 0 });
    expect(held.sample(200)).toEqual({ value: 42, velocity: 0 });
  });
});

describe('Hermite constraint rule: admissible velocity bounds', () => {
  /** Interior turning point of an absolute cubic with zero end velocity, or undefined. */
  function extremumMs(startVelocity: number, p0: number, p1: number, durationMs: number): number | undefined {
    const V = durationMs * startVelocity;
    const s = V / (3 * V - 6 * (p1 - p0));
    return s > 0 && s < 1 ? s * durationMs : undefined;
  }

  it('relaxes a ranged overshoot to the largest admissible velocity, touching the bound', () => {
    const cases = [
      { p0: 0.8, p1: 1, v0: 0.05, bound: 1 },
      { p0: 0.2, p1: 0, v0: -0.05, bound: 0 }
    ];
    for (const { p0, p1, v0, bound } of cases) {
      const seg = hermite({ from: { value: p0, velocity: v0 }, to: p1, durationMs: 200, range: { min: 0, max: 1 }, allowOvershoot: true });
      expect(seg.constrained).toBe(true);
      expect(Math.sign(seg.startVelocity)).toBe(Math.sign(v0));

      // Largest magnitude: the relaxed curve's turning point reaches the bound.
      const tExt = extremumMs(seg.startVelocity, p0, p1, 200);
      expect(tExt).toBeDefined();
      expect(Math.abs(seg.sample(tExt!).value - bound)).toBeLessThan(1e-9);

      // Any velocity 1e-6 larger in magnitude leaves the range (evaluated on an unranged curve).
      const larger = seg.startVelocity * (1 + 1e-6);
      const free = hermite({ from: { value: p0, velocity: larger }, to: p1, durationMs: 200, allowOvershoot: true });
      const freeExt = free.sample(extremumMs(larger, p0, p1, 200)!).value;
      expect(bound === 1 ? freeExt > 1 : freeExt < 0).toBe(true);
    }
  });

  it('bounds an equal-endpoint excursion by the range with the analytic 27/(4T) velocity', () => {
    // Excursion p0 + (4/27)·T·v peaks at s = 1/3, so the largest admissible v is 27·(bound − p0)/(4T).
    const up = hermite({ from: { value: 0.5, velocity: 0.1 }, to: 0.5, durationMs: 100, range: { min: 0, max: 1 }, allowOvershoot: true });
    expect(up.constrained).toBe(true);
    expect(up.startVelocity).toBeCloseTo((27 * 0.5) / 400, 12);
    expect(Math.abs(up.sample(100 / 3).value - 1)).toBeLessThan(1e-12);
    expect(up.sample(100 / 3).velocity).toBeCloseTo(0, 12);

    const down = hermite({ from: { value: 0.2, velocity: -1 }, to: 0.2, durationMs: 100, range: { min: 0, max: 1 }, allowOvershoot: true });
    expect(down.constrained).toBe(true);
    expect(down.startVelocity).toBeCloseTo((27 * -0.2) / 400, 12);
    expect(Math.abs(down.sample(100 / 3).value)).toBeLessThan(1e-12);

    // Inside the admissible bound the excursion keeps full velocity continuity.
    const inside = hermite({ from: { value: 0.5, velocity: 0.03 }, to: 0.5, durationMs: 100, range: { min: 0, max: 1 }, allowOvershoot: true });
    expect(inside.constrained).toBe(false);
    expect(inside.startVelocity).toBe(0.03);
  });

  it('applies the monotone bound v0·T/Δ <= 3 exactly without overshoot', () => {
    // Δ = 10, T = 100: the bound is |v0| = 0.3 in the direction of travel.
    const atBound = hermite({ from: { value: 0, velocity: 0.3 }, to: 10, durationMs: 100 });
    expect(atBound.constrained).toBe(false);
    expect(atBound.startVelocity).toBe(0.3);

    for (const [p0, p1, v0] of [[0, 10, 0.33], [10, 0, -0.33]] as const) {
      const seg = hermite({ from: { value: p0, velocity: v0 }, to: p1, durationMs: 100 });
      expect(seg.constrained).toBe(true);
      expect(seg.startVelocity).toBeCloseTo(Math.sign(v0) * 0.3, 15);
    }

    // Past the bound an unconstrained curve would overshoot the endpoint; the constrained one does not.
    const free = hermite({ from: { value: 0, velocity: 0.33 }, to: 10, durationMs: 100, allowOvershoot: true });
    const bounded = hermite({ from: { value: 0, velocity: 0.33 }, to: 10, durationMs: 100 });
    let freeMax = 0;
    let boundedMax = 0;
    for (let t = 0; t <= 100; t += 0.25) {
      freeMax = Math.max(freeMax, free.sample(t).value);
      boundedMax = Math.max(boundedMax, bounded.sample(t).value);
    }
    expect(freeMax).toBeGreaterThan(10);
    expect(boundedMax).toBeLessThanOrEqual(10 + 1e-12);
  });
});

describe('Channel track retarget rules per channel', () => {
  const nonPosition = [
    'width', 'height',
    'radiusTopLeft', 'radiusTopRight', 'radiusBottomRight', 'radiusBottomLeft',
    'clipTop', 'clipRight', 'clipBottom', 'clipLeft',
    'opacity'
  ] as const;

  /** Tween 1 → 0 and retarget near its end, where the incoming velocity would carry past `to`. */
  function steepRetarget(channel: (typeof nonPosition)[number] | 'x' | 'y') {
    const tween = channelTracks.tween(channel, { from: 1, to: 0, startMs: 0, durationMs: 100, easing: 'ease-in' });
    const displayed = tween.sample(90);
    const to = displayed.value / 2;
    const track = tween.retarget(90, to, 1000);
    let min = Number.POSITIVE_INFINITY;
    for (let t = 90; t <= 1090; t += 1) min = Math.min(min, track.sample(t).value);
    return { displayed, to, track, min };
  }

  it('never lets a non-position channel overshoot its retarget endpoint', () => {
    for (const channel of nonPosition) {
      const { displayed, to, track, min } = steepRetarget(channel);
      expect(displayed.velocity).toBeLessThan(0);
      expect(track.constrained).toBe(true);
      expect(min).toBeGreaterThanOrEqual(to - 1e-12);
      expect(CHANNEL_RANGES[channel]).toBeDefined();
    }
  });

  it('lets x and y overshoot with velocity continuity at the retarget instant', () => {
    for (const channel of ['x', 'y'] as const) {
      const { displayed, to, track, min } = steepRetarget(channel);
      expect(track.constrained).toBe(false);
      expect(min).toBeLessThan(to);
      expect(Math.abs(track.sample(90).velocity - displayed.velocity)).toBeLessThan(1e-9);
    }
  });

  it('keeps constrained true once any earlier segment was constrained', () => {
    const tween = channelTracks.tween('opacity', { from: 0, to: 1, startMs: 0, durationMs: 300, easing: 'ease' });
    const first = tween.retarget(200, 0.5, 100);
    expect(first.constrained).toBe(true);

    // The second segment is itself unconstrained: it continues the displayed velocity exactly.
    const before = first.sample(250);
    expect(before.velocity).toBeLessThan(0);
    const second = first.retarget(250, 0.4, 10);
    expect(second.sample(250)).toEqual(before);
    expect(second.constrained).toBe(true);

    // Control: a chain of admissible retargets (short durations keep v0·T/Δ well below 3) stays
    // unconstrained and continuous.
    const freeFirst = tween.retarget(100, 1, 50);
    const free = freeFirst.retarget(120, 1, 10);
    expect(freeFirst.sample(100)).toEqual(tween.sample(100));
    expect(free.sample(120)).toEqual(freeFirst.sample(120));
    expect(free.constrained).toBe(false);
  });

  it('reports endMs as the latest retarget instant plus its duration', () => {
    const tween = channelTracks.tween('x', { from: 0, to: 100, startMs: 0, durationMs: 1000, easing: 'linear' });
    const first = tween.retarget(250, 200, 400);
    expect(first.endMs).toBe(650);
    const earlier = first.retarget(100, 50, 200);
    expect(earlier.endMs).toBe(300);
  });
});

describe('Chained track retained history (I7 revision 3)', () => {
  const linear = () => channelTracks.tween('x', { from: 0, to: 100, startMs: 0, durationMs: 1000, easing: 'linear' });

  it('keeps the segment active at a backward retarget instant', () => {
    const original = linear();
    const first = original.retarget(500, 200, 400);
    // 300 precedes the split at 500 but lies in the retained window, where the tween is active.
    const back = first.retarget(300, 50, 200);
    expect(back.startMs).toBe(0);
    expect(back.sample(300).value).toBeCloseTo(30, 12);
    expect(back.sample(300).velocity).toBeCloseTo(0.1, 12);
    expect(back.sample(100)).toEqual(original.sample(100));
    expect(back.sample(299)).toEqual(original.sample(299));
  });

  it('reports the earliest retained start and holds before it with zero velocity', () => {
    const first = linear().retarget(100, 200, 400);
    const second = first.retarget(200, 50, 300);
    expect(first.startMs).toBe(0);
    expect(second.startMs).toBe(100);

    // Inside the retained window the retained predecessor is reproduced exactly.
    expect(second.sample(150)).toEqual(first.sample(150));
    expect(second.sample(100)).toEqual(first.sample(100));

    // Before it, the earliest retained start position is held with zero velocity.
    const heldValue = first.sample(100).value;
    expect(first.sample(100).velocity).not.toBe(0);
    expect(second.sample(50)).toEqual({ value: heldValue, velocity: 0 });
    expect(second.sample(-1000)).toEqual({ value: heldValue, velocity: 0 });
  });

  it('rejects retargeting a chained track before its retained window', () => {
    const second = linear().retarget(100, 200, 400).retarget(200, 50, 300);
    expect(() => second.retarget(99.999, 10, 100)).toThrow(RangeError);

    // The window start itself is retained and continuous with the displayed state there.
    const atStart = second.retarget(100, 10, 100);
    expect(atStart.sample(100)).toEqual(second.sample(100));
    expect(atStart.startMs).toBe(100);
  });

  it('accepts retargeting a fresh track before its start, where no history was discarded', () => {
    const delayed = channelTracks.tween('x', { from: 5, to: 100, startMs: 200, durationMs: 300, easing: 'ease' });
    const early = delayed.retarget(100, 50, 200);
    expect(early.sample(100)).toEqual({ value: 5, velocity: 0 });
    expect(early.startMs).toBe(100);
    expect(early.sample(50)).toEqual({ value: 5, velocity: 0 });

    const held = channelTracks.hold('opacity', 0.5, 100);
    expect(held.retarget(0, 1, 100).sample(0)).toEqual({ value: 0.5, velocity: 0 });
  });
});
