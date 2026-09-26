import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, hydrate, mount, tick, unmount } from 'svelte';
import MotionPublicBrowser from './fixtures/MotionPublicBrowser.svelte';
import MotionPublicConditionalApp from './fixtures/MotionPublicConditionalApp.svelte';
import MotionElementOutsideHost from './fixtures/MotionElementOutsideHost.svelte';
import serverHTML from './fixtures/motion-public-browser-ssr.html?raw';
import { TargetRegistry } from '../src/lib/application/renderer/target-registry.js';

const mounted: Array<{ component: ReturnType<typeof MotionPublicBrowser>; target: HTMLElement }> = [];

afterEach(async () => {
  while (mounted.length) {
    const current = mounted.pop()!;
    await unmount(current.component);
    current.target.remove();
  }
});

function setup() {
  const target = document.createElement('div');
  target.innerHTML = serverHTML;
  document.body.appendChild(target);
  const original = target.querySelector<HTMLElement>('[data-testid="motion-public"]');
  const component = hydrate(MotionPublicBrowser, { target });
  mounted.push({ component, target });
  return { component, node: target.querySelector<HTMLElement>('[data-testid="motion-public"]')!, original };
}

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

describe('public motion lifecycle in a real browser', () => {
  it('refuses MotionElement outside ApplicationHost before node, Motion, preference, or timer acquisition', () => {
    const target = document.createElement('div');
    document.body.append(target);
    const createElement = vi.spyOn(document, 'createElement');
    const createElementNS = vi.spyOn(document, 'createElementNS');
    const animate = vi.spyOn(Element.prototype, 'animate');
    const matchMedia = vi.spyOn(window, 'matchMedia');
    const animationFrame = vi.spyOn(window, 'requestAnimationFrame');
    const timeout = vi.spyOn(window, 'setTimeout');

    try {
      expect(() => mount(MotionElementOutsideHost, { target })).toThrowError(
        'A managed target requires ApplicationHost',
      );
      expect(createElement.mock.calls.filter(([name]) => name === 'article')).toHaveLength(0);
      expect(createElementNS.mock.calls.filter(([, name]) => name === 'article')).toHaveLength(0);
      expect(target.querySelector('[data-testid="outside-host-motion"]')).toBeNull();
      expect(animate).not.toHaveBeenCalled();
      expect(matchMedia).not.toHaveBeenCalled();
      expect(animationFrame).not.toHaveBeenCalled();
      expect(timeout).not.toHaveBeenCalled();
    } finally {
      createElement.mockRestore();
      createElementNS.mockRestore();
      animate.mockRestore();
      matchMedia.mockRestore();
      animationFrame.mockRestore();
      timeout.mockRestore();
      target.remove();
    }
  });

  it('hydrates at the stable state and performs observable real-engine intermediate writes', async () => {
    const { component, node, original } = setup();
    await tick();
    expect(node).toBe(original);
    expect(node.style.opacity).toBe('0');
    const writes: number[] = [];
    const setProperty = node.style.setProperty.bind(node.style);
    node.style.setProperty = (property, value, priority) => {
      if (property === 'opacity') writes.push(Number(value));
      setProperty(property, value, priority);
    };

    component.show();
    flushSync();
    await waitFor(() => writes.some((value) => value > 0 && value < 1), 'no intermediate opacity write');
    await waitFor(() => node.style.opacity === '1', 'motion did not reach the on state');
    expect(writes.some((value) => value > 0 && value < 1)).toBe(true);
  });

  it('interrupts an incumbent and prevents its late destination from overwriting the successor', async () => {
    const { component, node } = setup();
    await tick();
    component.show();
    flushSync();
    await waitFor(() => Number(node.style.opacity) > 0 && Number(node.style.opacity) < 1, 'first motion did not start');
    component.hide();
    flushSync();
    await waitFor(() => node.style.opacity === '0', 'replacement did not settle off');
    await frame();
    await frame();
    expect(node.style.opacity).toBe('0');
  });

  it('hydrates with one live binding record and no duplicate stable or global-listener work', async () => {
    const target = document.createElement('div');
    target.innerHTML = serverHTML;
    document.body.appendChild(target);
    const original = target.querySelector<HTMLElement>('[data-testid="motion-public"]')!;
    const setProperty = vi.spyOn(original.style, 'setProperty');
    const setAttribute = vi.spyOn(original, 'setAttribute');
    const bind = vi.spyOn(TargetRegistry.prototype, 'bind');
    const mediaPrototype = Object.getPrototypeOf(window.matchMedia('(prefers-reduced-motion: reduce)')) as MediaQueryList;
    const addListener = vi.spyOn(mediaPrototype, 'addEventListener');
    const matchMedia = vi.spyOn(window, 'matchMedia');
    const component = hydrate(MotionPublicBrowser, { target });

    try {
      await tick();
      expect(target.querySelector('[data-testid="motion-public"]')).toBe(original);
      expect(bind).toHaveBeenCalledTimes(1);
      const binding = bind.mock.results[0]?.value;
      expect(binding?.record.live).toBe(true);
      expect(bind.mock.results.filter((result) => result.value?.record.live)).toHaveLength(1);
      expect(setProperty.mock.calls.filter(([property]) => property === 'opacity')).toEqual([]);
      expect(setAttribute.mock.calls.filter(([name]) => name === 'style')).toEqual([]);
      expect(matchMedia).not.toHaveBeenCalled();
      expect(addListener).not.toHaveBeenCalled();
    } finally {
      await unmount(component);
      target.remove();
      addListener.mockRestore();
      matchMedia.mockRestore();
      bind.mockRestore();
      setAttribute.mockRestore();
      setProperty.mockRestore();
    }
  });

  it('detaches and reattaches one public handle with one fresh pair and latest-state adoption', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const bind = vi.spyOn(TargetRegistry.prototype, 'bind');
    const animate = vi.spyOn(Element.prototype, 'animate');
    const matchMedia = vi.spyOn(window, 'matchMedia');
    const styleWrite = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty');
    const component = mount(MotionPublicConditionalApp, { target });

    try {
      await tick();
      const first = target.querySelector<HTMLElement>('[data-testid="conditional-motion"]')!;
      expect(first.style.opacity).toBe('0');
      expect(bind).toHaveBeenCalledTimes(1);
      expect(bind.mock.results.filter((result) => result.value?.record.live)).toHaveLength(1);

      target.querySelector<HTMLButtonElement>('[data-testid="detach-motion"]')!.click();
      await tick();
      expect(first.isConnected).toBe(false);
      expect(bind.mock.results.filter((result) => result.value?.record.live)).toHaveLength(0);

      target.querySelector<HTMLButtonElement>('[data-testid="update-motion"]')!.click();
      await tick();
      expect(bind).toHaveBeenCalledTimes(1);
      expect(animate).not.toHaveBeenCalled();
      expect(matchMedia).not.toHaveBeenCalled();

      target.querySelector<HTMLButtonElement>('[data-testid="reattach-motion"]')!.click();
      await tick();
      const second = target.querySelector<HTMLElement>('[data-testid="conditional-motion"]')!;
      expect(second).not.toBe(first);
      expect(second.style.opacity).toBe('1');
      expect(bind).toHaveBeenCalledTimes(2);
      expect(bind.mock.results.filter((result) => result.value?.record.live)).toHaveLength(1);
      expect(animate).not.toHaveBeenCalled();
      expect(matchMedia).not.toHaveBeenCalled();
      const adoptionWrites = styleWrite.mock.calls.filter(
        ([property, value], index) => styleWrite.mock.contexts[index] === second.style
          && property === 'opacity' && value === '1',
      );
      expect(adoptionWrites).toHaveLength(1);
    } finally {
      await unmount(component);
      target.remove();
      styleWrite.mockRestore();
      matchMedia.mockRestore();
      animate.mockRestore();
      bind.mockRestore();
    }
  });
});
