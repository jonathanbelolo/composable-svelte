/**
 * Coordinator-owned overlay stacking (fluid-overlays design §10 C1), through the real ModalPrimitive portal
 * wrappers: an earlier layer's content (z-51) paints BELOW a later layer's backdrop (z-50); closing the later
 * layer restores the earlier one. Actual screenshot pixels, three engines.
 */
import { afterEach, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { flushSync, mount, unmount } from 'svelte';
import TwoModals from './overlay-fixtures/TwoModals.svelte';
import { overlayLayers, liveOverlaySlots } from '../../src/lib/actions/overlayLayers.js';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); });
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

async function pixelAt(x: number, y: number): Promise<[number, number, number]> {
  const shot = await page.screenshot({ element: document.documentElement, base64: true, save: false } as never) as unknown;
  const base64 = typeof shot === 'string' ? shot : (shot as { base64: string }).base64;
  const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
  const scale = image.width / document.documentElement.clientWidth;
  const [r, g, b] = context.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data;
  return [r!, g!, b!];
}
const near = (actual: readonly number[], expected: readonly number[]) => actual.every((value, index) => Math.abs(value - expected[index]!) <= 12);

it('an earlier layer (content z-51) paints below a later layer backdrop (z-50); closing the later layer restores it', async () => {
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(TwoModals, { target }) as unknown as { setSecond(next: unknown): void };
  stops.push(() => { unmount(component as never); target.remove(); });
  flushSync(); await frame(); await frame();
  expect(near(await pixelAt(40, 40), [220, 0, 0])).toBe(true); // first content visible
  component.setSecond({ status: 'presented', content: 'b' });
  flushSync(); await frame(); await frame();
  const layers = overlayLayers(document);
  expect(layers.length).toBe(2);
  expect(layers.map(layer => Number(layer.wrapper.style.zIndex))).toEqual([50, 51]);
  expect(near(await pixelAt(40, 40), [0, 0, 220])).toBe(true); // later backdrop covers earlier content
  expect(near(await pixelAt(220, 170), [0, 160, 0])).toBe(true); // later content on top
  component.setSecond({ status: 'idle' });
  flushSync(); await frame(); await frame();
  expect(overlayLayers(document).length).toBe(1);
  expect(near(await pixelAt(40, 40), [220, 0, 0])).toBe(true);
  expect(liveOverlaySlots(document)).toBe(0);
});

import LayerWitness from './overlay-fixtures/LayerWitness.svelte';
import { dismissalLayerOrder } from '../../src/lib/actions/dismissalCoordinator.js';

it('managed stacking keeps the containing block: a popover\'s percentage offset/width and document scrolling resolve as before; the page stays hit-testable', async () => {
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(LayerWitness, { target, props: { mode: 'popover' } });
  stops.push(() => { unmount(component); target.remove(); window.scrollTo(0, 0); });
  flushSync(); await frame(); await frame();
  const popover = document.querySelector<HTMLElement>('[data-popover]')!;
  const width = document.documentElement.clientWidth;
  const before = popover.getBoundingClientRect();
  expect(before.width).toBeCloseTo(width * 0.5, 0);
  expect(before.left).toBeCloseTo(width * 0.1, 0);
  window.scrollTo(0, 200); await frame(); await frame();
  const after = popover.getBoundingClientRect();
  expect(after.top).toBeCloseTo(before.top - 200, 0); // document-positioned, as with the initial containing block
  window.scrollTo(0, 0); await frame();
  // The full-box layer wrapper takes no pointer events: the page underneath is still the hit target.
  expect(document.elementFromPoint(20, 15)?.hasAttribute('data-page-button')).toBe(true);
});

it('a Modal nested in another Modal\'s children snippet paints above it, ranked by the dismissal coordinator (not by mount order)', async () => {
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(LayerWitness, { target, props: { mode: 'nested' } });
  stops.push(() => { unmount(component); target.remove(); });
  flushSync(); await frame(); await frame(); await frame();
  const order = dismissalLayerOrder(document);
  const outerLayer = overlayLayers(document).find(layer => layer.wrapper.querySelector('[data-outer-content]') && !layer.wrapper.querySelector('[data-inner-content]')) ?? overlayLayers(document).find(layer => layer.wrapper.contains(document.querySelector('[data-outer-content]')));
  const innerLayer = overlayLayers(document).find(layer => layer.wrapper.contains(document.querySelector('[data-inner-content]')) && !layer.wrapper.contains(document.querySelector('[data-outer-content]')));
  expect(order.length).toBe(2);
  expect(innerLayer).toBeDefined(); expect(outerLayer).toBeDefined();
  expect(Number(innerLayer!.wrapper.style.zIndex)).toBeGreaterThan(Number(outerLayer!.wrapper.style.zIndex));
  expect(order.indexOf(order.find(node => innerLayer!.wrapper.contains(node))!)).toBeGreaterThan(order.indexOf(order.find(node => outerLayer!.wrapper.contains(node))!));
  expect(near(await pixelAt(40, 40), [0, 0, 220])).toBe(true); // the inner backdrop covers the outer content
  expect(near(await pixelAt(220, 170), [0, 160, 0])).toBe(true);
});
