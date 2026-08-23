/**
 * Interrupting a Motion One animation hangs its promise forever — and our
 * components survive it. This file pins both halves, because the second depends
 * on the first staying true.
 *
 * **The mechanism**, verified in the installed `motion@12.23.24` source:
 * `motion-dom`'s `WithPromise` builds `new Promise((resolve) => …)` and captures
 * **no `reject`**. `notifyFinished()` is called only from `JSAnimation.finish()`;
 * `cancel()` and `stop()` go straight to `teardown()`. And `MotionValue.start()`
 * calls `this.stop()` on the previous animation before starting a new one. So a
 * superseded animation's promise neither resolves nor rejects — it is pending
 * for the life of the page, and every `try/catch` in `animate.ts` is dead code
 * for that path, because there is nothing to catch.
 *
 * **Why that is currently harmless**, which is the part worth protecting: the
 * `(status, content)` guard means a new animation only starts when the status
 * has actually changed, so the *live* promise always corresponds to the *live*
 * status. A hung promise is therefore always a superseded one — and its dispatch
 * would have been rejected by the reducer's own `status !==` guard anyway. The
 * safety is structural, not luck.
 *
 * It stops being true the moment two effects animate the same element, or an
 * element is re-keyed mid-flight. Then the live status has no live promise and
 * the lifecycle sticks, with the reducer refusing every later transition. That
 * is when a timeout fallback becomes necessary — see the completion section of
 * `guides/ANIMATION-GUIDELINES.md`. It is deliberately *not* added here, because
 * a fallback with no reachable trigger is the dead behaviour this campaign
 * removes.
 *
 * Written after reasoning my way to the opposite conclusion. I claimed the
 * deadlock was reachable and planned fallbacks for it; probing the actual
 * components showed they recover every time.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import {
	animateDropdownIn,
	animateDropdownOut,
	animateAccordionExpand,
	animateAccordionCollapse
} from '../src/lib/animation/animate.js';
import Select from '../src/lib/components/ui/select/Select.svelte';
import CollapsibleAnimationTest from './test-components/CollapsibleAnimationTest.svelte';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function scratch(html = ''): HTMLElement {
	const el = document.createElement('div');
	el.innerHTML = html;
	document.body.appendChild(el);
	cleanup.push(() => el.remove());
	return el;
}

describe('the dependency: an interrupted animation never settles', () => {
	it('holds for the WAAPI path (opacity/transform)', async () => {
		const el = scratch();
		let settled = false;
		animateDropdownIn(el).then(() => {
			settled = true;
		});
		await wait(30);
		animateDropdownOut(el); // supersedes the first
		await wait(900);

		expect(
			settled,
			'motion resolved a superseded animation — the assumption behind the ' +
				'(status, content) guard has changed; re-check whether fallbacks are needed'
		).toBe(false);
	});

	it('holds for the JS-ticker path (height)', async () => {
		const el = scratch('<p style="height:80px">content</p>');
		let settled = false;
		animateAccordionExpand(el).then(() => {
			settled = true;
		});
		await wait(30);
		animateAccordionCollapse(el);
		await wait(900);

		expect(settled).toBe(false);
	});

	it('control: an uninterrupted animation does settle', async () => {
		// Without this, the two assertions above pass against a helper that never
		// resolves at all.
		const el = scratch();
		let settled = false;
		animateDropdownIn(el).then(() => {
			settled = true;
		});
		await wait(900);

		expect(settled, 'the helper never resolves even undisturbed').toBe(true);
	});
});

describe('the components survive it anyway', () => {
	const options = [
		{ value: 'a', label: 'Alpha' },
		{ value: 'b', label: 'Beta' }
	];

	function mountSelect() {
		const screen = render(Select, { options });
		cleanup.push(() => screen.unmount());
		const root = screen.container;
		return {
			trigger: () => root.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!,
			list: () => root.querySelector<HTMLElement>('[role="listbox"]')
		};
	}

	it('Select still responds after being toggled mid-animation', async () => {
		const s = mountSelect();
		// Interleavings either side of the ~200ms dropdown spring.
		for (const gap of [0, 5, 30, 80, 150]) {
			s.trigger().click();
			await wait(gap);
			s.trigger().click();
			await wait(gap);
		}
		await wait(900);

		const settled = s.list() !== null;
		s.trigger().click();
		await wait(700);

		expect(
			s.list() !== null,
			`stuck: settled ${settled ? 'open' : 'closed'} and a further click changed nothing`
		).toBe(!settled);
	});

	it('Select is never left invisible-but-open', async () => {
		// The specific shape a stuck `presenting` would take: `style:opacity` gates
		// on that status, so a lifecycle stuck there renders a listbox at opacity 0
		// — present in the a11y tree, invisible on screen.
		const s = mountSelect();
		s.trigger().click();
		s.trigger().click();
		s.trigger().click();
		await wait(900);

		const list = s.list();
		if (list) {
			expect(Number.parseFloat(getComputedStyle(list).opacity)).toBe(1);
		}
	});

	it('Collapsible unmounts its content after interrupted collapses', async () => {
		const screen = render(CollapsibleAnimationTest);
		cleanup.push(() => screen.unmount());
		const root = screen.container;
		const toggle = () => root.querySelector('button')!;
		const region = () => root.querySelector<HTMLElement>('[id^="collapsible-content-"]')!;

		for (const gap of [0, 20, 60, 120]) {
			toggle().click();
			await wait(gap);
			toggle().click();
			await wait(gap);
		}
		await wait(900);

		// A hung collapse promise would leave `renderContent` true forever.
		expect(region().children.length, 'content left mounted inside a collapsed box').toBe(0);
	});
});
