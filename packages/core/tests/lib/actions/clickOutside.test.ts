/**
 * Regression tests for the dismissable-layer stack.
 *
 * Overlays render through a portal, so a nested overlay is not a DOM descendant
 * of its parent. The action used to test only `node.contains(target)`, which
 * meant a click inside a nested overlay looked "outside" to the parent — so
 * dismissing a confirmation alert also dismissed the modal underneath it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clickOutside } from '../../../src/lib/actions/clickOutside';

/** Fire a real pointerdown, which is what the action listens for. */
function pointerDownOn(target: Element) {
	target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
}

/** The action defers its handler by a tick to avoid clashing with `click`. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 1));

describe('clickOutside', () => {
	let created: Array<{ node: HTMLElement; destroy: () => void }> = [];

	function mountLayer(enabled?: () => boolean): {
		node: HTMLElement;
		handler: ReturnType<typeof vi.fn>;
		destroy: () => void;
	} {
		const node = document.createElement('div');
		document.body.appendChild(node);
		const handler = vi.fn();
		const action = enabled
			? clickOutside(node, { handler, enabled })
			: clickOutside(node, handler);
		const entry = { node, destroy: action.destroy };
		created.push(entry);
		return { node, handler, destroy: action.destroy };
	}

	beforeEach(() => {
		created = [];
	});

	afterEach(() => {
		for (const { node, destroy } of created) {
			destroy();
			node.remove();
		}
		document.body.innerHTML = '';
	});

	it('fires for a click outside the node', async () => {
		const { handler } = mountLayer();
		const outside = document.createElement('button');
		document.body.appendChild(outside);

		pointerDownOn(outside);
		await flush();

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('does not fire for a click inside the node', async () => {
		const { node, handler } = mountLayer();
		const inside = document.createElement('button');
		node.appendChild(inside);

		pointerDownOn(inside);
		await flush();

		expect(handler).not.toHaveBeenCalled();
	});

	it('ignores non-primary buttons', async () => {
		const { handler } = mountLayer();
		const outside = document.createElement('button');
		document.body.appendChild(outside);

		outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2 }));
		await flush();

		expect(handler).not.toHaveBeenCalled();
	});

	it('only the topmost layer reacts', async () => {
		// This is the regression: clicking inside a nested overlay used to dismiss
		// its parent, because the parent is not a DOM ancestor of a portalled child.
		const parent = mountLayer();
		const child = mountLayer();

		const insideChild = document.createElement('button');
		child.node.appendChild(insideChild);

		pointerDownOn(insideChild);
		await flush();

		expect(parent.handler).not.toHaveBeenCalled();
		expect(child.handler).not.toHaveBeenCalled();
	});

	it('a click on a lower layer still dismisses the topmost one', async () => {
		// A dropdown open inside a modal must close when the modal body is
		// clicked — the modal is "outside" the dropdown even though it is below it.
		const modal = mountLayer();
		const dropdown = mountLayer();

		const insideModal = document.createElement('button');
		modal.node.appendChild(insideModal);

		pointerDownOn(insideModal);
		await flush();

		expect(dropdown.handler).toHaveBeenCalledTimes(1);
		expect(modal.handler).not.toHaveBeenCalled();
	});

	it('hands control back to the parent once the child unmounts', async () => {
		const parent = mountLayer();
		const child = mountLayer();
		child.destroy();
		child.node.remove();

		const outside = document.createElement('button');
		document.body.appendChild(outside);

		pointerDownOn(outside);
		await flush();

		expect(parent.handler).toHaveBeenCalledTimes(1);
	});

	it('stops listening after destroy', async () => {
		const { handler, destroy } = mountLayer();
		destroy();

		const outside = document.createElement('button');
		document.body.appendChild(outside);

		pointerDownOn(outside);
		await flush();

		expect(handler).not.toHaveBeenCalled();
	});

	it('an opted-out layer neither dismisses nor blocks the layers below it', async () => {
		// Sheet/Drawer/Popover apply the action unconditionally, so an overlay
		// configured with `disableClickOutside` would otherwise sit on top of the
		// stack forever and silence everything beneath it.
		const modal = mountLayer();
		const optedOut = mountLayer(() => false);

		const outside = document.createElement('button');
		document.body.appendChild(outside);

		pointerDownOn(outside);
		await flush();

		expect(optedOut.handler).not.toHaveBeenCalled();
		expect(modal.handler).toHaveBeenCalledTimes(1);
	});

	it('does not leak layers across mount/unmount cycles', async () => {
		// A leaked entry would sit permanently on top and silence every layer
		// mounted after it.
		for (let i = 0; i < 3; i++) {
			const layer = mountLayer();
			layer.destroy();
			layer.node.remove();
		}

		const survivor = mountLayer();
		const outside = document.createElement('button');
		document.body.appendChild(outside);

		pointerDownOn(outside);
		await flush();

		expect(survivor.handler).toHaveBeenCalledTimes(1);
	});
});
