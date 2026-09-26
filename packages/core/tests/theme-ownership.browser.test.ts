import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import { createThemeManager } from '../src/lib/styles/theme.js';
import ThemeOwnership from './fixtures/ThemeOwnership.svelte';

afterEach(() => vi.restoreAllMocks());

it('renders reactive theme changes and releases the last mounted owner', async () => {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const media = {
    matches: false,
    addEventListener: (_name: string, listener: EventListenerOrEventListenerObject) => listeners.add(listener),
    removeEventListener: (_name: string, listener: EventListenerOrEventListenerObject) => listeners.delete(listener)
  };
  vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList);
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
  const originalClass = document.documentElement.className;
  const manager = createThemeManager('light');
  const first = render(ThemeOwnership, { manager });
  const second = render(ThemeOwnership, { manager });
  try {
    await tick();
    expect(listeners.size).toBe(1);
    first.container.querySelector('button')!.click();
    await tick();
    expect(first.container.querySelector('p')!.textContent).toBe('dark');
    expect(second.container.querySelector('p')!.textContent).toBe('dark');
    await first.unmount();
    expect(listeners.size).toBe(1);
    await second.unmount();
    expect(listeners.size).toBe(0);
    expect(manager.initialized).toBe(false);
  } finally {
    manager.destroy();
    document.documentElement.className = originalClass;
  }
});
