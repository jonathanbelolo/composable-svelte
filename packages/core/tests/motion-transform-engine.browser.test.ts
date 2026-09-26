import { describe, expect, it } from 'vitest';
import { mix } from 'motion';
import { normalizeMotionValue } from '../src/lib/application/motion/properties.js';
import { playMotionValue } from '../src/lib/application/renderer/motion-engine.js';
import { planTransformMix, TransformMixError } from '../src/lib/application/renderer/transform-mix.js';

function frame(): Promise<number> { return new Promise(resolve => requestAnimationFrame(resolve)); }
async function frames(count: number): Promise<void> { for (let i = 0; i < count; i++) await frame(); }
function transform(value: string) { return normalizeMotionValue('transform', value); }
function numbers(value: string): number[] { return [...value.matchAll(/-?(?:\d+(?:\.\d+)?|\.\d+)/g)].map(match => Number(match[0])); }
function expectSame2DMatrix(actual: Element, expected: Element): void {
  const actualMatrix = new DOMMatrix(getComputedStyle(actual).transform);
  const expectedMatrix = new DOMMatrix(getComputedStyle(expected).transform);
  for (const key of ['a', 'b', 'c', 'd', 'e', 'f'] as const) expect(actualMatrix[key]).toBeCloseTo(expectedMatrix[key], 3);
}

describe('bounded 2D transform planner', () => {
  it('canonicalizes defaults, none in both directions, zero units, plus, and exponents', () => {
    const rows = [
      ['translateX(100%)', 'none', 'translateX(100%)', 'translateX(0%)'],
      ['none', 'translateY(+1e3px)', 'translateY(0px)', 'translateY(1000px)'],
      ['translateY(0)', 'translateY(16px)', 'translateY(0px)', 'translateY(16px)'],
      ['rotate(0)', 'rotate(+1.8e2deg)', 'rotate(0deg)', 'rotate(180deg)'],
      ['scale(.96)', 'none', 'scale(0.96, 0.96)', 'scale(1, 1)'],
      ['rotate(0deg)scale(1)', 'rotate(90deg)scale(.5)', 'rotate(0deg) scale(1, 1)', 'rotate(90deg) scale(0.5, 0.5)'],
      ['translate(120px) scale(+5e-1)', 'translate(0, 0px) scale(1, 1)', 'translate(120px, 0px) scale(0.5, 0.5)', 'translate(0px, 0px) scale(1, 1)'],
    ] as const;
    for (const [from, to, canonicalFrom, canonicalTo] of rows) {
      const plan = planTransformMix(from, to);
      expect(plan.kind, `${from} -> ${to}`).toBe('mix');
      if (plan.kind !== 'mix') continue;
      expect(plan.from).toBe(canonicalFrom);
      expect(plan.to).toBe(canonicalTo);
      expect(plan.emitted.flags).not.toContain('g');
      expect(plan.emitted.test(plan.from)).toBe(true);
      expect(plan.emitted.test(plan.to)).toBe(true);
      expect(plan.emitted.test(`x${plan.to}`)).toBe(false);
    }
    expect(planTransformMix('none', 'none')).toEqual({ kind: 'identity' });
  });

  it('fails closed with stable reasons and keeps 3D unsupported', () => {
    const rows = [
      ['translateX(1px)', 'translateY(1px)', 'function-mismatch'],
      ['translateX(1px)', 'translateX(1%)', 'unit-mismatch'],
      ['translateX(10)', 'translateX(20px)', 'invalid-argument'],
      ['rotate(45)', 'rotate(90deg)', 'invalid-argument'],
      ['scale(1px)', 'scale(2)', 'invalid-argument'],
      ['translate3d(0px, 0px, 0px)', 'translate3d(1px, 1px, 1px)', 'unsupported-function'],
      ['matrix(1, 0, 0, 1, 0, 0)', 'none', 'unsupported-function'],
      ['translateX(calc(1px))', 'none', 'unparseable'],
      ['translateX(1000001px)', 'none', 'number-out-of-range'],
    ] as const;
    for (const [from, to, reason] of rows) expect(planTransformMix(from, to)).toEqual({ kind: 'fallback', reason });
    const seventeen = Array.from({ length: 17 }, () => 'scale(1)').join(' ');
    expect(planTransformMix(seventeen, 'none')).toEqual({ kind: 'fallback', reason: 'too-many-functions' });
  });

  it('does not mutate inputs and bounds a 4096-code-unit adversarial value', () => {
    const from = 'translateX(1px)';
    const suffix = 'translateX(2px)';
    const to = `${' '.repeat(4096 - suffix.length)}${suffix}`;
    expect(to.length).toBe(4096);
    expect(planTransformMix(from, to).kind).toBe('mix');
    expect(planTransformMix(from, `${to} `)).toEqual({ kind: 'fallback', reason: 'unparseable' });
    expect(from).toBe('translateX(1px)');
  });
});

describe('real Motion transform engine', () => {
  it('interpolates required 2D rows through the real engine against a WAAPI matrix oracle', async () => {
    const candidate = document.createElement('div');
    const reference = document.createElement('div');
    Object.assign(candidate.style, { position: 'absolute', width: '200px', height: '100px' });
    Object.assign(reference.style, { position: 'absolute', width: '200px', height: '100px' });
    document.body.append(candidate, reference);
    const rows = [
      ['translateX(100%)', 'none'],
      ['none', 'translateY(16px) scale(0.96)'],
      ['none', 'translateY(+1e3px)'],
      ['rotate(0)', 'rotate(+1.8e2deg)'],
      ['rotate(0deg)scale(1)', 'rotate(90deg)scale(.5)'],
      ['translate(120px, -40px) scale(0.5, 0.5)', 'translate(0px, 0px) scale(1, 1)'],
    ] as const;
    try {
      for (const [fromCss, toCss] of rows) {
        const plan = planTransformMix(fromCss, toCss);
        expect(plan.kind).toBe('mix');
        if (plan.kind !== 'mix') continue;
        const fromNumbers = numbers(plan.from);
        const toNumbers = numbers(plan.to);
        expect(Math.abs(toNumbers[0]! - fromNumbers[0]!)).toBeGreaterThanOrEqual(10);
        const writes: string[] = [];
        const handle = playMotionValue({ property: 'transform', from: transform(fromCss), to: transform(toCss), startMs: 0, durationMs: 100, easing: 'linear' }, value => writes.push(value));
        expect((await handle.settled).status).toBe('completed');
        expect(writes.length).toBeGreaterThan(1);
        expect(writes.some(value => value !== plan.from && value !== plan.to)).toBe(true);
        const animation = reference.animate([{ transform: plan.from }, { transform: plan.to }], { duration: 1000, easing: 'linear', fill: 'both' });
        animation.pause();
        for (const value of writes) {
          expect(CSS.supports('transform', value)).toBe(true);
          expect(plan.emitted.test(value)).toBe(true);
          expect(value).not.toContain('+');
          expect(value).not.toMatch(/\d[eE][+-]?\d/);
          const progress = (numbers(value)[0]! - fromNumbers[0]!) / (toNumbers[0]! - fromNumbers[0]!);
          expect(progress).toBeGreaterThanOrEqual(-0.000001);
          expect(progress).toBeLessThanOrEqual(1.000001);
          animation.currentTime = Math.min(1, Math.max(0, progress)) * 1000;
          candidate.style.transform = value;
          expectSame2DMatrix(candidate, reference);
        }
        animation.cancel();
      }
    } finally {
      candidate.remove();
      reference.remove();
    }
  });

  it('none/none completes and every fallback fails with zero writes', async () => {
    const rows = [
      ['none', 'none', 'completed'],
      ['translateX(1px)', 'translateY(1px)', 'failed'],
      ['translateX(1px)', 'translateX(1%)', 'failed'],
      ['translate3d(0px, 0px, 0px)', 'translate3d(1px, 1px, 1px)', 'failed'],
    ] as const;
    for (const [fromCss, toCss, status] of rows) {
      const writes: string[] = [];
      const result = await playMotionValue({ property: 'transform', from: transform(fromCss), to: transform(toCss), startMs: 0, durationMs: 50, easing: 'linear' }, value => writes.push(value)).settled;
      expect(result.status).toBe(status);
      expect(writes).toEqual([]);
      if (result.status === 'failed') expect(result.error).toBeInstanceOf(TransformMixError);
    }
  });

  it('stop closes the sink before Motion can publish again', async () => {
    let count = 0;
    const handle = playMotionValue({ property: 'transform', from: transform('translateX(0px)'), to: transform('translateX(100px)'), startMs: 0, durationMs: 300, easing: 'linear' }, () => { count++; });
    await frames(2);
    expect(count).toBeGreaterThan(0);
    const beforeStop = count;
    handle.stop();
    expect(count).toBe(beforeStop);
    expect((await handle.settled).status).toBe('stopped');
    expect(count).toBe(beforeStop);
    await frames(4);
    expect(count).toBe(beforeStop);
  });

  it('synchronous stop before the first frame emits no transform write', async () => {
    let count = 0;
    const handle = playMotionValue({ property: 'transform', from: transform('translateX(0px)'), to: transform('translateX(100px)'), startMs: 0, durationMs: 300, easing: 'linear' }, () => { count++; });
    handle.stop();
    expect(count).toBe(0);
    expect((await handle.settled).status).toBe('stopped');
    expect(count).toBe(0);
    await frames(4);
    expect(count).toBe(0);
  });

  it('records the installed Motion exact endpoint without adding an engine final snap', async () => {
    const plan = planTransformMix('translateX(0px)', 'translateX(0.0000001px)');
    expect(plan.kind).toBe('mix');
    if (plan.kind !== 'mix') return;
    const writes: string[] = [];
    const result = await playMotionValue({ property: 'transform', from: transform('translateX(0px)'), to: transform('translateX(0.0000001px)'), startMs: 0, durationMs: 50, easing: 'linear' }, value => writes.push(value)).settled;
    expect(result.status).toBe('completed');
    expect(plan.to).toBe('translateX(0.0000001px)');
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[writes.length - 1]).toBe('translateX(0.0000001px)');
    expect(writes[writes.length - 1]).toBe(plan.to);
  });

  it('matches a WAAPI computed-matrix oracle for structurally matched 2D rows', async () => {
    const candidate = document.createElement('div');
    const reference = document.createElement('div');
    Object.assign(candidate.style, { position: 'absolute', width: '200px', height: '100px' });
    Object.assign(reference.style, { position: 'absolute', width: '200px', height: '100px' });
    document.body.append(candidate, reference);
    const rows = [
      ['translateX(100px)', 'translateX(0px)'],
      ['translateY(16px) scale(0.96, 0.96)', 'translateY(0px) scale(1, 1)'],
      ['rotate(0deg)', 'rotate(180deg)'],
    ] as const;
    try {
      for (const [fromCss, toCss] of rows) {
        const plan = planTransformMix(fromCss, toCss);
        expect(plan.kind).toBe('mix');
        if (plan.kind !== 'mix') continue;
        const interpolate = mix(plan.from, plan.to);
        const animation = reference.animate([{ transform: plan.from }, { transform: plan.to }], { duration: 1000, easing: 'linear', fill: 'both' });
        animation.pause();
        for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
          animation.currentTime = progress * 1000;
          candidate.style.transform = interpolate(progress);
          expectSame2DMatrix(candidate, reference);
        }
        animation.cancel();
      }
    } finally {
      candidate.remove();
      reference.remove();
    }
  });
});
