import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import MotionGroupTimingHost from './fixtures/MotionGroupTimingHost.svelte';
import { TargetRegistry } from '../src/lib/application/renderer/target-registry.js';

const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLElement }> = [];

afterEach(async () => {
  while (mounted.length) {
    const current = mounted.pop()!;
    await unmount(current.component);
    current.target.remove();
  }
  vi.restoreAllMocks();
});

async function frame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  const started = performance.now();
  while (!predicate()) {
    if (performance.now() - started > 2000) throw new Error(message);
    await frame();
  }
}

describe('useMotionGroup timing in a real browser', () => {
  it('executes sequence recipe with one shared binding and start, proving target two does not begin before target one has begun', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const bindSpy = vi.spyOn(TargetRegistry.prototype, 'bind');
    const component = mount(MotionGroupTimingHost, { target, props: { mode: 'sequence' } });
    mounted.push({ component, target });

    await tick();
    const first = target.querySelector<HTMLElement>('[data-testid="target-first"]')!;
    const second = target.querySelector<HTMLElement>('[data-testid="target-second"]')!;

    expect(first.style.opacity).toBe('0');
    expect(second.style.opacity).toBe('0');
    expect(bindSpy).toHaveBeenCalledTimes(1);

    const binding = bindSpy.mock.results[0]!.value;
    expect(binding).toBeDefined();
    expect(binding.record?.live).toBe(true);

    const startSpy = vi.spyOn(binding, 'start');

    const firstWrites: number[] = [];
    const secondWrites: number[] = [];
    const writeEvents: Array<{ target: 'first' | 'second'; value: number; time: number }> = [];

    const origFirstSetProperty = first.style.setProperty.bind(first.style);
    first.style.setProperty = (prop, val, prio) => {
      if (prop === 'opacity') {
        const num = Number(val);
        firstWrites.push(num);
        writeEvents.push({ target: 'first', value: num, time: performance.now() });
      }
      origFirstSetProperty(prop, val, prio);
    };

    const origSecondSetProperty = second.style.setProperty.bind(second.style);
    second.style.setProperty = (prop, val, prio) => {
      if (prop === 'opacity') {
        const num = Number(val);
        secondWrites.push(num);
        writeEvents.push({ target: 'second', value: num, time: performance.now() });
      }
      origSecondSetProperty(prop, val, prio);
    };

    try {
      target.querySelector<HTMLButtonElement>('[data-testid="update-motion"]')!.click();
      flushSync();

      expect(bindSpy).toHaveBeenCalledTimes(1);
      expect(startSpy).toHaveBeenCalledTimes(1);

      await waitFor(() => firstWrites.some((v) => v > 0 && v < 1), 'first target received no intermediate opacity writes');
      expect(second.style.opacity).toBe('0');
      await waitFor(() => secondWrites.some((v) => v > 0 && v < 1), 'second target received no intermediate opacity writes');
      expect(first.style.opacity).toBe('1');

      await waitFor(
        () => first.style.opacity === '1' && second.style.opacity === '1',
        'sequence motion did not reach settled final state'
      );
      expect(first.style.opacity).toBe('1');
      expect(second.style.opacity).toBe('1');

      const firstStartIndex = writeEvents.findIndex((e) => e.target === 'first' && e.value > 0);
      const secondStartIndex = writeEvents.findIndex((e) => e.target === 'second' && e.value > 0);
      expect(firstStartIndex).toBeGreaterThanOrEqual(0);
      expect(secondStartIndex).toBeGreaterThan(firstStartIndex);
      expect(writeEvents[firstStartIndex]!.time).toBeLessThanOrEqual(writeEvents[secondStartIndex]!.time);

      const secondWritesBeforeFirst = writeEvents.slice(0, firstStartIndex).filter((e) => e.target === 'second');
      expect(secondWritesBeforeFirst).toHaveLength(0);
    } finally {
      first.style.setProperty = origFirstSetProperty;
      second.style.setProperty = origSecondSetProperty;
      startSpy.mockRestore();
      bindSpy.mockRestore();
    }
  });

  it('executes parallel recipe with one shared binding and start, proving both participate in the same request without claiming exact frame equality', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const bindSpy = vi.spyOn(TargetRegistry.prototype, 'bind');
    const component = mount(MotionGroupTimingHost, { target, props: { mode: 'parallel' } });
    mounted.push({ component, target });

    await tick();
    const first = target.querySelector<HTMLElement>('[data-testid="target-first"]')!;
    const second = target.querySelector<HTMLElement>('[data-testid="target-second"]')!;

    expect(first.style.opacity).toBe('0');
    expect(second.style.opacity).toBe('0');
    expect(bindSpy).toHaveBeenCalledTimes(1);

    const binding = bindSpy.mock.results[0]!.value;
    expect(binding).toBeDefined();
    expect(binding.record?.live).toBe(true);

    const startSpy = vi.spyOn(binding, 'start');

    const firstWrites: number[] = [];
    const secondWrites: number[] = [];

    const origFirstSetProperty = first.style.setProperty.bind(first.style);
    first.style.setProperty = (prop, val, prio) => {
      if (prop === 'opacity') firstWrites.push(Number(val));
      origFirstSetProperty(prop, val, prio);
    };

    const origSecondSetProperty = second.style.setProperty.bind(second.style);
    second.style.setProperty = (prop, val, prio) => {
      if (prop === 'opacity') secondWrites.push(Number(val));
      origSecondSetProperty(prop, val, prio);
    };

    try {
      target.querySelector<HTMLButtonElement>('[data-testid="update-motion"]')!.click();
      flushSync();

      expect(bindSpy).toHaveBeenCalledTimes(1);
      expect(startSpy).toHaveBeenCalledTimes(1);

      await waitFor(() => {
        const firstValue = Number(first.style.opacity);
        const secondValue = Number(second.style.opacity);
        return firstValue > 0 && firstValue < 1 && secondValue > 0 && secondValue < 1;
      }, 'parallel targets never overlapped in their intermediate states');
      expect(firstWrites.some((v) => v > 0 && v < 1)).toBe(true);
      expect(secondWrites.some((v) => v > 0 && v < 1)).toBe(true);

      await waitFor(
        () => first.style.opacity === '1' && second.style.opacity === '1',
        'parallel motion did not reach settled final state'
      );
      expect(first.style.opacity).toBe('1');
      expect(second.style.opacity).toBe('1');

      expect(firstWrites.some((v) => v > 0 && v < 1)).toBe(true);
      expect(secondWrites.some((v) => v > 0 && v < 1)).toBe(true);
    } finally {
      first.style.setProperty = origFirstSetProperty;
      second.style.setProperty = origSecondSetProperty;
      startSpy.mockRestore();
      bindSpy.mockRestore();
    }
  });

  it('executes stagger recipe with one shared binding and start, proving ordered starts without sampling a fixed millisecond', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const bindSpy = vi.spyOn(TargetRegistry.prototype, 'bind');
    const component = mount(MotionGroupTimingHost, { target, props: { mode: 'stagger' } });
    mounted.push({ component, target });

    await tick();
    const first = target.querySelector<HTMLElement>('[data-testid="target-first"]')!;
    const second = target.querySelector<HTMLElement>('[data-testid="target-second"]')!;

    expect(first.style.opacity).toBe('0');
    expect(second.style.opacity).toBe('0');
    expect(bindSpy).toHaveBeenCalledTimes(1);

    const binding = bindSpy.mock.results[0]!.value;
    expect(binding).toBeDefined();
    expect(binding.record?.live).toBe(true);

    const startSpy = vi.spyOn(binding, 'start');

    const firstWrites: number[] = [];
    const secondWrites: number[] = [];
    const writeEvents: Array<{ target: 'first' | 'second'; value: number; time: number }> = [];

    const origFirstSetProperty = first.style.setProperty.bind(first.style);
    first.style.setProperty = (prop, val, prio) => {
      if (prop === 'opacity') {
        const num = Number(val);
        firstWrites.push(num);
        writeEvents.push({ target: 'first', value: num, time: performance.now() });
      }
      origFirstSetProperty(prop, val, prio);
    };

    const origSecondSetProperty = second.style.setProperty.bind(second.style);
    second.style.setProperty = (prop, val, prio) => {
      if (prop === 'opacity') {
        const num = Number(val);
        secondWrites.push(num);
        writeEvents.push({ target: 'second', value: num, time: performance.now() });
      }
      origSecondSetProperty(prop, val, prio);
    };

    try {
      target.querySelector<HTMLButtonElement>('[data-testid="update-motion"]')!.click();
      flushSync();

      expect(bindSpy).toHaveBeenCalledTimes(1);
      expect(startSpy).toHaveBeenCalledTimes(1);

      await waitFor(() => firstWrites.some((v) => v > 0 && v < 1), 'first target received no intermediate opacity writes');
      expect(second.style.opacity).toBe('0');
      await waitFor(() => {
        const firstValue = Number(first.style.opacity);
        const secondValue = Number(second.style.opacity);
        return firstValue > 0 && firstValue < 1 && secondValue > 0 && secondValue < 1;
      }, 'stagger targets never overlapped after the initial gap');
      expect(Number(first.style.opacity)).toBeGreaterThan(Number(second.style.opacity));

      await waitFor(
        () => first.style.opacity === '1' && second.style.opacity === '1',
        'stagger motion did not reach settled final state'
      );
      expect(first.style.opacity).toBe('1');
      expect(second.style.opacity).toBe('1');

      const firstStartIndex = writeEvents.findIndex((e) => e.target === 'first' && e.value > 0);
      const secondStartIndex = writeEvents.findIndex((e) => e.target === 'second' && e.value > 0);
      expect(firstStartIndex).toBeGreaterThanOrEqual(0);
      expect(secondStartIndex).toBeGreaterThan(firstStartIndex);
      expect(writeEvents[firstStartIndex]!.time).toBeLessThanOrEqual(writeEvents[secondStartIndex]!.time);

      const secondWritesBeforeFirst = writeEvents.slice(0, firstStartIndex).filter((e) => e.target === 'second');
      expect(secondWritesBeforeFirst).toHaveLength(0);
    } finally {
      first.style.setProperty = origFirstSetProperty;
      second.style.setProperty = origSecondSetProperty;
      startSpy.mockRestore();
      bindSpy.mockRestore();
    }
  });
});
