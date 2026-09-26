import { describe, it, expect, afterEach, vi } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { render, cleanup } from 'vitest-browser-svelte';
import Tooltip from './test-components/TooltipReviewHarness.svelte';
import Carousel from '../src/lib/components/ui/carousel/Carousel.svelte';
afterEach(cleanup);
async function parkPointer() {
 const parking = document.createElement('div');
 parking.style.cssText='position:fixed;right:0;bottom:0;width:20px;height:20px;z-index:2147483647';
 document.body.append(parking);
 try { await userEvent.hover(parking); } finally { parking.remove(); }
}

describe('tooltip/carousel mounted regression',()=>{
 it('DEF004 pointer exit during tooltip entrance completes dismissal',async()=>{
  await parkPointer();
  const screen=render(Tooltip);const wrapper=screen.container.querySelector('button')!.parentElement!;
  wrapper.dispatchEvent(new MouseEvent('mouseenter'));
  await expect.poll(()=>screen.container.querySelector('[role="tooltip"]')?.getAttribute('data-state'),{interval:5}).toBe('presenting');
  wrapper.dispatchEvent(new MouseEvent('mouseleave'));
  await expect.poll(()=>screen.container.querySelector('[role="tooltip"]')).toBeNull();
 });
 it('B006-2 position update does not reset presented tooltip opacity',async()=>{
  await parkPointer();
  const screen=render(Tooltip);const wrapper=screen.container.querySelector('button')!.parentElement!;
  wrapper.dispatchEvent(new MouseEvent('mouseenter'));
  await expect.poll(()=>screen.container.querySelector('[role="tooltip"]')?.getAttribute('data-state')).toBe('presented');
  const tooltip=screen.container.querySelector<HTMLElement>('[role="tooltip"]')!;
  await expect.poll(()=>Number(getComputedStyle(tooltip).opacity)).toBeGreaterThan(.99);
  // Wait for Motion's committed resting style, not an in-flight near-1 frame.
  await expect.poll(()=>tooltip.style.opacity).toBe('1');
  // This isolated harness does not load consumer Tailwind utilities.
  // Supply the finite tooltip width needed to exercise unclamped positioning.
  tooltip.style.width='120px';
  const previousLeft=tooltip.style.left;
  wrapper.style.marginLeft='300px';window.dispatchEvent(new Event('resize'));
  await expect.poll(()=>tooltip.style.left).not.toBe(previousLeft);
  expect(tooltip.style.opacity).toBe('1');
  await expect.poll(()=>Number(getComputedStyle(tooltip).opacity)).toBeGreaterThan(.99);
  wrapper.dispatchEvent(new MouseEvent('mouseleave'));await expect.poll(()=>screen.container.querySelector('[role="tooltip"]')).toBeNull();
 });
 it('DEF011 zero/single slides disable navigation and do not produce transition callbacks',async()=>{
  for(const slides of [[],[{id:'one',data:'One'}]]){
   const changed=vi.fn();const screen=render(Carousel,{slides,loop:true,onSlideChange:changed});
   await expect.element(screen.getByRole('button',{name:'Next slide'})).toBeDisabled();
   await expect.element(screen.getByRole('button',{name:'Previous slide'})).toBeDisabled();
   screen.container.querySelector('.carousel-container')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
   expect(changed).not.toHaveBeenCalled();await screen.unmount();
  }
 });
 it('DEF012 autoplay keeps progressing when ticks overlap actual track animations',async()=>{
  const changed=vi.fn();const started=vi.fn();const stopped=vi.fn();
  const screen=render(Carousel,{slides:[{id:'a'},{id:'b'},{id:'c'}],autoPlayInterval:30,transitionDuration:100,onSlideChange:changed,onAutoPlayStart:started,onAutoPlayStop:stopped});
  await expect.poll(()=>changed.mock.calls.length,{timeout:3000}).toBeGreaterThanOrEqual(2);
  expect(started).toHaveBeenCalledTimes(1);
  screen.container.querySelector('.carousel-container')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
  expect(stopped).toHaveBeenCalledTimes(1);
  const count=changed.mock.calls.length;
  await new Promise(resolve=>setTimeout(resolve,160));
  expect(changed).toHaveBeenCalledTimes(count);
  await screen.unmount();
 });
});
