import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import MotionGroupBrowser from './fixtures/MotionGroupBrowser.svelte';
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

describe('useMotionGroup in a real browser', () => {
  it('coalesces initial attachments into one live binding with initial style adoption and no entrance or media work', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const bind = vi.spyOn(TargetRegistry.prototype, 'bind');
    const animate = vi.spyOn(Element.prototype, 'animate');
    const matchMedia = vi.spyOn(window, 'matchMedia');
    const styleWrite = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty');
    const component = mount(MotionGroupBrowser, { target, props: { optional: false } });
    mounted.push({ component, target });

    try {
      await tick();
      const first = target.querySelector<HTMLElement>('[data-testid="target-first"]')!;
      const second = target.querySelector<HTMLElement>('[data-testid="target-second"]')!;
      expect(first.style.opacity).toBe('0');
      expect(second.style.opacity).toBe('0');
      expect(bind).toHaveBeenCalledTimes(1);
      expect(bind.mock.results.filter((result) => result.value?.record.live)).toHaveLength(1);

      const redundantOpacityWrites = styleWrite.mock.calls.filter(([property]) => property === 'opacity');
      expect(redundantOpacityWrites).toEqual([]);
      expect(animate).not.toHaveBeenCalled();
      expect(matchMedia).not.toHaveBeenCalled();
    } finally {
      styleWrite.mockRestore();
      matchMedia.mockRestore();
      animate.mockRestore();
      bind.mockRestore();
    }
  });

  it('makes prior bindings non-live on empty detach, prevents work while empty, and creates one live binding on reattach', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const bind = vi.spyOn(TargetRegistry.prototype, 'bind');
    const animate = vi.spyOn(Element.prototype, 'animate');
    const matchMedia = vi.spyOn(window, 'matchMedia');
    const styleWrite = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty');
    const component = mount(MotionGroupBrowser, { target, props: { optional: false } });
    mounted.push({ component, target });

    try {
      await tick();
      const first = target.querySelector<HTMLElement>('[data-testid="target-first"]')!;
      const second = target.querySelector<HTMLElement>('[data-testid="target-second"]')!;
      expect(bind).toHaveBeenCalledTimes(1);
      expect(bind.mock.results.filter((result) => result.value?.record.live)).toHaveLength(1);

      target.querySelector<HTMLButtonElement>('[data-testid="detach-both"]')!.click();
      flushSync();
      expect(first.isConnected).toBe(false);
      expect(second.isConnected).toBe(false);
      expect(bind.mock.results.filter((result) => result.value?.record.live)).toHaveLength(0);

      target.querySelector<HTMLButtonElement>('[data-testid="update-motion"]')!.click();
      await tick();
      expect(bind).toHaveBeenCalledTimes(1);
      expect(animate).not.toHaveBeenCalled();
      expect(matchMedia).not.toHaveBeenCalled();

      target.querySelector<HTMLButtonElement>('[data-testid="reattach-both"]')!.click();
      await tick();
      const newFirst = target.querySelector<HTMLElement>('[data-testid="target-first"]')!;
      const newSecond = target.querySelector<HTMLElement>('[data-testid="target-second"]')!;
      expect(newFirst).not.toBe(first);
      expect(newSecond).not.toBe(second);
      expect(newFirst.style.opacity).toBe('1');
      expect(newSecond.style.opacity).toBe('1');
      expect(bind).toHaveBeenCalledTimes(2);
      expect(bind.mock.results.filter((result) => result.value?.record.live)).toHaveLength(1);
      expect(animate).not.toHaveBeenCalled();
      expect(matchMedia).not.toHaveBeenCalled();
    } finally {
      styleWrite.mockRestore();
      matchMedia.mockRestore();
      animate.mockRestore();
      bind.mockRestore();
    }
  });

  it('contains playback without partial intermediate writes when a required target is absent, and animates when optional', async () => {
    const targetRequired = document.createElement('div');
    document.body.appendChild(targetRequired);
    const compRequired = mount(MotionGroupBrowser, { target: targetRequired, props: { optional: false } });
    mounted.push({ component: compRequired, target: targetRequired });
    await tick();
    targetRequired.querySelector<HTMLButtonElement>('[data-testid="toggle-second"]')!.click();
    await tick();
    expect(targetRequired.querySelector('[data-testid="target-second"]')).toBeNull();
    const firstRequired = targetRequired.querySelector<HTMLElement>('[data-testid="target-first"]')!;
    const reqWrites: number[] = [];
    const origReqSetProperty = firstRequired.style.setProperty.bind(firstRequired.style);
    firstRequired.style.setProperty = (prop, val, prio) => {
      if (prop === 'opacity') reqWrites.push(Number(val));
      origReqSetProperty(prop, val, prio);
    };
    targetRequired.querySelector<HTMLButtonElement>('[data-testid="update-motion"]')!.click();
    flushSync();
    await frame();
    await frame();
    expect(reqWrites.some((v) => v > 0 && v < 1)).toBe(false);

    const targetOptional = document.createElement('div');
    document.body.appendChild(targetOptional);
    const compOptional = mount(MotionGroupBrowser, { target: targetOptional, props: { optional: true } });
    mounted.push({ component: compOptional, target: targetOptional });
    await tick();
    targetOptional.querySelector<HTMLButtonElement>('[data-testid="toggle-second"]')!.click();
    await tick();
    expect(targetOptional.querySelector('[data-testid="target-second"]')).toBeNull();
    const firstOptional = targetOptional.querySelector<HTMLElement>('[data-testid="target-first"]')!;
    const optWrites: number[] = [];
    const origOptSetProperty = firstOptional.style.setProperty.bind(firstOptional.style);
    firstOptional.style.setProperty = (prop, val, prio) => {
      if (prop === 'opacity') optWrites.push(Number(val));
      origOptSetProperty(prop, val, prio);
    };
    targetOptional.querySelector<HTMLButtonElement>('[data-testid="update-motion"]')!.click();
    flushSync();
    await waitFor(() => optWrites.some((v) => v > 0 && v < 1), 'no intermediate opacity write on present first target');
    await waitFor(() => firstOptional.style.opacity === '1', 'motion did not reach the on state');
    expect(optWrites.some((v) => v > 0 && v < 1)).toBe(true);
    expect(reqWrites.some((v) => v > 0 && v < 1)).toBe(false);
  });
});
