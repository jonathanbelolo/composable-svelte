<script lang="ts">
	let { startOpen = false }: { startOpen?: boolean } = $props();

	import { createStore } from '../../../src/lib/store.svelte.js';
	import Drawer from '../../../src/lib/navigation-components/Drawer.svelte';
	import type { PresentationState } from '../../../src/lib/navigation/types.js';
	import { Effect } from '../../../src/lib/effect.js';
	// The value `Effect` shadows the type of the same name, which lives in
	// `types.ts`. Aliased so the reducer's return type resolves.
	import type { Effect as EffectType } from '../../../src/lib/types.js';

	// ============================================================================
	// State & Actions
	// ============================================================================

	interface TestState {
		drawerContent: string | null;
		presentation: PresentationState<string>;
	}

	type TestAction =
		| { type: 'openDrawer' }
		| { type: 'dismissDrawer' }
		| { type: 'presentation'; event: { type: 'presentationCompleted' | 'dismissalCompleted' } };

	// ============================================================================
	// Reducer
	// ============================================================================

	function testReducer(state: TestState, action: TestAction): [TestState, EffectType<TestAction>] {
		switch (action.type) {
			case 'openDrawer':
				return [
					{
						...state,
						drawerContent: 'Test Drawer Content',
						presentation: { status: 'presenting', content: 'Test Drawer Content', duration: 300 }
					},
					Effect.none()
				];

			case 'dismissDrawer':
				if (state.presentation.status !== 'presented') {
					return [state, Effect.none()]; // Guard: only dismiss when presented
				}
				return [
					{
						...state,
						presentation: { ...state.presentation, status: 'dismissing' }
					},
					Effect.none()
				];

			case 'presentation':
				if (action.event.type === 'presentationCompleted') {
					// Guard: a completion only means something while presenting. Spreading
					// any other status here builds `{ status: 'presented' }` with no
					// content, which is not a `PresentationState`.
					if (state.presentation.status !== 'presenting') {
						return [state, Effect.none()];
					}
					return [
						{
							...state,
							presentation: { status: 'presented', content: state.presentation.content }
						},
						Effect.none()
					];
				}
				if (action.event.type === 'dismissalCompleted') {
					return [
						{
							...state,
							drawerContent: null,
							presentation: { status: 'idle' }
						},
						Effect.none()
					];
				}
				return [state, Effect.none()];

			default:
				return [state, Effect.none()];
		}
	}

	// ============================================================================
	// Store
	// ============================================================================

	const store = createStore({
		// `startOpen` mounts already `presented` — what SSR hydration produces for a
		// page whose overlay was open when the HTML was generated. It reaches a path
		// the open-then-close flow cannot: a dismissal the animation guard never saw
		// presented.
		initialState: (startOpen
			? {
					drawerContent: 'Test Drawer Content',
					presentation: { status: 'presented' as const, content: 'Test Drawer Content' }
				}
			: {
					drawerContent: null,
					presentation: { status: 'idle' as const }
				}) satisfies TestState,
		reducer: testReducer
	});

	// Scoped store for drawer
	const drawerStore = $derived(
		store.state.drawerContent
			? {
					state: store.state.drawerContent,
					dispatch: store.dispatch,
					dismiss: () => store.dispatch({ type: 'dismissDrawer' })
				}
			: null
	);

	// Expose store for testing (attach to window)
	if (typeof window !== 'undefined') {
		(window as any).__drawerTestStore = store;
	}
</script>

<!-- Test Controls -->
<div>
	<button data-testid="open-drawer" onclick={() => store.dispatch({ type: 'openDrawer' })}>
		Open Drawer
	</button>

	<!-- Display presentation status for testing -->
	<div data-testid="presentation-status">{store.state.presentation.status}</div>
</div>

<!-- Drawer Component (default side='left') -->
<Drawer
	store={drawerStore}
	presentation={store.state.presentation}
	onPresentationComplete={() =>
		store.dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } })}
	onDismissalComplete={() =>
		store.dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })}
>
	{#snippet children({ store: scopedStore })}
		<div data-testid="drawer-backdrop" class="drawer-test-backdrop"></div>
		<div data-testid="drawer-content" class="drawer-test-content">
			<h2>Test Drawer</h2>
			<p>{scopedStore!.state}</p>

			<button
				data-testid="drawer-action-button"
				disabled={store.state.presentation.status === 'presenting' ||
					store.state.presentation.status === 'dismissing'}
			>
				Action Button
			</button>

			<button data-testid="dismiss-drawer" onclick={() => scopedStore!.dismiss()}>
				Dismiss
			</button>
		</div>
	{/snippet}
</Drawer>

<style>
	.drawer-test-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
	}

	.drawer-test-content {
		position: fixed;
		left: 0;
		top: 0;
		bottom: 0;
		width: 320px;
		background: white;
		padding: 2rem;
		box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
	}
</style>
