/**
 * C4: Command palette default open/close motion through the minimal adapter (bindable `open` unchanged): the engine
 * claims each accepted transition (a run is prepared, the dialog is driven), the palette rests fully visible when
 * open and is removed after the close run; no leases remain.
 */
import { afterEach, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CommandApp from './overlay-fixtures/CommandApp.svelte';
import { overlayDefinition, overlayHooks } from './overlay-fixtures/OverlayModel.js';
import { liveChoreographyLeases } from '../../src/lib/application/renderer/target-registry.js';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

it('Command open/close run through its default overlay plans', async () => {
  let page: { setOpen(next: boolean): void } | undefined;
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(CommandApp, { target, props: { definition: overlayDefinition() as never, onPage: (value: unknown) => { page = value as never; } } });
  cleanups.push(() => { unmount(component); target.remove(); });
  flushSync(); await frame();
  const host = overlayHooks.host as { diagnostics: { type: string; transaction?: number }[] };
  const prepared = () => host.diagnostics.filter(event => event.type === 'prepared').length;
  page!.setOpen(true); flushSync(); await frame(); await frame(); await frame(); await frame();
  const dialog = () => document.querySelector<HTMLElement>('.command-dialog');
  expect(dialog()).not.toBeNull();
  expect(prepared()).toBe(1); // the open was claimed by a choreography run
  const mid = Number(getComputedStyle(dialog()!).opacity);
  expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(1);
  for (let i = 0; i < 60 && Number(getComputedStyle(dialog()!).opacity) < 1; i++) await frame();
  await frame(); await frame();
  expect(Number(getComputedStyle(dialog()!).opacity)).toBe(1);
  page!.setOpen(false); flushSync(); await frame(); await frame();
  expect(prepared()).toBe(2); // the close was claimed too
  for (let i = 0; i < 90 && dialog(); i++) await frame();
  expect(dialog()).toBeNull();
  expect(liveChoreographyLeases()).toBe(0);
});
