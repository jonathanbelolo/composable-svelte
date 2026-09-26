import { it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import TreeView from '../src/lib/components/ui/tree-view/TreeView.svelte';
import { createStore } from '../src/lib/store.svelte.js';
import type { TreeNode } from '../src/lib/components/ui/tree-view/tree-view.types.js';

vi.mock('../src/lib/store.svelte.js', { spy: true });

it('loads a lazy node through actual keyboard events and exposes its first child', async () => {
  let finish!: (nodes: TreeNode[]) => void;
  const loadChildren = vi.fn(() => new Promise<TreeNode[]>(resolve => {finish = resolve;}));
  const screen = render(TreeView, { nodes: [{id:'remote',label:'Remote',lazy:true}], loadChildren });
  try {
    const tree = screen.container.querySelector('[role=tree]')!;
    tree.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));
    await tick();
    tree.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    await vi.waitFor(() => expect(loadChildren).toHaveBeenCalledTimes(1));
    expect(screen.container.querySelector('[role=treeitem]')?.getAttribute('aria-expanded')).toBe('true');
    finish([{id:'loaded',label:'Loaded child'}]);
    await vi.waitFor(() => expect(screen.container.querySelectorAll('[role=treeitem]')).toHaveLength(2));
    tree.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    await tick();
    expect(screen.container.querySelector('[role=treeitem][tabindex="0"]')?.textContent).toContain('Loaded child');
    await screen.rerender({ nodes: [{id:'replacement',label:'Replacement prop'}] });
    await vi.waitFor(() => expect(screen.container.querySelectorAll('[role=treeitem]')).toHaveLength(1));
    expect(screen.container.textContent).toContain('Replacement prop');
  } finally { finish?.([]); screen.unmount(); }
});

it('destroys the real store owned by the component on unmount', () => {
  const screen = render(TreeView, {nodes:[{id:'leaf',label:'Leaf'}]});
  const store = vi.mocked(createStore).mock.results.at(-1)?.value;
  expect(store).toBeDefined();
  const destroy = vi.spyOn(store!, 'destroy');
  screen.unmount();
  try { expect(destroy).toHaveBeenCalledTimes(1); }
  finally { store!.destroy(); destroy.mockRestore(); }
});
