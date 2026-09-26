import { describe, it, expect, afterEach, vi } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { render, cleanup } from 'vitest-browser-svelte';
import Tooltip from './test-components/TooltipReviewHarness.svelte';
afterEach(cleanup);
// Synthetic hover sequences require the real pointer to stay outside the trigger.
async function parkPointer() {
 const parking = document.createElement('div');
 parking.style.cssText='position:fixed;right:0;bottom:0;width:20px;height:20px;z-index:2147483647';
 document.body.append(parking);
 try { await userEvent.hover(parking); } finally { parking.remove(); }
}

describe('tooltip mounted regression',()=>{
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
});
