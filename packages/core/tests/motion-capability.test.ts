import { describe, expect, it } from 'vitest';
import { normalizeMotionValue, interpolation } from '../src/lib/application/motion/properties.js';
import {
  resolvePairCapability,
  resolveEnginePlan,
} from '../src/lib/application/renderer/motion-capability.js';
import type { CompiledTrack } from '../src/lib/application/motion/compiler.js';

describe('motion capability resolver', () => {
  it('resolves scalar numbers: opacity plays', () => {
    const from = normalizeMotionValue('opacity', 0);
    const to = normalizeMotionValue('opacity', 1);
    expect(resolvePairCapability(from, to)).toEqual({ kind: 'play' });
  });

  it('resolves custom number: plays despite native: stable-fallback (mutant: play iff native)', () => {
    const numeric = { '--progress': { unit: 'number' as const, interpolation: 'number' as const } };
    const from = normalizeMotionValue('--progress', 0, numeric);
    const to = normalizeMotionValue('--progress', 1, numeric);
    expect(from.native).toBe('stable-fallback');
    expect(interpolation(from, to).native).toBe(false);
    expect(resolvePairCapability(from, to)).toEqual({ kind: 'play' });
  });

  it('resolves same-unit lengths and customs: px, %, rem play', () => {
    const pxFrom = normalizeMotionValue('width', 10);
    const pxTo = normalizeMotionValue('width', 20);
    expect(resolvePairCapability(pxFrom, pxTo)).toEqual({ kind: 'play' });

    const pctFrom = normalizeMotionValue('width', { value: 10, unit: '%' });
    const pctTo = normalizeMotionValue('width', { value: 20, unit: '%' });
    expect(resolvePairCapability(pctFrom, pctTo)).toEqual({ kind: 'play' });

    const remFrom = normalizeMotionValue('width', { value: 10, unit: 'rem' });
    const remTo = normalizeMotionValue('width', { value: 20, unit: 'rem' });
    expect(resolvePairCapability(remFrom, remTo)).toEqual({ kind: 'play' });

    const customFrom = normalizeMotionValue('--gap', 4, { '--gap': { unit: 'px', interpolation: 'number' } });
    const customTo = normalizeMotionValue('--gap', 12, { '--gap': { unit: 'px', interpolation: 'number' } });
    expect(resolvePairCapability(customFrom, customTo)).toEqual({ kind: 'play' });
  });

  it('resolves px-to-% as unit-mismatch despite native: interpolate (mutant: play iff native)', () => {
    const from = normalizeMotionValue('width', { value: 10, unit: 'px' });
    const to = normalizeMotionValue('width', { value: 20, unit: '%' });
    expect(interpolation(from, to).native).toBe(true);
    expect(resolvePairCapability(from, to)).toEqual({ kind: 'fallback', reason: 'unit-mismatch' });
  });

  it('resolves RGBA colors: play for distinct, identity for equal', () => {
    const from = normalizeMotionValue('color', '#ff0000');
    const to = normalizeMotionValue('color', '#00ff00');
    expect(resolvePairCapability(from, to)).toEqual({ kind: 'play' });

    const same = normalizeMotionValue('color', '#ff0000');
    expect(resolvePairCapability(from, same)).toEqual({ kind: 'identity' });
  });

  it('resolves accepted 2D transform: plays despite ticker: stable-fallback (mutant: play iff ticker)', () => {
    const from = normalizeMotionValue('transform', 'translateX(0px)');
    const to = normalizeMotionValue('transform', 'translateX(100px)');
    expect(from.ticker).toBe('stable-fallback');
    expect(interpolation(from, to).ticker).toBe(false);
    expect(resolvePairCapability(from, to)).toEqual({ kind: 'play' });
  });

  it('resolves none/none as identity', () => {
    const from = normalizeMotionValue('transform', 'none');
    const to = normalizeMotionValue('transform', 'none');
    expect(resolvePairCapability(from, to)).toEqual({ kind: 'identity' });
  });

  it('resolves canonical-equal transforms as identity', () => {
    const from = normalizeMotionValue('transform', 'translate(0px, 0px)');
    const to = normalizeMotionValue('transform', 'none');
    expect(resolvePairCapability(from, to)).toEqual({ kind: 'identity' });

    const scaleA = normalizeMotionValue('transform', 'scale(1)');
    const scaleB = normalizeMotionValue('transform', 'scale(1, 1)');
    expect(resolvePairCapability(scaleA, scaleB)).toEqual({ kind: 'identity' });
  });

  it('resolves matrix and translate3d as transform:unsupported-function', () => {
    const mFrom = normalizeMotionValue('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    const mTo = normalizeMotionValue('transform', 'matrix(1, 0, 0, 1, 10, 20)');
    expect(interpolation(mFrom, mTo).native).toBe(true);
    expect(resolvePairCapability(mFrom, mTo)).toEqual({
      kind: 'fallback',
      reason: 'transform:unsupported-function'
    });

    const t3dFrom = normalizeMotionValue('transform', 'translate3d(0px, 0px, 0px)');
    const t3dTo = normalizeMotionValue('transform', 'translate3d(10px, 0px, 0px)');
    expect(resolvePairCapability(t3dFrom, t3dTo)).toEqual({
      kind: 'fallback',
      reason: 'transform:unsupported-function'
    });
  });

  it('rejects nonzero angle unit mismatch while preserving zero-unit adoption', () => {
    const from = normalizeMotionValue('transform', 'rotate(45deg)');
    const to = normalizeMotionValue('transform', 'rotate(0.5turn)');
    expect(resolvePairCapability(from, to)).toEqual({
      kind: 'fallback',
      reason: 'transform:unit-mismatch'
    });
    const zero = normalizeMotionValue('transform', 'rotate(0deg)');
    expect(resolvePairCapability(zero, to)).toEqual({ kind: 'play' });
  });

  it('resolves equal arbitrary or 3D transform strings as identity via rule 1', () => {
    const matrix = normalizeMotionValue('transform', 'matrix(1, 2, 3, 4, 5, 6)');
    expect(resolvePairCapability(matrix, matrix)).toEqual({ kind: 'identity' });

    const t3d = normalizeMotionValue('transform', 'translate3d(10px, 20px, 30px)');
    expect(resolvePairCapability(t3d, t3d)).toEqual({ kind: 'identity' });
  });

  it('resolves kind mismatch and arity mismatch as fallbacks', () => {
    const num = normalizeMotionValue('opacity', 0.5);
    const len = normalizeMotionValue('width', 10);
    expect(resolvePairCapability(num, len)).toEqual({ kind: 'fallback', reason: 'kind-mismatch' });

    const badArityFrom = { ...num, css: '0.25', values: [1, 2] };
    expect(resolvePairCapability(badArityFrom, num)).toEqual({ kind: 'fallback', reason: 'arity' });

    const color = normalizeMotionValue('color', '#123456');
    const badColor = { ...color, css: 'rgba(1, 2, 3, 1)', values: [1, 2, 3] };
    expect(resolvePairCapability(badColor, color)).toEqual({ kind: 'fallback', reason: 'arity' });
  });

  it('does not inspect transform function names directly (delegates to planTransformMix)', () => {
    const from = normalizeMotionValue('transform', 'skewX(10deg)');
    const to = normalizeMotionValue('transform', 'skewX(20deg)');
    expect(resolvePairCapability(from, to)).toEqual({ kind: 'play' });
  });
});

describe('engine plan resolver', () => {
  it('preserves absolute timings, emits playable address specs, and records unsupported pairs', () => {
    const opacityFrom = normalizeMotionValue('opacity', 0);
    const opacityTo = normalizeMotionValue('opacity', 1);
    const matrixFrom = normalizeMotionValue('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    const matrixTo = normalizeMotionValue('transform', 'matrix(1, 0, 0, 1, 10, 20)');
    const idColor = normalizeMotionValue('color', '#ff0000');
    const customFrom = normalizeMotionValue('--progress', 0, { '--progress': { unit: 'number', interpolation: 'number' } });
    const customTo = normalizeMotionValue('--progress', 1, { '--progress': { unit: 'number', interpolation: 'number' } });
    const pxLen = normalizeMotionValue('width', { value: 10, unit: 'px' });
    const pctLen = normalizeMotionValue('width', { value: 20, unit: '%' });

    const tracks: CompiledTrack[] = [
      {
        target: 'surface',
        startMs: 100,
        durationMs: 300,
        properties: [
          { property: 'opacity', from: opacityFrom, to: opacityTo, interpolation: interpolation(opacityFrom, opacityTo) },
          { property: 'transform', from: matrixFrom, to: matrixTo, interpolation: interpolation(matrixFrom, matrixTo) },
          { property: 'color', from: idColor, to: idColor, interpolation: interpolation(idColor, idColor) },
        ],
        easing: 'ease',
        channel: 'default',
        priority: 0,
        optional: false,
        available: 'ready',
      },
      {
        target: 'surface',
        startMs: 250,
        durationMs: 200,
        properties: [
          { property: '--progress', from: customFrom, to: customTo, interpolation: interpolation(customFrom, customTo) },
        ],
        easing: 'linear',
        channel: 'default',
        priority: 0,
        optional: false,
        available: 'ready',
      },
      {
        target: 'other',
        startMs: 400,
        durationMs: 150,
        properties: [
          { property: 'width', from: pxLen, to: pctLen, interpolation: interpolation(pxLen, pctLen) },
        ],
        easing: 'ease-in-out',
        channel: 'default',
        priority: 0,
        optional: false,
        available: 'ready',
      }
    ];

    const plan = resolveEnginePlan({ tracks });

    expect(plan.tracks).toEqual([
      {
        target: 'surface',
        property: 'opacity',
        from: opacityFrom,
        to: opacityTo,
        startMs: 100,
        durationMs: 300,
        easing: 'ease',
      },
      {
        target: 'surface',
        property: '--progress',
        from: customFrom,
        to: customTo,
        startMs: 250,
        durationMs: 200,
        easing: 'linear',
      }
    ]);

    expect(plan.fallbacks).toEqual([
      {
        target: 'surface',
        property: 'transform',
        reason: 'transform:unsupported-function',
      },
      {
        target: 'other',
        property: 'width',
        reason: 'unit-mismatch',
      }
    ]);
  });

  it('treats instant intent (startMs === 0 && durationMs === 0) as no interpolation without calling capability', () => {
    const matrixFrom = normalizeMotionValue('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    const matrixTo = normalizeMotionValue('transform', 'matrix(1, 0, 0, 1, 10, 20)');

    const tracks: CompiledTrack[] = [
      {
        target: 'surface',
        startMs: 0,
        durationMs: 0,
        properties: [
          { property: 'transform', from: matrixFrom, to: matrixTo, interpolation: interpolation(matrixFrom, matrixTo) },
        ],
        easing: 'linear',
        channel: 'default',
        priority: 0,
        optional: false,
        available: 'ready',
      }
    ];

    const plan = resolveEnginePlan({ tracks });
    expect(plan.tracks).toHaveLength(0);
    expect(plan.fallbacks).toHaveLength(0);
  });
});
