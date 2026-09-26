import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { animateModalIn, animateModalOut } from '../src/lib/animation/animate';
import AlertRegistration from './fixtures/AlertRegistration.svelte';
const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
it.each(['in', 'out'] as const)('modal %s uses one 0.95 scale and preserves its center in native geometry', async direction => {
 const element = document.createElement('div'); element.style.cssText = 'position:fixed;left:400px;top:300px;width:200px;height:100px;transform:translate(-50%,-50%)'; document.body.append(element);
 const owner = new AbortController(); const pending = (direction === 'in' ? animateModalIn : animateModalOut)(element, { visualDuration: .05, bounce: 0 }, owner.signal);
 try {
  await vi.waitFor(() => expect(element.getAnimations().length).toBeGreaterThan(0));
  const animations = element.getAnimations();
  for (const animation of animations) { animation.pause(); animation.currentTime = direction === 'in' ? 0 : Number(animation.effect!.getComputedTiming().endTime); }
  await frame(); const box = element.getBoundingClientRect();
  console.info('modal-geometry', direction, { width: box.width, height: box.height, centerX: box.x + box.width / 2, centerY: box.y + box.height / 2, transform: getComputedStyle(element).transform, scale: getComputedStyle(element).scale });
  expect(box.width).toBeCloseTo(190, 1); expect(box.height).toBeCloseTo(95, 1);
  expect(box.x + box.width / 2).toBeCloseTo(400, 1); expect(box.y + box.height / 2).toBeCloseTo(300, 1);
 } finally { owner.abort(); await pending; element.remove(); }
});
it('conditional title/description removal clears their ARIA references and remount restores live references', () => {
 const target = document.createElement('div'); document.body.append(target); const component = mount(AlertRegistration, { target }); flushSync();
 cleanups.push(() => { void unmount(component); target.remove(); });
 const dialog = document.querySelector('[role="alertdialog"]')!;
 const liveReference = (name: string) => { const id = dialog.getAttribute(name); expect(id).toBeTruthy(); expect(document.getElementById(id!)).not.toBeNull(); };
 liveReference('aria-labelledby'); liveReference('aria-describedby');
 component.setParts(false, true); flushSync();
 expect(dialog.hasAttribute('aria-labelledby')).toBe(false); liveReference('aria-describedby');
 component.setParts(false, false); flushSync();
 expect(dialog.hasAttribute('aria-labelledby')).toBe(false); expect(dialog.hasAttribute('aria-describedby')).toBe(false); expect(dialog.getAttribute('aria-label')).toBe('Fallback');
 component.setParts(true, true); flushSync(); liveReference('aria-labelledby'); liveReference('aria-describedby');
});

import StackLifetime from './fixtures/StackLifetime.svelte';
import { animateBackdropIn } from '../src/lib/animation/animate';
function mountStack(withId = false) {
 const completed = vi.fn(); const target = document.createElement('div'); document.body.append(target);
 const component = mount(StackLifetime, { target, props: { onComplete: completed, withId } }); flushSync();
 cleanups.push(() => { void unmount(component); target.remove(); });
 return { component, completed, target };
}
async function completionBoundary() { const element = document.createElement('div'); document.body.append(element); try { await animateBackdropIn(element); } finally { element.remove(); } }
it('ordinary no-ID push/pop/push lifecycles continue animating', async () => {
 const { component, completed } = mountStack();
 await vi.waitFor(() => expect(completed).toHaveBeenCalledWith('presented:first'));
 component.presented(); flushSync(); component.dismiss(); flushSync();
 await vi.waitFor(() => expect(completed).toHaveBeenCalledWith('dismissed:first'));
 component.idle(); flushSync(); component.replace('second'); flushSync();
 await vi.waitFor(() => expect(completed).toHaveBeenCalledWith('presented:second'));
 expect(completed).toHaveBeenCalledTimes(3);
});
it.each([false, true])('replacement owns a new animation despite reused/no ID (withId=%s)', async withId => {
 const { component, completed, target } = mountStack(withId);
 await vi.waitFor(() => expect(target.getAnimations({ subtree: true }).length).toBeGreaterThan(0));
 const old = target.getAnimations({ subtree: true }); old.forEach(a => a.pause());
 component.replace('second'); flushSync();
 expect.soft(target.querySelector('.z-20')?.textContent).toContain('second');
 await vi.waitFor(() => expect(target.getAnimations({ subtree: true }).some(a => !old.includes(a))).toBe(true));
 const replacement = target.getAnimations({ subtree: true }).filter(a => !old.includes(a));
 replacement.forEach(a => a.pause());
 await completionBoundary(); expect(completed).not.toHaveBeenCalled();
 replacement.forEach(a => a.play());
 await vi.waitFor(() => expect(completed).toHaveBeenCalledTimes(1));
 expect(target.querySelector('.z-20')?.textContent).toContain('second'); expect(completed).toHaveBeenCalledWith('presented:second');
});
it('unmount stops both stack layers and drops obsolete completion', async () => {
 const { component, completed, target } = mountStack();
 await vi.waitFor(() => expect(target.getAnimations({ subtree: true }).length).toBeGreaterThan(0));
 const old = target.getAnimations({ subtree: true }); old.forEach(a => a.pause());
 component.hide(); flushSync(); expect.soft(old.every(a => a.playState === 'idle')).toBe(true);
 old.forEach(a => a.finish()); await completionBoundary(); expect(completed).not.toHaveBeenCalled();
});

it('spring configuration replacement restarts an unfinished owner and completes exactly once', async () => {
 const { component, completed, target } = mountStack();
 await vi.waitFor(() => expect(target.getAnimations({ subtree: true }).length).toBeGreaterThan(0));
 const old = target.getAnimations({ subtree: true }); old.forEach(a => a.pause());
 component.updateConfig(); flushSync();
 expect(old.every(a => a.playState === 'idle')).toBe(true);
 await vi.waitFor(() => expect(completed).toHaveBeenCalledTimes(1));
 expect(completed).toHaveBeenCalledWith('presented:first');
});
