import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import MotionGroupTopologyHost from './fixtures/MotionGroupTopologyHost.svelte';
import { TargetRegistry } from '../src/lib/application/renderer/target-registry.js';

const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLElement }> = [];

afterEach(async () => {
  while (mounted.length) {
    const current = mounted.pop()!;
    await unmount(current.component);
    current.target.remove();
  }
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

describe('useMotionGroup topology in a real browser', () => {
  it('replaces a physical target node during a two-target run without late writes to the old node, creating one live binding and adopting projection without entrance work', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const bind = vi.spyOn(TargetRegistry.prototype, 'bind');
    const component = mount(MotionGroupTopologyHost, { target, props: { initialDuplicate: false } });
    mounted.push({ component, target });

    let origSetProperty: ((property: string, value: string, priority?: string) => void) | undefined;
    let oldFirst: HTMLElement | undefined;

    try {
      await tick();
      const first = target.querySelector<HTMLElement>('[data-testid="target-first"]')!;
      const second = target.querySelector<HTMLElement>('[data-testid="target-second"]')!;
      oldFirst = first;

      expect(first.style.opacity).toBe('0');
      expect(second.style.opacity).toBe('0');
      expect(bind).toHaveBeenCalledTimes(1);
      expect(bind.mock.results.filter((result) => result.value?.record.live)).toHaveLength(1);

      const oldWrites: number[] = [];
      origSetProperty = oldFirst.style.setProperty.bind(oldFirst.style);
      oldFirst.style.setProperty = (prop, val, prio) => {
        if (prop === 'opacity') oldWrites.push(Number(val));
        origSetProperty!(prop, val ?? '', prio);
      };

      target.querySelector<HTMLButtonElement>('[data-testid="update-motion"]')!.click();
      flushSync();

      await waitFor(
        () => oldWrites.some((v) => v > 0 && v < 1),
        'motion did not start on the initial target node',
      );

      expect(oldWrites.length).toBeGreaterThan(0);

      target.querySelector<HTMLButtonElement>('[data-testid="replace-first"]')!.click();
      flushSync();
      // Retirement may synchronously restore the old lease. Only writes after that cleanup are late.
      const writesAfterRetirement = oldWrites.length;

      const newFirst = target.querySelector<HTMLElement>('[data-testid="target-first"]')!;
      expect(newFirst).not.toBe(oldFirst);
      expect(oldFirst.isConnected).toBe(false);
      expect(newFirst.isConnected).toBe(true);

      expect(bind).toHaveBeenCalledTimes(2);
      expect(bind.mock.results.filter((result) => result.value?.record.live)).toHaveLength(1);
      expect(newFirst.style.opacity).toBe('1');
      expect(bind.mock.results[1]!.value?.current).toBeUndefined();

      await frame();
      await frame();
      await waitFor(() => newFirst.style.opacity === '1', 'replacement node projection lost');
      expect(oldWrites.length).toBe(writesAfterRetirement);

      await unmount(component);
      target.remove();
      const index = mounted.findIndex((m) => m.component === component);
      if (index !== -1) mounted.splice(index, 1);
      expect(bind.mock.results.filter((result) => result.value?.record.live)).toHaveLength(0);
    } finally {
      if (oldFirst && origSetProperty) {
        oldFirst.style.setProperty = origSetProperty;
      }
      bind.mockRestore();
    }
  });

  it('rejects duplicate nodes for a required target without arbitrary selection or intermediate playback, and restores one fresh complete binding on removal', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const bind = vi.spyOn(TargetRegistry.prototype, 'bind');
    const component = mount(MotionGroupTopologyHost, { target, props: { initialDuplicate: true } });
    mounted.push({ component, target });

    let origFirstSetProperty: ((property: string, value: string, priority?: string) => void) | undefined;
    let origSecondASetProperty: ((property: string, value: string, priority?: string) => void) | undefined;
    let origSecondBSetProperty: ((property: string, value: string, priority?: string) => void) | undefined;
    let first: HTMLElement | undefined;
    let secondA: HTMLElement | undefined;
    let secondB: HTMLElement | undefined;

    try {
      await tick();
      first = target.querySelector<HTMLElement>('[data-testid="target-first"]')!;
      secondA = target.querySelector<HTMLElement>('[data-testid="target-second"]')!;
      secondB = target.querySelector<HTMLElement>('[data-testid="target-second-duplicate"]')!;

      expect(first).not.toBeNull();
      expect(secondA).not.toBeNull();
      expect(secondB).not.toBeNull();
      expect(secondA).not.toBe(secondB);
      expect(secondA.isConnected).toBe(true);
      expect(secondB.isConnected).toBe(true);

      // A nonempty physical subset owns a binding even when a required declared target is absent.
      // Planning must contain playback rather than pretending no presentation resource exists.
      expect(bind.mock.results.filter((result) => result.value?.record.live)).toHaveLength(1);

      const firstWrites: number[] = [];
      origFirstSetProperty = first.style.setProperty.bind(first.style);
      first.style.setProperty = (prop, val, prio) => {
        if (prop === 'opacity') firstWrites.push(Number(val));
        origFirstSetProperty!(prop, val ?? '', prio);
      };

      const secondAWrites: number[] = [];
      origSecondASetProperty = secondA.style.setProperty.bind(secondA.style);
      secondA.style.setProperty = (prop, val, prio) => {
        if (prop === 'opacity') secondAWrites.push(Number(val));
        origSecondASetProperty!(prop, val ?? '', prio);
      };

      const secondBWrites: number[] = [];
      origSecondBSetProperty = secondB.style.setProperty.bind(secondB.style);
      secondB.style.setProperty = (prop, val, prio) => {
        if (prop === 'opacity') secondBWrites.push(Number(val));
        origSecondBSetProperty!(prop, val ?? '', prio);
      };

      target.querySelector<HTMLButtonElement>('[data-testid="update-motion"]')!.click();
      flushSync();
      await frame();
      await frame();

      expect(firstWrites.some((v) => v > 0 && v < 1)).toBe(false);
      expect(secondAWrites.some((v) => v > 0 && v < 1)).toBe(false);
      expect(secondBWrites.some((v) => v > 0 && v < 1)).toBe(false);
      // A nonempty physical subset owns a binding even when a required declared target is absent.
      // Planning must contain playback rather than pretending no presentation resource exists.
      expect(bind.mock.results.filter((result) => result.value?.record.live)).toHaveLength(1);

      target.querySelector<HTMLButtonElement>('[data-testid="remove-duplicate"]')!.click();
      flushSync();
      await tick();

      expect(target.querySelector('[data-testid="target-second-duplicate"]')).toBeNull();
      expect(secondB.isConnected).toBe(false);
      expect(secondA.isConnected).toBe(true);

      expect(bind).toHaveBeenCalledTimes(2);
      expect(bind.mock.results.filter((result) => result.value?.record.live)).toHaveLength(1);
      expect(first.style.opacity).toBe('1');
      expect(secondA.style.opacity).toBe('1');

      await unmount(component);
      target.remove();
      const index = mounted.findIndex((m) => m.component === component);
      if (index !== -1) mounted.splice(index, 1);
      expect(bind.mock.results.filter((result) => result.value?.record.live)).toHaveLength(0);
    } finally {
      if (first && origFirstSetProperty) first.style.setProperty = origFirstSetProperty;
      if (secondA && origSecondASetProperty) secondA.style.setProperty = origSecondASetProperty;
      if (secondB && origSecondBSetProperty) secondB.style.setProperty = origSecondBSetProperty;
      bind.mockRestore();
    }
  });
});
