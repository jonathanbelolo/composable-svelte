import { afterEach, expect, it } from 'vitest';
import { mount, unmount, tick } from 'svelte';
import Modal from '../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
import Sheet from '../src/lib/navigation-components/primitives/SheetPrimitive.svelte';
import Drawer from '../src/lib/navigation-components/primitives/DrawerPrimitive.svelte';
import Alert from '../src/lib/navigation-components/primitives/AlertPrimitive.svelte';
import AlertVisibility from './test-components/ScrollAlertVisibility.svelte';
import { clickOutside } from '../src/lib/actions/clickOutside.js';
import { createStore } from '../src/lib/store.svelte.js';
import { Effect } from '../src/lib/effect.js';
import { ManagedIntegrationBuilder, optionalSlot } from '../src/lib/navigation/managed-integration.js';
import type { PresentationAction } from '../src/lib/navigation/types.js';
const stores: Array<{ destroy(): void }> = [];
type OverlayState = { overlay: { visible: true } | null };
type OverlayAction = { type: 'overlay'; action: PresentationAction<{ type: 'noop' }> };
const overlaySlot = optionalSlot<OverlayState, OverlayAction>()('overlay');
const composition = new ManagedIntegrationBuilder<OverlayState, OverlayAction, undefined>(state => [state, Effect.none()])
 .with(overlaySlot, state => [state, Effect.none()])
 .build();
const instances: ReturnType<typeof mount>[] = [];
const targets: HTMLElement[] = [];
let original = '';
afterEach(async () => {
 for (const instance of instances.splice(0)) await unmount(instance);
 for (const store of stores.splice(0)) store.destroy();
 targets.splice(0).forEach(node => node.remove());
 document.body.style.cssText = original;
});
for (const [name, Component] of [['Modal', Modal], ['Sheet', Sheet], ['Drawer', Drawer], ['Alert', Alert]] as const) {
 it(`${name}: removing the first root leaves the second root locked and final release restores original styles`, async () => {
  original = document.body.style.cssText;
  document.body.style.overflow = 'auto'; document.body.style.paddingRight = '11px';
  const owner = createStore({ initialState: { overlay: { visible: true } } satisfies OverlayState, ...composition });
  stores.push(owner);
  const store = composition.bind(owner, overlaySlot);
  for (let i = 0; i < 2; i++) {
   const target = document.createElement('div'); document.body.append(target); targets.push(target);
   instances.push(mount(Component, {target, props: {store}})); await tick();
  }
  expect(document.body.style.overflow).toBe('hidden');
  await unmount(instances.shift()!); await tick();
  expect(document.body.style.overflow).toBe('hidden');
  await unmount(instances.shift()!); await tick();
  expect(document.body.style.overflow).toBe('auto'); expect(document.body.style.paddingRight).toBe('11px');
 });
}

it('hidden but still mounted Alert retires its outside-click layer', async () => {
 original = document.body.style.cssText;
 const lower = document.createElement('div'); document.body.append(lower); targets.push(lower);
 let calls = 0;
 const action = clickOutside(lower, () => { calls++; });
 try {
  const target = document.createElement('div'); document.body.append(target); targets.push(target);
  instances.push(mount(AlertVisibility, {target})); await tick();
  target.querySelector<HTMLButtonElement>('[data-hide-alert]')!.click(); await tick();
  expect(document.querySelector('[data-scroll-alert]')).toBeNull();
  document.body.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, button: 0}));
  await expect.poll(() => calls).toBe(1);
 } finally { action.destroy(); }
});
