import { afterEach, it, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PopoverOwner from './fixtures/PopoverOwner.svelte';
import { animatePopoverIn, animatePopoverOut } from '../src/lib/animation/animate';
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const dispose of cleanup.splice(0)) await dispose(); });
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function setup() {
  const completed = vi.fn(); const target = document.createElement('div'); document.body.append(target);
  const component = mount(PopoverOwner, { target, props: { onComplete: completed } }); flushSync();
  cleanup.push(async () => { await unmount(component); target.remove(); });
  await vi.waitFor(() => expect(document.querySelector('[data-popover-owner]')?.getAnimations().length).toBeGreaterThan(0));
  return { component, completed, element: document.querySelector<HTMLElement>('[data-popover-owner]')! };
}
async function boundary() { const element = document.createElement('div'); document.body.append(element); try { await animatePopoverIn(element, '', { visualDuration: .04, bounce: 0 }); } finally { element.remove(); } }
it('unmount cancels native popover playback and suppresses late completion', async () => {
  const { component, completed, element } = await setup(); const old = element.getAnimations(); old.forEach(a => a.pause());
  component.hide(); flushSync(); expect.soft(old.every(a => a.playState === 'idle')).toBe(true);
  old.forEach(a => a.finish()); await boundary(); expect(completed).not.toHaveBeenCalled();
});
it('same-phase replacement and config restart complete only the current owner', async () => {
  const { component, completed, element } = await setup(); const old = element.getAnimations(); old.forEach(a => a.pause());
  component.present('second'); flushSync(); component.updateConfig(); flushSync();
  expect.soft(old.every(a => a.playState === 'idle')).toBe(true);
  old.forEach(a => a.finish()); await vi.waitFor(() => expect(completed).toHaveBeenCalledTimes(1));
  expect(completed).toHaveBeenLastCalledWith('presented:second');
  await boundary(); expect(completed).toHaveBeenCalledTimes(1);
});
it('reopening during dismissal suppresses the old exit completion', async () => {
  const { component, completed, element } = await setup(); await vi.waitFor(() => expect(completed).toHaveBeenCalledTimes(1)); completed.mockClear();
  component.dismiss(); flushSync(); await frame(); const old = element.getAnimations(); expect(old.length).toBeGreaterThan(0); old.forEach(a => a.pause());
  component.present('reopened'); flushSync(); old.forEach(a => a.finish());
  await vi.waitFor(() => expect(completed).toHaveBeenCalledWith('presented:reopened')); await boundary();
  expect(completed.mock.calls).toEqual([['presented:reopened']]);
});
it.each([animatePopoverIn, animatePopoverOut])('signal controls actual popover helper playback', async run => {
  const element = document.createElement('div'); element.style.opacity = '.4'; document.body.append(element);
  cleanup.push(async () => { element.getAnimations().forEach(a => a.cancel()); element.remove(); });
  const aborted = new AbortController(); aborted.abort(); await run(element, 'translateX(10px)', undefined, aborted.signal);
  expect(element.getAnimations()).toHaveLength(0); expect(element.style.opacity).toBe('0.4');
  const owner = new AbortController(); const pending = run(element, 'translateX(10px)', undefined, owner.signal);
  await frame(); element.getAnimations().forEach(a => a.pause()); owner.abort();
  expect(await Promise.race([pending.then(() => true), frame().then(frame).then(() => false)])).toBe(true);
  expect(element.getAnimations().filter(a => a.playState === 'running' || a.playState === 'paused')).toHaveLength(0);
});
