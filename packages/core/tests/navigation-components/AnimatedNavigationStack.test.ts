/**
 * `AnimatedNavigationStack` had no coverage at all.
 *
 * These tests drive the presentation lifecycle and assert what the component is
 * supposed to render at each stage. The one that matters is the outgoing-layer
 * test: `previousScreen` was destructured from `NavigationStackPrimitive`, which
 * never supplied it, so the previous-screen layer rendered nothing and stayed
 * `visibility: hidden` through every push and pop. svelte-check caught the type
 * error; nothing caught the behaviour.
 *
 * They also fail on `effect_update_depth_exceeded`, which is the hazard behind
 * holding the animation guards (`lastAnimatedPresentationKey`,
 * `animationPromiseCompleted`) in plain `let` rather than `$state`. Note that
 * reverting those guards to `$state` does *not* currently fail these tests —
 * every write in that effect happens to be idempotent, so the effect converges.
 * Keeping them non-reactive is still right (they are not state, and making them
 * reactive costs an extra effect pass), but the assertion is a guard against a
 * future non-converging write, not a reproduction of a present bug.
 */

import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import AnimatedNavigationStack from '../../src/lib/navigation-components/AnimatedNavigationStack.svelte';
import AnimatedStackTest from './test-components/AnimatedStackTest.svelte';
import { createStore } from '../../src/lib/store.svelte.js';
import { scopeToDestination } from '../../src/lib/navigation/scope-to-destination.js';
import { Effect } from '../../src/lib/effect.js';

interface ScreenState {
	id: string;
	title: string;
}

interface ParentState {
	destination: { type: 'test'; state: { stack: ScreenState[] } } | null;
}

type ParentAction = { type: 'destination'; action: unknown };

function makeScopedStore(stack: ScreenState[]) {
	const parentStore = createStore<ParentState, ParentAction>({
		initialState: { destination: { type: 'test', state: { stack } } },
		reducer: (state) => [state, Effect.none()]
	});
	return scopeToDestination(parentStore, ['destination'], 'test', 'destination');
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

describe('AnimatedNavigationStack', () => {
	it('renders the stack when idle', async () => {
		const stack = [{ id: '1', title: 'Screen 1' }];
		render(AnimatedNavigationStack, {
				store: makeScopedStore(stack),
				stack,
				presentation: { status: 'idle' as const },
				onBack: () => {}
			});

		await expect.element(page.getByRole('navigation')).toBeInTheDocument();
	});

	it('renders nothing when the store is null', async () => {
		render(AnimatedNavigationStack, {
				store: null,
				stack: [],
				presentation: { status: 'idle' as const },
				onBack: () => {}
			});

		expect(page.getByRole('navigation').elements().length).toBe(0);
	});

	it('survives a full present → dismiss cycle without a runaway effect', async () => {
		// A guard held in `$state` and written inside its own effect throws
		// `effect_update_depth_exceeded` here rather than settling.
		const stack = [
			{ id: '1', title: 'Screen 1' },
			{ id: '2', title: 'Screen 2' }
		];
		const store = makeScopedStore(stack);

		const { rerender } = render(AnimatedNavigationStack, {
				store,
				stack,
				presentation: { status: 'presenting' as const, content: stack[1], duration: 300 },
				onBack: () => {}
			});

		await settle();
		await rerender({
			store,
			stack,
			presentation: { status: 'presented' as const, content: stack[1] },
			onBack: () => {}
		});
		await settle();

		await rerender({
			store,
			stack,
			presentation: { status: 'dismissing' as const, content: stack[1], duration: 300 },
			onBack: () => {}
		});
		await settle();
		await rerender({
			store,
			stack: [stack[0]],
			presentation: { status: 'idle' as const },
			onBack: () => {}
		});
		await settle();

		// Still mounted and rendering the screen we returned to.
		await expect.element(page.getByRole('navigation')).toBeInTheDocument();
	});

	it('shows a back button once the stack is deeper than one screen', async () => {
		const stack = [
			{ id: '1', title: 'Screen 1' },
			{ id: '2', title: 'Screen 2' }
		];
		render(AnimatedNavigationStack, {
				store: makeScopedStore(stack),
				stack,
				presentation: { status: 'presented' as const, content: stack[1] },
				onBack: () => {}
			});

		await expect.element(page.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
	});

	it('renders the outgoing screen in the previous layer while dismissing', async () => {
		// `previousScreen` came from a primitive that never supplied it, so this
		// layer rendered nothing and stayed hidden through every push and pop.
		const stack = [
			{ id: '1', title: 'Screen One' },
			{ id: '2', title: 'Screen Two' }
		];
		const store = makeScopedStore(stack);

		render(AnimatedStackTest, {
				store,
				stack,
				presentation: { status: 'dismissing' as const, content: stack[1], duration: 300 }
			});

		// Both layers are mounted: the outgoing one shows the screen being popped
		// back to, the current one shows the screen being dismissed.
		const ids = page
			.getByTestId('screen')
			.elements()
			.map((el) => el.getAttribute('data-screen-id'));

		expect(ids).toContain('1');
		expect(ids.length).toBe(2);
	});
});
