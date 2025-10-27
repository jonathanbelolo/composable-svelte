<script lang="ts">
	import { createStore } from '../../../src/store.svelte.js';
	import Sheet from '../../../src/navigation-components/Sheet.svelte';
	import type { PresentationState } from '../../../src/navigation/types.js';
	import { Effect } from '../../../src/effect.js';

	// ============================================================================
	// State & Actions
	// ============================================================================

	interface TestState {
		sheetContent: string | null;
		presentation: PresentationState<string>;
	}

	type TestAction =
		| { type: 'openSheet' }
		| { type: 'dismissSheet' }
		| { type: 'presentation'; event: { type: 'presentationCompleted' | 'dismissalCompleted' } };

	// ============================================================================
	// Reducer
	// ============================================================================

	function testReducer(state: TestState, action: TestAction): [TestState, Effect<TestAction>] {
		switch (action.type) {
			case 'openSheet':
				return [
					{
						...state,
						sheetContent: 'Test Sheet Content',
						presentation: { status: 'presenting', content: 'Test Sheet Content', duration: 300 }
					},
					Effect.none()
				];

			case 'dismissSheet':
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
					return [
						{
							...state,
							presentation: { ...state.presentation, status: 'presented' }
						},
						Effect.none()
					];
				}
				if (action.event.type === 'dismissalCompleted') {
					return [
						{
							...state,
							sheetContent: null,
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
		initialState: {
			sheetContent: null,
			presentation: { status: 'idle' as const }
		} satisfies TestState,
		reducer: testReducer
	});

	// Scoped store for sheet
	const sheetStore = $derived(
		store.state.sheetContent
			? {
					state: store.state.sheetContent,
					dispatch: store.dispatch,
					dismiss: () => store.dispatch({ type: 'dismissSheet' })
				}
			: null
	);

	// Expose store for testing (attach to window)
	if (typeof window !== 'undefined') {
		(window as any).__sheetTestStore = store;
	}
</script>

<!-- Test Controls -->
<div>
	<button data-testid="open-sheet" onclick={() => store.dispatch({ type: 'openSheet' })}>
		Open Sheet
	</button>

	<!-- Display presentation status for testing -->
	<div data-testid="presentation-status">{store.state.presentation.status}</div>
</div>

<!-- Sheet Component -->
<Sheet
	store={sheetStore}
	presentation={store.state.presentation}
	onPresentationComplete={() =>
		store.dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } })}
	onDismissalComplete={() =>
		store.dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })}
>
	{#snippet children({ store: scopedStore })}
		<div data-testid="sheet-backdrop" class="sheet-test-backdrop"></div>
		<div data-testid="sheet-content" class="sheet-test-content">
			<h2>Test Sheet</h2>
			<p>{scopedStore.state}</p>

			<button
				data-testid="sheet-action-button"
				disabled={store.state.presentation.status === 'presenting' ||
					store.state.presentation.status === 'dismissing'}
			>
				Action Button
			</button>

			<button data-testid="dismiss-sheet" onclick={() => scopedStore.dismiss()}>
				Dismiss
			</button>
		</div>
	{/snippet}
</Sheet>

<style>
	.sheet-test-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
	}

	.sheet-test-content {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		background: white;
		padding: 2rem;
		border-radius: 16px 16px 0 0;
		min-height: 200px;
	}
</style>
