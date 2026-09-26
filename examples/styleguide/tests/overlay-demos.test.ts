import { expect, it, onTestFinished, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { flushSync } from 'svelte';
import DrawerDemo from '../src/lib/components/demos/DrawerDemo.svelte';
import ModalDemo from '../src/lib/components/demos/ModalDemo.svelte';
import SheetDemo from '../src/lib/components/demos/SheetDemo.svelte';
import PopoverDemo from '../src/lib/components/demos/PopoverDemo.svelte';
import DeferredDismissalOwnershipHarness from './fixtures/DeferredDismissalOwnershipHarness.svelte';
import type { PresentationView } from '@composable-svelte/core/application';

const cases = [
  ['Drawer', DrawerDemo, 'Open Drawer', 'Close Drawer'],
  ['Modal', ModalDemo, 'Open Modal', 'Cancel'],
  ['Sheet', SheetDemo, 'Open Sheet', 'Cancel'],
  ['Popover', PopoverDemo, 'Show Bottom Popover', 'Got it'],
] as const;

const animations = () =>
  document
    .getAnimations()
    .filter((animation) => animation.playState === 'running' || animation.playState === 'paused');
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

it.each(cases)(
  '%s demo waits for real playback rather than presentation timers',
  async (_name, Component, triggerName, closeName) => {
    const view = render(Component);
    onTestFinished(async () => {
      vi.useRealTimers();
      await view.unmount();
    });

    await page.getByRole('button', { name: triggerName, exact: true }).click();
    flushSync();
    await frame();
    const entrance = animations();
    expect(entrance.length).toBeGreaterThan(0);
    entrance.forEach((animation) => animation.pause());

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await vi.advanceTimersByTimeAsync(350);
    await expect.element(page.getByRole('dialog')).toBeInTheDocument();
    expect(entrance.some((animation) => animation.playState === 'paused')).toBe(true);

    vi.useRealTimers();
    entrance.forEach((animation) => animation.play());
    await vi.waitFor(() => expect(animations()).toHaveLength(0), { timeout: 3000 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    flushSync();
    await frame();

    const closeButton = page.getByRole('button', { name: closeName, exact: true }).elements()[0];
    if (!(closeButton instanceof HTMLElement)) throw new Error('Expected an HTML close button');
    closeButton.click();
    flushSync();
    await frame();
    // A repeated request while the same owner is already dismissing must not
    // retire it before that owner's real completion callback.
    closeButton.click();
    flushSync();
    const exit = animations();
    expect(exit.length).toBeGreaterThan(0);
    exit.forEach((animation) => animation.pause());

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await vi.advanceTimersByTimeAsync(250);
    await expect.element(page.getByRole('dialog')).toBeInTheDocument();
    expect(exit.some((animation) => animation.playState === 'paused')).toBe(true);

    vi.useRealTimers();
    exit.forEach((animation) => animation.finish());
    await vi.waitFor(() => expect(page.getByRole('dialog').elements()).toHaveLength(0));
  },
);

it('keeps the replacement owner identity and exact live state when the retired owner completes', async () => {
  type ChildState = { id: number; label: string };
  type ChildAction =
    | { type: 'rename'; label: string }
    | { type: 'presentationCompleted' }
    | { type: 'dismissalCompleted' };
  const captured: PresentationView<ChildState, ChildAction>[] = [];
  const view = render(DeferredDismissalOwnershipHarness, { observe: (owner: PresentationView<ChildState, ChildAction>) => captured.push(owner) });
  onTestFinished(() => view.unmount());

  const open = page.getByRole('button', { name: 'Open owner', exact: true });
  await open.click();
  await vi.waitFor(() => expect(animations()).toHaveLength(0), { timeout: 3000 });
  await page.getByRole('button', { name: 'Update owner', exact: true }).click();
  await page.getByRole('button', { name: 'Capture owner', exact: true }).click();
  const retired = captured[0];
  expect(retired?.state).toEqual({ id: 1, label: 'updated' });
  const liveState = retired?.state;

  await userEvent.keyboard('{Escape}');
  flushSync();
  await frame();
  const retiredExit = animations();
  expect(retiredExit.length).toBeGreaterThan(0);
  retiredExit.forEach(animation => animation.pause());
  expect(retired?.state).toBe(liveState);
  retired?.dismiss();
  expect(retired?.state).toBe(liveState);

  const openElement = open.elements()[0];
  if (!(openElement instanceof HTMLElement)) throw new Error('Expected an HTML open button');
  openElement.click();
  flushSync();
  await frame();
  await page.getByRole('button', { name: 'Capture owner', exact: true }).click();
  const replacement = captured[1];
  expect(replacement).not.toBe(retired);
  expect(retired?.state).toBeUndefined();
  expect(replacement?.state).toEqual({ id: 2, label: 'initial' });

  // Exercise the captured callback directly as well as the real retiring
  // animation: a completed old owner has no authority over the replacement.
  retired?.dispatch({ type: 'dismissalCompleted' });
  expect(replacement?.state).toEqual({ id: 2, label: 'initial' });
  retiredExit.forEach(animation => animation.finish());
  await frame();
  expect(replacement?.state).toEqual({ id: 2, label: 'initial' });
  await expect.element(page.getByText('2:initial', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Capture owner', exact: true }).click();
  expect(captured[2]).toBe(replacement);

  animations().forEach(animation => animation.finish());
});

it.each(cases)(
  '%s demo supports reopen while retiring the old dismissal',
  async (_name, Component, triggerName, closeName) => {
    const view = render(Component);
    onTestFinished(async () => {
      vi.useRealTimers();
      await view.unmount();
    });

    const trigger = page.getByRole('button', { name: triggerName, exact: true });
    await trigger.click();
    flushSync();
    await frame();
    await vi.waitFor(() => expect(animations()).toHaveLength(0), { timeout: 3000 });
    await expect.element(page.getByRole('dialog')).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 50));
    flushSync();
    await frame();

    const closeButton = page.getByRole('button', { name: closeName, exact: true }).elements()[0];
    if (!(closeButton instanceof HTMLElement)) throw new Error('Expected an HTML close button');
    closeButton.click();
    flushSync();
    await frame();
    const retiredExit = animations();
    expect(retiredExit.length).toBeGreaterThan(0);
    retiredExit.forEach((animation) => animation.pause());

    // The trigger is behind the exiting layer, so use the browser's native click
    // on the real public control rather than bypassing the application with a store.
    const triggerElement = trigger.elements()[0];
    if (!(triggerElement instanceof HTMLElement)) throw new Error('Expected an HTML open button');
    triggerElement.click();
    flushSync();
    await frame();
    const replacementAnimations = animations().filter((animation) => !retiredExit.includes(animation));
    expect(replacementAnimations.length).toBeGreaterThan(0);

    retiredExit.forEach((animation) => animation.finish());
    await frame();
    // The old captured owner's completion cannot clear the replacement.
    await expect.element(page.getByRole('dialog')).toBeVisible();
    replacementAnimations.forEach((animation) => animation.finish());
    await expect.element(page.getByRole('dialog')).toBeVisible();
  },
);
