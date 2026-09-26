import { expect, it, onTestFinished } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import ModalDemo from '../src/lib/components/demos/ModalDemo.svelte';
import TabsDemo from '../src/lib/components/demos/TabsDemo.svelte';

const waitForAnimations = async () => {
  await expect.poll(() => document.getAnimations().filter(animation => animation.playState === 'running').length).toBe(0);
};

it('runs the modal demo through a managed presentation view', async () => {
  const view = render(ModalDemo);
  onTestFinished(() => view.unmount());
  const open = page.getByRole('button', { name: 'Open Modal', exact: true });
  await open.click();
  await expect.element(page.getByRole('dialog')).toBeVisible();
  await waitForAnimations();
  await userEvent.keyboard('{Escape}');
  await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();

  await open.click();
  await expect.element(page.getByRole('dialog')).toBeVisible();
  await waitForAnimations();
  const backdrop = document.querySelector<HTMLElement>('[aria-hidden="true"]');
  expect(backdrop).not.toBeNull();
  backdrop!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, button: 0 }));
  await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
});

it('runs the basic tabs example through a managed child view', async () => {
  const view = render(TabsDemo);
  onTestFinished(() => view.unmount());
  const overview = page.getByRole('tab', { name: 'Overview', exact: true });
  await overview.click();
  await userEvent.keyboard('{ArrowRight}');
  await expect.element(page.getByRole('tab', { name: 'Details', exact: true })).toHaveFocus();
  await expect.element(page.getByText('Here you can find detailed information')).toBeVisible();
});
