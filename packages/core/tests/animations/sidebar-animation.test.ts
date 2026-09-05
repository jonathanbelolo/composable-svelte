/**
 * Sidebar animation lifecycle.
 *
 * There was no Sidebar entry in `tests/animations/` at all, and
 * `tests/navigation-components/Sidebar.test.ts` never passes a `presentation`
 * prop — so `springConfig`, `onPresentationComplete` and `onDismissalComplete`
 * were all untested. That is how `springConfig` came to be destructured and
 * never referenced, and how a CSS width transition stood in for Motion One
 * despite CLAUDE.md listing lifecycle animation under Motion One REQUIRED.
 *
 * The `springConfig` test below is the only one that proves the prop is live at
 * all: it compares a fast config against the default preset and asserts the
 * fast one settles sooner. A relative comparison, never an absolute duration.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SidebarTest from './test-components/SidebarTest.svelte';
import type { SpringConfig } from '../../src/lib/animation/spring-config.js';
import { assertMotionAllowed, midFlight, settleValue, waitUntil } from '../../src/lib/test/animation.js';

// `margin-left` runs on Motion's ticker: the mid-flight sample polls for a
// margin between the endpoints rather than six reads at 30 ms (R1-REVIEW 2.1).
beforeAll(() => assertMotionAllowed());

function waitForState<State>(
	store: { subscribe: (listener: (state: State) => void) => () => void },
	condition: (state: State) => boolean,
	options: { timeout?: number; description?: string } = {}
): Promise<State> {
	const { timeout = 3000, description = 'state condition' } = options;
	return new Promise((resolve, reject) => {
		let unsubscribe: (() => void) | null = null;
		const timeoutId = setTimeout(() => {
			unsubscribe?.();
			reject(new Error(`Timeout waiting for ${description} after ${timeout}ms`));
		}, timeout);
		unsubscribe = store.subscribe((state) => {
			if (condition(state)) {
				clearTimeout(timeoutId);
				unsubscribe?.();
				resolve(state);
			}
		});
	});
}

const store = () => (window as any).__sidebarTestStore;

describe('Sidebar animation lifecycle', () => {
	it('reaches presented, so the completion callback fires', async () => {
		const { container } = render(SidebarTest);
		container.querySelector<HTMLButtonElement>('[data-testid="open-sidebar"]')!.click();

		await waitForState(
			store(),
			(s: any) => s.presentation.status === 'presented',
			{ description: 'presented' }
		);

		expect(container.querySelector('[data-testid="presentation-status"]')!.textContent).toBe(
			'presented'
		);
	});

	it('slides in on margin, and never animates width', async () => {
		// The distinguishing assertion, and it is a *pair*. `animateSidebarExpand`
		// travels `margin-left` from `-width` to `0` at a constant width; the CSS
		// `transition-[width]` this replaced did the exact opposite. So sampling
		// mid-flight separates them in both directions.
		//
		// Not `document.getAnimations()`: measured, it returns 0 throughout, because
		// Motion One drives a spring on a non-composited property with its own JS
		// ticker rather than the Web Animations API. That assertion failed against a
		// working implementation.
		const { container } = render(SidebarTest);
		const wrapper = () => container.querySelector('[data-sidebar-wrapper]') as HTMLElement | null;
		const marginLeft = () => Number.parseFloat(getComputedStyle(wrapper()!).marginLeft);
		container.querySelector<HTMLButtonElement>('[data-testid="open-sidebar"]')!.click();
		await waitUntil(wrapper, (w) => w !== null, { what: 'the sidebar wrapper to mount' });

		const mid = await midFlight(marginLeft, { from: -240, to: 0, what: 'margin-left' });
		expect(mid, 'margin-left never travelled').toBeLessThan(0);
		expect(getComputedStyle(wrapper()!).width, 'width animated — that is the CSS transition, not Motion One').toBe('240px');

		await settleValue(marginLeft, { what: 'margin-left' });
		expect(getComputedStyle(wrapper()!).width).toBe('240px');
	});

	it('stays mounted while dismissing, then unmounts', async () => {
		const { container } = render(SidebarTest);
		container.querySelector<HTMLButtonElement>('[data-testid="open-sidebar"]')!.click();
		await waitForState(store(), (s: any) => s.presentation.status === 'presented', {
			description: 'presented'
		});

		store().dispatch({ type: 'dismissSidebar' });
		await waitUntil(
			() => container.querySelector('[data-testid="presentation-status"]')!.textContent,
			(t) => t === 'dismissing',
			{ what: 'the sidebar to be animating out, not gone' }
		);

		await waitForState(store(), (s: any) => s.presentation.status === 'idle', {
			description: 'idle'
		});
		expect(store().state.sidebarContent).toBeNull();
	});

	it('dismisses a sidebar that mounted already presented', async () => {
		// The persistent-desktop-sidebar case, and the one an open-then-close test
		// cannot reach: nothing ever animated *in*, so a guard keyed on "have I
		// animated something" refuses the collapse, `onDismissalComplete` never
		// fires, and the sidebar is stuck in `dismissing` forever.
		const { container } = render(SidebarTest, { startOpen: true });
		expect(store().state.presentation.status, 'precondition').toBe('presented');

		store().dispatch({ type: 'dismissSidebar' });

		await waitForState(store(), (s: any) => s.presentation.status === 'idle', {
			description: 'idle after dismissing a sidebar that mounted open'
		});
		expect(container.querySelector('[data-testid="sidebar-content"]')).toBeNull();
	});

	it('honours springConfig', async () => {
		// The ONLY test that proves `springConfig` is wired. It was destructured
		// and never referenced, so every value behaved identically.
		const timeTo = async (springConfig: Partial<SpringConfig> | undefined) => {
			const { container } = render(SidebarTest, { springConfig });
			const started = performance.now();
			container.querySelector<HTMLButtonElement>('[data-testid="open-sidebar"]')!.click();
			await waitForState(store(), (s: any) => s.presentation.status === 'presented', {
				description: 'presented'
			});
			return performance.now() - started;
		};

		const fast = await timeTo({ visualDuration: 0.05, bounce: 0 });
		const dflt = await timeTo(undefined);

		// Half, not merely "less than". Measured with `springConfig` deliberately
		// dropped: 613ms vs 615ms — a bare `<` passed on 2ms of scheduling noise, so
		// the vacuous version of this test scored green. Live, it is 110ms vs 615ms.
		expect(
			fast,
			`springConfig had no effect (fast=${Math.round(fast)}ms, default=${Math.round(dflt)}ms)`
		).toBeLessThan(dflt / 2);
	});
});
