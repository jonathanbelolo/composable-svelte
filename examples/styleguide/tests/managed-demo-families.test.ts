import { expect, it, onTestFinished, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { Component } from 'svelte';
import AlertDemo from '../src/lib/components/demos/AlertDemo.svelte';
import AlertDialogDemo from '../src/lib/components/demos/AlertDialogDemo.svelte';
import AudioPlayerDemo from '../src/lib/components/demos/AudioPlayerDemo.svelte';
import NavigationStackDemo from '../src/lib/components/demos/NavigationStackDemo.svelte';
import SidebarDemo from '../src/lib/components/demos/SidebarDemo.svelte';

const mount = (Component: Component) => {
  const view = render(Component);
  onTestFinished(() => view.unmount());
  return view;
};

const waitForAnimations = async () => {
  await expect.poll(() => document.getAnimations().filter(animation => animation.playState === 'running').length).toBe(0);
};

it('dismisses the alert through its managed presentation view', async () => {
  mount(AlertDemo);
  await page.getByRole('button', { name: 'Confirm Alert', exact: true }).click();
  await expect.element(page.getByRole('alertdialog')).toBeVisible();
  await waitForAnimations();
  await userEvent.keyboard('{Escape}');
  await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).toBeNull(), { timeout: 3000 });
});

it('retires and recreates the managed sidebar view', async () => {
  mount(SidebarDemo);
  const sidebar = page.getByRole('navigation', { name: 'Sidebar navigation', exact: true });
  await expect.element(sidebar).toBeVisible();
  await page.getByRole('button', { name: 'Close sidebar', exact: true }).click();
  await vi.waitFor(() => expect(document.querySelector('[aria-label="Sidebar navigation"]')).toBeNull(), { timeout: 3000 });
  await page.getByRole('button', { name: 'Show Sidebar', exact: true }).click();
  await expect.element(sidebar).toBeVisible();
});

it('routes alert-dialog cancellation through the owning application', async () => {
  mount(AlertDialogDemo);
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect.element(page.getByRole('alertdialog')).toBeVisible();
  await waitForAnimations();
  const keep = page.getByRole('button', { name: 'Keep it', exact: true }).elements()[0];
  if (!(keep instanceof HTMLElement)) throw new Error('Expected an HTML cancel button');
  keep.click();
  await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).toBeNull(), { timeout: 3000 });
  await expect.element(page.getByRole('status')).toHaveTextContent('Kept.');
});

it('binds both navigation-stack examples to managed child views', async () => {
  mount(NavigationStackDemo);
  const profileButtons = page.getByRole('button', { name: 'Profile →', exact: true }).elements();
  expect(profileButtons).toHaveLength(2);
  const first = profileButtons[0];
  if (!(first instanceof HTMLElement)) throw new Error('Expected an HTML navigation button');
  first.click();
  await vi.waitFor(() => expect(page.getByText('Profile', { exact: true }).elements().length).toBeGreaterThan(0));

  const second = profileButtons[1];
  if (!(second instanceof HTMLElement)) throw new Error('Expected an HTML navigation button');
  second.click();
  await vi.waitFor(() => expect(page.getByText('Animation: presenting', { exact: true }).elements().length).toBeGreaterThan(0));
});

it('uses a managed presentation view for the expanded audio player', async () => {
  mount(AudioPlayerDemo);
  await page.getByRole('button', { name: 'Full Player', exact: true }).click();
  await page.getByRole('button', { name: 'Expand', exact: true }).click();
  await expect.element(page.getByRole('dialog')).toBeVisible();
  await userEvent.keyboard('{Escape}');
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
});
