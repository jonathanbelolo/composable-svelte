import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PropertyAuthority } from '../src/lib/application/renderer/property-leases.js';
import { normalizeMotionValue } from '../src/lib/application/motion/properties.js';
import { playMotionValue, type MotionEngineHandle } from '../src/lib/application/renderer/motion-engine.js';

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitFrames(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await nextFrame();
  }
}

describe('Motion Single-Value Engine (Browser)', () => {
  let element: HTMLDivElement;
  let authority: PropertyAuthority;
  let writes: { property: string; value: string }[] = [];

  beforeEach(() => {
    element = document.createElement('div');
    document.body.appendChild(element);
    writes = [];
    authority = new PropertyAuthority((prop, val) => {
      writes.push({ property: prop, value: val });
      if (prop.startsWith('--')) {
        element.style.setProperty(prop, val);
      } else {
        (element.style as unknown as Record<string, string>)[prop] = val;
      }
    });
  });

  afterEach(() => {
    authority.dispose();
    element.remove();
  });

  it('B1: replace the same property midflight cleanly without stale writes', async () => {
    authority.stable('opacity', '0');
    const from1 = normalizeMotionValue('opacity', 0);
    const to1 = normalizeMotionValue('opacity', 1);
    let handle1!: MotionEngineHandle;
    const lease1 = authority.lease('opacity', () => true, () => handle1.stop());
    handle1 = playMotionValue(
      { property: 'opacity', from: from1, to: to1, startMs: 0, durationMs: 200, easing: 'linear' },
      (v) => lease1.write(v),
    );

    await waitFrames(3);
    const midValue1 = parseFloat(element.style.opacity);
    expect(midValue1).toBeGreaterThan(0);
    expect(midValue1).toBeLessThan(1);

    const from2 = normalizeMotionValue('opacity', midValue1);
    const to2 = normalizeMotionValue('opacity', 0);
    let run2Writes = 0;
    let handle2!: MotionEngineHandle;
    const lease2 = authority.lease('opacity', () => true, () => handle2.stop());
    handle2 = playMotionValue(
      { property: 'opacity', from: from2, to: to2, startMs: 0, durationMs: 200, easing: 'linear' },
      (v) => { run2Writes++; lease2.write(v); },
    );

    const res1 = await handle1.settled;
    expect(res1.status).toBe('stopped');

    await waitFrames(3);
    const midValue2 = parseFloat(element.style.opacity);
    expect(midValue2).toBeLessThan(midValue1);

    const res2 = await handle2.settled;
    expect(res2.status).toBe('completed');
    expect(element.style.opacity).toBe('0');
    expect(run2Writes).toBeGreaterThan(0);
    lease2.release();
  });

  it('B2: stop then stable survives >= 3 frames without trailing engine writes', async () => {
    authority.stable('opacity', '0');
    const from = normalizeMotionValue('opacity', 0);
    const to = normalizeMotionValue('opacity', 1);
    let handle!: MotionEngineHandle;
    const lease = authority.lease('opacity', () => true, () => handle.stop());
    handle = playMotionValue(
      { property: 'opacity', from, to, startMs: 0, durationMs: 200, easing: 'linear' },
      (v) => lease.write(v),
    );

    await waitFrames(2);
    lease.release();
    authority.stable('opacity', '0.5');

    const res = await handle.settled;
    expect(res.status).toBe('stopped');
    expect(element.style.opacity).toBe('0.5');

    const writeCountAtStop = writes.length;
    await waitFrames(4);
    expect(element.style.opacity).toBe('0.5');
    expect(writes.length).toBe(writeCountAtStop);
  });

  it('B3: synchronous stop before resolution produces zero leased writes', async () => {
    authority.stable('opacity', '0');
    const from = normalizeMotionValue('opacity', 0);
    const to = normalizeMotionValue('opacity', 1);
    let leasedWrites = 0;
    const lease = authority.lease('opacity', () => true);
    const handle = playMotionValue(
      { property: 'opacity', from, to, startMs: 0, durationMs: 200, easing: 'linear' },
      (v) => {
        leasedWrites++;
        lease.write(v);
      },
    );
    handle.stop();

    const res = await handle.settled;
    expect(res.status).toBe('stopped');
    await waitFrames(3);
    expect(leasedWrites).toBe(0);
    lease.release();
  });

  it('B4: independent opacity, custom numeric property, and unleased color', async () => {
    element.style.color = 'rgb(255, 0, 0)';
    authority.stable('opacity', '1');
    authority.stable('--custom-x', '0px');

    const fromOp = normalizeMotionValue('opacity', 0);
    const toOp = normalizeMotionValue('opacity', 1);
    const numeric = { '--custom-x': { unit: 'px' as const, interpolation: 'number' as const } };
    const fromX = normalizeMotionValue('--custom-x', 0, numeric);
    const toX = normalizeMotionValue('--custom-x', 100, numeric);

    let handleOp!: MotionEngineHandle;
    const leaseOp = authority.lease('opacity', () => true, () => handleOp.stop());
    handleOp = playMotionValue(
      { property: 'opacity', from: fromOp, to: toOp, startMs: 0, durationMs: 150, easing: 'linear' },
      (v) => leaseOp.write(v),
    );

    const leaseX = authority.lease('--custom-x', () => true);
    const rawX: string[] = [];
    const traceX: number[] = [];
    const handleX = playMotionValue(
      { property: '--custom-x', from: fromX, to: toX, startMs: 0, durationMs: 150, easing: 'linear' },
      (v) => {
        rawX.push(v);
        traceX.push(parseFloat(v));
        leaseX.write(v);
      },
    );

    await waitFrames(2);
    let handleOp2!: MotionEngineHandle;
    const leaseOp2 = authority.lease('opacity', () => true, () => handleOp2.stop());
    handleOp2 = playMotionValue(
      { property: 'opacity', from: fromOp, to: toOp, startMs: 0, durationMs: 100, easing: 'linear' },
      (v) => leaseOp2.write(v),
    );

    const [resOp, resOp2, resX] = await Promise.all([handleOp.settled, handleOp2.settled, handleX.settled]);
    expect(resOp.status).toBe('stopped');
    expect(resOp2.status).toBe('completed');
    expect(resX.status).toBe('completed');
    expect(rawX.length).toBeGreaterThan(0);
    for (const v of rawX) {
      expect(v).toMatch(/^\d+(?:\.\d+)?px$/);
    }
    expect(traceX.length).toBeGreaterThan(1);
    expect(traceX.every((x, i) => i === 0 || x >= traceX[i - 1]!)).toBe(true);
    expect(traceX[traceX.length - 1]).toBe(100);

    expect(element.style.color).toBe('rgb(255, 0, 0)');
    expect(element.style.opacity).toBe('1');
    expect(element.style.getPropertyValue('--custom-x')).toBe('100px');
    expect(element.getAnimations().length).toBe(0);

    leaseOp2.release();
    leaseX.release();
  });

  it('B5: completion settles exactly once without unhandled rejection', async () => {
    authority.stable('opacity', '0');
    const from = normalizeMotionValue('opacity', 0);
    const to = normalizeMotionValue('opacity', 1);
    const lease = authority.lease('opacity', () => true);
    const rejections: unknown[] = [];
    const onRejection = (event: PromiseRejectionEvent): void => { rejections.push(event.reason); };
    window.addEventListener('unhandledrejection', onRejection);
    try {
      const start = performance.now();
      const handle = playMotionValue(
        { property: 'opacity', from, to, startMs: 0, durationMs: 100, easing: 'linear' },
        (v) => lease.write(v),
      );

      const res = await handle.settled;
      const elapsed = performance.now() - start;
      expect(res.status).toBe('completed');
      expect(elapsed).toBeGreaterThanOrEqual(70);
      expect(elapsed).toBeLessThan(500);
      expect(element.style.opacity).toBe('1');
      handle.stop();
      await waitFrames(3);
      expect(await handle.settled).toBe(res);
      expect(writes[writes.length - 1]).toEqual({ property: 'opacity', value: '1' });
      expect(rejections).toEqual([]);
      lease.release();
    } finally {
      window.removeEventListener('unhandledrejection', onRejection);
    }
  });

  it('B6: reentrant writer-stop via holder after play stops safely', async () => {
    authority.stable('opacity', '0');
    const from = normalizeMotionValue('opacity', 0);
    const to = normalizeMotionValue('opacity', 1);
    const lease = authority.lease('opacity', () => true);
    let handleRef: MotionEngineHandle | null = null;
    let writeCount = 0;
    handleRef = playMotionValue(
      { property: 'opacity', from, to, startMs: 0, durationMs: 150, easing: 'linear' },
      (v) => {
        writeCount++;
        lease.write(v);
        if (writeCount >= 1 && handleRef) {
          handleRef.stop();
        }
      },
    );

    const res = await handleRef.settled;
    expect(res.status).toBe('stopped');
    const countAfterStop = writeCount;
    await waitFrames(3);
    expect(writeCount).toBe(countAfterStop);
    lease.release();
  });

  it('B7: writer throw causes failed settlement and halts playback', async () => {
    authority.stable('opacity', '0');
    const from = normalizeMotionValue('opacity', 0);
    const to = normalizeMotionValue('opacity', 1);
    const boom = new Error('writer error');
    let calls = 0;
    const lease = authority.lease('opacity', () => true);
    const handle = playMotionValue(
      { property: 'opacity', from, to, startMs: 0, durationMs: 150, easing: 'linear' },
      () => {
        calls++;
        throw boom;
      },
    );

    const res = await handle.settled;
    expect(res.status).toBe('failed');
    if (res.status === 'failed') {
      expect(res.error).toBe(boom);
    }
    await waitFrames(3);
    expect(calls).toBe(1);
    expect(element.style.opacity).toBe('0');
    lease.release();
  });

  it('B8: delayed instant completes and stop-before-deadline prevents destination', async () => {
    authority.stable('opacity', '0');
    const from = normalizeMotionValue('opacity', 0);
    const to = normalizeMotionValue('opacity', 1);

    // Part A: stop before deadline
    const lease1 = authority.lease('opacity', () => true);
    const handle1 = playMotionValue(
      { property: 'opacity', from, to, startMs: 120, durationMs: 0, easing: 'linear' },
      (v) => lease1.write(v),
    );
    await waitFrames(2);
    handle1.stop();
    const res1 = await handle1.settled;
    expect(res1.status).toBe('stopped');
    expect(element.style.opacity).toBe('0');
    lease1.release();

    // Part B: delayed instant completes
    const lease2 = authority.lease('opacity', () => true);
    const handle2 = playMotionValue(
      { property: 'opacity', from, to, startMs: 60, durationMs: 0, easing: 'linear' },
      (v) => lease2.write(v),
    );
    const res2 = await handle2.settled;
    expect(res2.status).toBe('completed');
    expect(element.style.opacity).toBe('1');
    lease2.release();
  });

  it('B9: color, length, custom outputs, and tiny alpha under CSS.supports', async () => {
    authority.stable('background-color', 'rgba(0, 0, 0, 1)');
    const fromColor = normalizeMotionValue('background-color', { r: 255, g: 0, b: 0, a: 1e-7 });
    const toColor = normalizeMotionValue('background-color', { r: 0, g: 255, b: 0, a: 0.5 });
    const leaseColor = authority.lease('background-color', () => true);
    const colorWrites: string[] = [];
    const handleColor = playMotionValue(
      { property: 'background-color', from: fromColor, to: toColor, startMs: 0, durationMs: 100, easing: 'linear' },
      (v) => {
        colorWrites.push(v);
        leaseColor.write(v);
      },
    );
    const resColor = await handleColor.settled;
    expect(resColor.status).toBe('completed');
    expect(colorWrites.length).toBeGreaterThan(0);
    for (const v of colorWrites) {
      expect(CSS.supports('background-color', v)).toBe(true);
      expect(v).not.toMatch(/e/i);
    }
    expect(writes[writes.length - 1]).toEqual({ property: 'background-color', value: 'rgba(0, 255, 0, 0.5)' });
    expect(element.getAnimations().length).toBe(0);
    expect(fromColor.values).toEqual([255, 0, 0, 1e-7]);
    expect(toColor.values).toEqual([0, 255, 0, 0.5]);
    expect(Object.isFrozen(fromColor.values) && Object.isFrozen(toColor.values)).toBe(true);
    leaseColor.release();

    authority.stable('width', '0px');
    const fromLen = normalizeMotionValue('width', { value: 10, unit: 'px' });
    const toLen = normalizeMotionValue('width', { value: 50, unit: 'px' });
    const leaseLen = authority.lease('width', () => true);
    const lenWrites: string[] = [];
    const handleLen = playMotionValue(
      { property: 'width', from: fromLen, to: toLen, startMs: 0, durationMs: 100, easing: 'linear' },
      (v) => {
        lenWrites.push(v);
        leaseLen.write(v);
      },
    );
    const resLen = await handleLen.settled;
    expect(resLen.status).toBe('completed');
    expect(lenWrites.length).toBeGreaterThan(0);
    for (const v of lenWrites) {
      expect(CSS.supports('width', v)).toBe(true);
    }
    expect(element.style.width).toBe('50px');
    leaseLen.release();
  });

  it('B10: canonical transform pair completes through the single-value engine', async () => {
    authority.stable('transform', 'none');
    const from = normalizeMotionValue('transform', 'translateX(0px)');
    const to = normalizeMotionValue('transform', 'translateX(100px)');
    const lease = authority.lease('transform', () => true);
    const handle = playMotionValue(
      { property: 'transform', from, to, startMs: 0, durationMs: 100, easing: 'linear' },
      (v) => lease.write(v),
    );
    const res = await handle.settled;
    expect(res.status).toBe('completed');
    expect(writes.filter(write => write.property === 'transform').length).toBeGreaterThan(0);
    expect(element.style.transform).toBe('translateX(100px)');
    lease.release();
  });

  it('B11: preserves very small custom numeric destinations', async () => {
    let latest = '';
    const declaration = { '--tiny': { unit: 'number' as const, interpolation: 'number' as const } };
    const handle = playMotionValue(
      { property: '--tiny', from: normalizeMotionValue('--tiny', 0, declaration), to: normalizeMotionValue('--tiny', 1e-9, declaration), startMs: 0, durationMs: 20, easing: 'linear' },
      (value) => { latest = value; },
    );
    const res = await handle.settled;
    expect(res.status).toBe('completed');
    expect(Number(latest)).toBe(1e-9);
  });

  it('B12: serializes exponent-scale lengths exactly and CSS-validly', async () => {
    const declaration = { '--far': { unit: 'px' as const, interpolation: 'number' as const } };
    const seen: string[] = [];
    const handle = playMotionValue(
      { property: '--far', from: normalizeMotionValue('--far', 0, declaration), to: normalizeMotionValue('--far', 2.5e-7, declaration), startMs: 0, durationMs: 20, easing: 'linear' },
      (value) => { seen.push(value); },
    );
    const res = await handle.settled;
    expect(res.status).toBe('completed');
    expect(seen.length).toBeGreaterThan(0);
    for (const value of seen) {
      expect(value).not.toMatch(/e/i);
      expect(CSS.supports('width', value)).toBe(true);
    }
    expect(seen[seen.length - 1]).toBe('0.00000025px');
  });

  it('B13: kind and unit mismatch synchronously settle failed with zero writes', async () => {
    authority.stable('width', '10px');
    const fromPx = normalizeMotionValue('width', { value: 10, unit: 'px' });
    const toPct = normalizeMotionValue('width', { value: 50, unit: '%' });
    let writesCount = 0;
    const handleUnit = playMotionValue(
      { property: 'width', from: fromPx, to: toPct, startMs: 0, durationMs: 100, easing: 'linear' },
      () => { writesCount++; },
    );
    const resUnit = await handleUnit.settled;
    expect(resUnit.status).toBe('failed');
    if (resUnit.status === 'failed') {
      expect(String(resUnit.error)).toMatch(/mismatch between from \(length:px\) and to \(length:%\)/i);
    }
    expect(writesCount).toBe(0);

    const fromNum = normalizeMotionValue('opacity', 0);
    const toLen = normalizeMotionValue('width', { value: 10, unit: 'px' });
    const handleKind = playMotionValue(
      { property: 'opacity', from: fromNum, to: toLen, startMs: 0, durationMs: 100, easing: 'linear' },
      () => { writesCount++; },
    );
    const resKind = await handleKind.settled;
    expect(resKind.status).toBe('failed');
    if (resKind.status === 'failed') {
      expect(String(resKind.error)).toMatch(/mismatch between from \(number:number\) and to \(length:px\)/i);
    }
    expect(writesCount).toBe(0);
  });

  it('B14: zero-work playback (durationMs 0 and startMs 0) settles completed synchronously with zero writes', async () => {
    authority.stable('opacity', '0');
    const from = normalizeMotionValue('opacity', 0);
    const to = normalizeMotionValue('opacity', 1);
    let writerCalls = 0;
    const lease = authority.lease('opacity', () => true);
    const handle = playMotionValue(
      { property: 'opacity', from, to, startMs: 0, durationMs: 0, easing: 'linear' },
      (v) => {
        writerCalls++;
        lease.write(v);
      },
    );
    const res = await handle.settled;
    expect(res.status).toBe('completed');
    expect(writerCalls).toBe(0);
    expect(element.style.opacity).toBe('0');
    lease.release();
  });

  it('B15: invalid timing (negative, NaN, Infinity) settles failed with RangeError', async () => {
    const from = normalizeMotionValue('opacity', 0);
    const to = normalizeMotionValue('opacity', 1);
    const cases = [
      { startMs: 0, durationMs: -10 },
      { startMs: 0, durationMs: NaN },
      { startMs: 0, durationMs: Infinity },
      { startMs: -10, durationMs: 100 },
      { startMs: NaN, durationMs: 100 },
      { startMs: Infinity, durationMs: 100 },
    ];
    for (const timing of cases) {
      let writesCount = 0;
      const handle = playMotionValue(
        { property: 'opacity', from, to, ...timing, easing: 'linear' },
        () => { writesCount++; },
      );
      const res = await handle.settled;
      expect(res.status).toBe('failed');
      if (res.status === 'failed') {
        expect(res.error).toBeInstanceOf(RangeError);
      }
      expect(writesCount).toBe(0);
    }
  });

  it('B16: rem and % length units emit CSS-valid values and complete', async () => {
    authority.stable('width', '0%');
    const fromPct = normalizeMotionValue('width', { value: 0, unit: '%' });
    const toPct = normalizeMotionValue('width', { value: 50, unit: '%' });
    const leasePct = authority.lease('width', () => true);
    const pctWrites: string[] = [];
    const handlePct = playMotionValue(
      { property: 'width', from: fromPct, to: toPct, startMs: 0, durationMs: 50, easing: 'linear' },
      (v) => {
        pctWrites.push(v);
        leasePct.write(v);
      },
    );
    const resPct = await handlePct.settled;
    expect(resPct.status).toBe('completed');
    expect(pctWrites.length).toBeGreaterThan(0);
    for (const v of pctWrites) {
      expect(CSS.supports('width', v)).toBe(true);
      expect(v).toMatch(/^\d+(?:\.\d+)?%$/);
    }
    expect(pctWrites[pctWrites.length - 1]).toBe('50%');
    expect(element.style.width).toBe('50%');
    leasePct.release();

    authority.stable('height', '0rem');
    const fromRem = normalizeMotionValue('height', { value: 0, unit: 'rem' });
    const toRem = normalizeMotionValue('height', { value: 1.5, unit: 'rem' });
    const leaseRem = authority.lease('height', () => true);
    const remWrites: string[] = [];
    const handleRem = playMotionValue(
      { property: 'height', from: fromRem, to: toRem, startMs: 0, durationMs: 50, easing: 'linear' },
      (v) => {
        remWrites.push(v);
        leaseRem.write(v);
      },
    );
    const resRem = await handleRem.settled;
    expect(resRem.status).toBe('completed');
    expect(remWrites.length).toBeGreaterThan(0);
    for (const v of remWrites) {
      expect(CSS.supports('height', v)).toBe(true);
      expect(v).toMatch(/^\d+(?:\.\d+)?rem$/);
    }
    expect(remWrites[remWrites.length - 1]).toBe('1.5rem');
    expect(element.style.height).toBe('1.5rem');
    leaseRem.release();
  });

  it('B17: mid-flight stop emits no unhandled rejection across browser frames', async () => {
    authority.stable('opacity', '0');
    const from = normalizeMotionValue('opacity', 0);
    const to = normalizeMotionValue('opacity', 1);
    const rejections: unknown[] = [];
    const onRejection = (event: PromiseRejectionEvent): void => { rejections.push(event.reason); };
    window.addEventListener('unhandledrejection', onRejection);

    try {
      const lease = authority.lease('opacity', () => true);
      let writerCalls = 0;
      const handle = playMotionValue(
        { property: 'opacity', from, to, startMs: 0, durationMs: 200, easing: 'linear' },
        (v) => {
          writerCalls++;
          lease.write(v);
        },
      );

      await waitFrames(2);
      expect(writerCalls).toBeGreaterThan(0);
      handle.stop();
      const res = await handle.settled;
      expect(res.status).toBe('stopped');
      const callsAtStop = writerCalls;

      await waitFrames(4);
      expect(writerCalls).toBe(callsAtStop);
      expect(rejections).toEqual([]);
      lease.release();
    } finally {
      window.removeEventListener('unhandledrejection', onRejection);
    }
  });

  it('B18: observe Motion fractional-channel and tiny-alpha output for CSS validity without exponent notation', async () => {
    authority.stable('color', 'rgba(0, 0, 0, 1)');
    const fromColor = normalizeMotionValue('color', { r: 0, g: 0, b: 0, a: 1 });
    const toColor = normalizeMotionValue('color', { r: 127.5, g: 0, b: 0, a: 1e-7 });
    const lease = authority.lease('color', () => true);
    const emitted: string[] = [];
    const handle = playMotionValue(
      { property: 'color', from: fromColor, to: toColor, startMs: 0, durationMs: 50, easing: 'linear' },
      (v) => {
        emitted.push(v);
        lease.write(v);
      },
    );

    const res = await handle.settled;
    expect(res.status).toBe('completed');
    expect(emitted.length).toBeGreaterThan(0);
    for (const v of emitted) {
      expect(CSS.supports('color', v)).toBe(true);
      expect(v).not.toMatch(/e/i);
    }
    const finalValue = emitted[emitted.length - 1]!;
    expect(finalValue).toBe('rgba(127.5, 0, 0, 0.0000001)');
    lease.release();
  });
});
