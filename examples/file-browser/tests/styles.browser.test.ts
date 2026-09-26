import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import { tick, unmount } from 'svelte';
import App from '../src/App.svelte';

// Load styling through the actual application entry; importing CSS directly in
// this test would conceal a missing main.ts stylesheet import.
beforeAll(async () => {
  const target = document.createElement('div');
  target.id = 'app';
  document.body.append(target);
  const app = await import('../src/main');
  await tick();
  await unmount(app.default);
  target.remove();
});
afterAll(() => document.querySelector('#app')?.remove());
function item(container: HTMLElement, label: string): HTMLElement {
  const found = [...container.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(node => node.textContent?.includes(label));
  expect(found, `tree item ${label}`).toBeDefined();
  return found!;
}
function toggle(node: HTMLElement): HTMLButtonElement {
  const found = node.querySelector<HTMLButtonElement>('button[aria-label="Expand"],button[aria-label="Collapse"]');
  expect(found).not.toBeNull();
  return found!;
}
function rotation(node: Element): DOMMatrixReadOnly {
  const transform = getComputedStyle(node).transform;
  return new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
}

describe('file-browser application stylesheet', () => {
  test('framework chevrons have native rotation through the published content glob', async () => {
    const { container } = render(App);
    await tick();
    const root = toggle(item(container, 'My Documents'));
    expect(root.getAttribute('aria-label')).toBe('Collapse');
    expect(rotation(root).a).toBeCloseTo(0);
    expect(rotation(root).b).toBeCloseTo(1);
    const projects = toggle(item(container, 'Projects'));
    expect(rotation(projects).a).toBeCloseTo(1);
    await userEvent.click(projects);
    await expect.poll(() => projects.getAttribute('aria-label')).toBe('Collapse');
    expect(rotation(projects).b).toBeCloseTo(1);
    await userEvent.click(projects);
    await expect.poll(() => projects.getAttribute('aria-label')).toBe('Expand');
    expect(rotation(projects).a).toBeCloseTo(1);
    expect(rotation(projects).b).toBeCloseTo(0);
  });
  test('keyboard highlight resolves theme colors and selection resolves font weight', async () => {
    const { container } = render(App);
    await tick();
    const tree = container.querySelector<HTMLElement>('[role="tree"]')!;
    // Park the native pointer outside the tree so hover does not supersede keyboard highlight.
    await userEvent.hover(container.querySelector('h1')!);
    tree.focus();
    await userEvent.keyboard('{Home}');
    const root = item(container, 'My Documents');
    await expect.poll(() => root.getAttribute('tabindex')).toBe('0');
    expect(root.classList.contains('bg-accent')).toBe(true);
    const color = getComputedStyle(root).backgroundColor;
    expect(color).not.toBe('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(root).getPropertyValue('--accent').trim()).not.toBe('');
    const photos = item(container, 'Photos');
    await userEvent.click(photos);
    await expect.poll(() => photos.getAttribute('aria-selected')).toBe('true');
    expect(getComputedStyle(photos).fontWeight).toBe('500');
    expect(container.querySelector('.detail-item .value')?.textContent).toContain('Photos');
  });
  test('the real lazy-loading spinner receives a running native CSS animation', async () => {
    const { container } = render(App);
    await tick();
    await userEvent.click(toggle(item(container, 'Projects')));
    const lazy = toggle(item(container, 'composable-svelte'));
    await userEvent.click(lazy);
    await expect.poll(() => lazy.querySelector('[role="status"]')).not.toBeNull();
    const spinner = lazy.querySelector<SVGElement>('[role="status"]')!;
    expect(getComputedStyle(spinner).animationName).toBe('spin');
    expect(getComputedStyle(spinner).width).toBe('12px');
    expect(spinner.getAnimations().some(animation => animation.playState === 'running')).toBe(true);
    await expect.poll(() => container.textContent, { timeout: 3000 }).toContain('README.md');
    expect(lazy.querySelector('[role="status"]')).toBeNull();
  });
});
