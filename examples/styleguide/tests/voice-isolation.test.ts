import { it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import VoiceInputDemo from '../src/lib/components/demos/VoiceInputDemo.svelte';
const captured = vi.hoisted(() => ({ stores: [] as Array<import('@composable-svelte/core').Store<unknown, unknown>>, modes: [] as unknown[] }));
vi.mock('@composable-svelte/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@composable-svelte/core')>();
  return { ...actual, createStore: (...args: Parameters<typeof actual.createStore>) => {
    const store = actual.createStore(...args); captured.stores.push(store); captured.modes.push(args[0].execution?.mode);
    vi.spyOn(store, 'destroy'); return store;
  } };
});
it('six mounted voice variants own distinct managed stores and report one transcript once', async () => {
  captured.stores.length = 0; captured.modes.length = 0;
  const view = render(VoiceInputDemo);
  expect.soft(captured.stores).toHaveLength(6);
  expect.soft(new Set(captured.stores).size).toBe(6);
  expect.soft(captured.modes).toEqual(Array(6).fill('managed'));
  captured.stores[0]!.dispatch({ type: 'transcriptionCompleted', transcript: 'Only one result' });
  await expect.element(page.getByText('Only one result', { exact: true })).toBeVisible();
  expect([...document.querySelectorAll('*')].filter(node => node.children.length === 0 && node.textContent === 'Only one result')).toHaveLength(1);
  await view.unmount();
  for (const store of captured.stores) expect(store.destroy).toHaveBeenCalledTimes(1);
});
