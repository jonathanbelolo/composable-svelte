import { afterEach, expect, it, vi } from 'vitest';
import { animateFadeIn, animateFadeOut } from '../../src/lib/animation/animate';
const elements: HTMLElement[] = [];
afterEach(() => { elements.splice(0).forEach(element => element.remove()); vi.restoreAllMocks(); });
function element() {
  const node = document.createElement('div'); node.textContent = 'Visible content'; document.body.append(node); elements.push(node); return node;
}
function preference(initial: boolean) {
  let reduced = initial;
  const original = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation(query => query === '(prefers-reduced-motion: reduce)'
    ? { ...original(query), matches: reduced } : original(query));
  return (value: boolean) => { reduced = value; };
}
it.each([{ name: 'fade-in', start: animateFadeIn }, { name: 'fade-out', start: animateFadeOut }])('aborting a running $name settles it without a late end-state write', async ({ start }) => {
  preference(false); const node = element(); const owner = new AbortController();
  const fading = start(node, { duration: 1, signal: owner.signal });
  await expect.poll(() => node.getAnimations().length).toBeGreaterThan(0);
  owner.abort(); node.style.opacity = '0.65';
  await fading;
  expect(node.getAnimations()).toHaveLength(0);
  expect(node.style.opacity).toBe('0.65');
});
it('owner cancellation precedes reduced-motion fallback after a preference change', async () => {
  const setReduced = preference(false); const node = element(); const owner = new AbortController();
  const fading = animateFadeOut(node, { duration: 1, signal: owner.signal });
  await expect.poll(() => node.getAnimations().length).toBeGreaterThan(0);
  setReduced(true); owner.abort();
  await animateFadeIn(node, { duration: 0 }); await fading;
  expect(getComputedStyle(node).opacity).toBe('1');
  expect(node.getAnimations()).toHaveLength(0);
});
it('already aborted fade owners neither start playback nor mutate existing styles', async () => {
  preference(true); const node = element(); node.style.opacity = '0.4'; const owner = new AbortController(); owner.abort();
  await animateFadeIn(node, { signal: owner.signal });
  await animateFadeOut(node, { signal: owner.signal });
  expect(node.style.opacity).toBe('0.4'); expect(node.getAnimations()).toHaveLength(0);
});
it('no-signal fades preserve completion and reduced-motion endpoints', async () => {
  const setReduced = preference(false); const node = element();
  await animateFadeOut(node, { duration: 0 }); expect(node.style.opacity).toBe('0');
  await animateFadeIn(node, { duration: 0 }); expect(node.style.opacity).toBe('1');
  setReduced(true);
  await animateFadeOut(node); expect(node.style.opacity).toBe('0');
  await animateFadeIn(node); expect(node.style.opacity).toBe('1');
});
