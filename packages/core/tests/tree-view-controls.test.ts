/**
 * `expandAll`, `collapseAll` and `allNodesDeselected` had no dispatcher.
 *
 * All three are implemented in the reducer and covered by TestStore tests, and
 * no component, example or snippet anywhere in the repo sends any of them. A
 * consumer could not send them either: `TreeView` owns its store privately and
 * exposes no handle to it.
 *
 * A `store` prop is not the fix. The state is `Set<string>` (`expandedIds`,
 * `selectedIds`, `loadingIds`), which is not JSON-serialisable, so hoisting it
 * into a consumer's store would break SSR hydration. A `controls` snippet keeps
 * the state where it is and hands out the three operations.
 *
 * The counts are part of the payload because without them a toolbar cannot be
 * correct — "Deselect all" would sit enabled with nothing selected, which is a
 * smaller version of the same defect.
 *
 * Assertions are on the rendered tree (`aria-expanded`, `aria-selected`), not on
 * the store. The reducer was never the broken part.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TreeViewControlsTest from './test-components/TreeViewControlsTest.svelte';

const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mount() {
	const screen = render(TreeViewControlsTest);
	cleanup.push(() => screen.unmount());
	const root = screen.container;
	const q = (sel: string) => [...root.querySelectorAll(sel)];
	return {
		root,
		click: (testid: string) =>
			root.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!.click(),
		text: (testid: string) => root.querySelector(`[data-testid="${testid}"]`)!.textContent!.trim(),
		/** Labels of every rendered item — children only exist in the DOM once open. */
		visible: () =>
			q('[role="treeitem"]').map((el) => el.textContent!.trim().split('\n')[0]!.trim()),
		expanded: () => q('[role="treeitem"][aria-expanded="true"]').length,
		selected: () => q('[role="treeitem"][aria-selected="true"]').length,
		item: (label: string) =>
			q('[role="treeitem"]').find((el) => el.textContent!.includes(label)) as HTMLElement
	};
}

describe('the controls snippet', () => {
	it('renders, so the bulk operations are reachable at all', () => {
		const tree = mount();
		expect(
			tree.root.querySelector('[data-testid="expand-all"]'),
			'no controls snippet is rendered — the bulk actions have no dispatcher'
		).not.toBeNull();
	});

	it('expandAll opens every branch', async () => {
		const tree = mount();
		expect(tree.expanded(), 'precondition: everything starts collapsed').toBe(0);

		tree.click('expand-all');
		await settle();

		// `lib` is nested inside `src`, so it only renders once its parent is open —
		// three expanded branches proves the recursion, not just the roots.
		expect(tree.expanded()).toBe(3);
		expect(tree.visible()).toContain('util.ts');
	});

	it('collapseAll closes them again', async () => {
		const tree = mount();
		tree.click('expand-all');
		await settle();
		tree.click('collapse-all');
		await settle();

		expect(tree.expanded()).toBe(0);
		expect(tree.visible()).not.toContain('util.ts');
	});

	it('deselectAll clears a multi-selection', async () => {
		const tree = mount();
		tree.click('expand-all');
		await settle();

		tree.item('app.ts').click();
		tree.item('README.md').click();
		await settle();
		expect(tree.selected(), 'precondition: two nodes selected').toBe(2);

		tree.click('deselect-all');
		await settle();
		expect(tree.selected()).toBe(0);
	});

	it('reports counts that track the tree', async () => {
		const tree = mount();
		expect(tree.text('expanded-count')).toBe('0');
		expect(tree.text('selected-count')).toBe('0');

		tree.click('expand-all');
		await settle();
		expect(tree.text('expanded-count')).toBe('3');

		tree.item('app.ts').click();
		await settle();
		expect(tree.text('selected-count')).toBe('1');
	});

	it('disables deselect-all when nothing is selected', async () => {
		// The reason the counts are in the payload: a toolbar that cannot see the
		// selection renders a button that does nothing.
		const tree = mount();
		const button = tree.root.querySelector<HTMLButtonElement>('[data-testid="deselect-all"]')!;
		expect(button.disabled).toBe(true);

		tree.click('expand-all');
		await settle();
		tree.item('app.ts').click();
		await settle();

		expect(button.disabled).toBe(false);
	});
});
