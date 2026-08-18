/**
 * `AnimatedNavigationStack` had no coverage at all, which is how three of its
 * animation guards (`lastAnimatedPresentationKey`, `animationPromiseCompleted`,
 * `frozenCurrentScreen`) sat in `$state` while being read and written inside
 * the `$effect` they guard — Svelte's `effect_update_depth_exceeded` condition.
 *
 * These tests drive the presentation lifecycle so that a self-triggering effect
 * shows up as a thrown error or a screen that never settles.
 */

import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import AnimatedNavigationStack from '../../src/lib/navigation-components/AnimatedNavigationStack.svelte';
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
			props: {
				store: makeScopedStore(stack),
				stack,
				presentation: { status: 'idle' as const },
				onBack: () => {}
			}
		});

		await expect.element(page.getByRole('navigation')).toBeInTheDocument();
	});

	it('renders nothing when the store is null', async () => {
		render(AnimatedNavigationStack, {
			props: {
				store: null,
				stack: [],
				presentation: { status: 'idle' as const },
				onBack: () => {}
			}
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
			props: {
				store,
				stack,
				presentation: { status: 'presenting' as const, content: stack[1], duration: 300 },
				onBack: () => {}
			}
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
			props: {
				store: makeScopedStore(stack),
				stack,
				presentation: { status: 'presented' as const, content: stack[1] },
				onBack: () => {}
			}
		});

		await expect.element(page.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
	});
});
