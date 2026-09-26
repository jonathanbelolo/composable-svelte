import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import DataTransformsDemo from '../src/lib/components/demos/DataTransformsDemo.svelte';
import EmailVerificationDemo from '../src/lib/components/demos/EmailVerificationDemo.svelte';
import NodeCanvasDemo from './fixtures/TransformCanvas.svelte';
import Header from '../src/lib/components/layout/Header.svelte';
import TabsDemo from '../src/lib/components/demos/TabsDemo.svelte';
import { COMPONENT_REGISTRY } from '../src/lib/data/component-registry';

describe('styleguide content contracts', () => {
  it('catalog includes the implemented command demo exactly once', () => {
    expect(COMPONENT_REGISTRY.filter(component => component.id === 'command')).toHaveLength(1);
  });

  it('header exposes an actual home intent', async () => {
    const home = vi.fn();
    const view = render(Header, { theme: 'light', onThemeToggle: () => {}, onHome: home });
    await page.getByRole('button', { name: 'CS Component Showcase' }).click();
    expect(home).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it('each tab owns the visible content it names and keyboard focus remains local', async () => {
    const view = render(TabsDemo);
    const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(new Set(tabs.map(tab => tab.id)).size).toBe(tabs.length);
    const overview = page.getByRole('tab', { name: 'Overview', exact: true });
    await expect.element(overview).toBeVisible();
    const overviewNode = tabs.find(tab => tab.textContent?.trim() === 'Overview')!;
    const panel = document.getElementById(overviewNode.getAttribute('aria-controls')!);
    expect(panel?.textContent).toContain('Welcome to the overview section');
    const account = page.getByRole('tab', { name: 'Account', exact: true });
    await account.click();
    await userEvent.keyboard('{ArrowRight}');
    await expect.element(page.getByRole('tab', { name: 'Security', exact: true })).toHaveFocus();
    await view.unmount();
  });
});


describe('data and scenario controls', () => {
  it('selects top records then honors selected display order including reset', async () => {
    const view = render(DataTransformsDemo);
    const monthLabels = () => [...document.querySelectorAll('svg text')].map(node => node.textContent).filter(text => ['May', 'Jul', 'Dec'].includes(text ?? ''));
    await page.getByRole('button', { name: 'Top 3', exact: true }).click();
    await expect.poll(monthLabels).toEqual(['May', 'Dec', 'Jul']);
    await page.getByRole('button', { name: /Sort:/ }).click();
    await expect.poll(monthLabels).toEqual(['Jul', 'Dec', 'May']);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect.poll(monthLabels).toEqual(['May', 'Dec', 'Jul']);
    await view.unmount();
  });

  it('switching away from a signed-in scenario starts a fresh unauthenticated session', async () => {
    const view = render(EmailVerificationDemo);
    await page.getByRole('button', { name: 'Link works, signs in', exact: true }).click();
    await expect.poll(() => document.querySelector('.grid code')?.textContent).toBe('authenticated');
    await page.getByRole('button', { name: 'Link works', exact: true }).click();
    await expect.poll(() => document.querySelector('.grid code')?.textContent).toBe('anonymous');
    await view.unmount();
  });
});

it('transform operation is named in the actual node-canvas context', async () => {
  const view = render(NodeCanvasDemo);
  await expect.element(page.getByRole('combobox', { name: 'Transform operation', exact: true })).toBeVisible();
  await view.unmount();
});
