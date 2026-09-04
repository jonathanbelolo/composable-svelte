/**
 * Eleven NodeCanvas props were frozen at mount.
 *
 * `NodeCanvas.svelte` did `const props = $props()` and then a SECOND
 * destructure into a plain `const`. Destructuring a variable rather than the
 * `$props()` call site reads each name exactly once, at init — so
 * `nodeTypes`, `edgeTypes`, `connectionLineType`, `panOnDrag`, `zoomOnScroll`,
 * `selectable`, `class`, `minZoom`, `maxZoom`, `fitView` and
 * `onViewportChange` all ignored every later change.
 *
 * `class` is the one asserted here because it is observable in plain DOM
 * without reaching into SvelteFlow's internals, and it travels the same
 * destructure as the other ten — a fix that misses it misses all of them.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import NodeCanvasPropsTest from './test-components/NodeCanvasPropsTest.svelte';

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

describe('NodeCanvas props', () => {
	it('follow changes made after mount', async () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(NodeCanvasPropsTest, { target, props: {} });
		cleanup.push(() => {
			unmount(component);
			target.remove();
		});
		await settle(300);

		const canvas = () => target.querySelector('.node-canvas');
		expect(canvas(), 'NodeCanvas did not render').not.toBeNull();
		expect(canvas()!.className, 'precondition').toContain('first');

		target.querySelector<HTMLButtonElement>('[data-testid="change-props"]')!.click();
		flushSync();
		await settle(300);

		expect(
			canvas()!.className,
			'the prop changed but the component kept its mount-time value — it was destructured off a plain variable, not off $props()'
		).toContain('second');
		expect(canvas()!.className).not.toContain('first');
	});
});
