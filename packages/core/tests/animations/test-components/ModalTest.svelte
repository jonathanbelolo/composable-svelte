<script lang="ts">
	import { createStore } from '../../../src/store.svelte.js';
	import Modal from '../../../src/navigation-components/Modal.svelte';
	import type { PresentationState } from '../../../src/navigation/types.js';
	import { Effect } from '../../../src/effect.js';

	// ============================================================================
	// State & Actions
	// ============================================================================

	interface TestState {
		modalContent: string | null;
		presentation: PresentationState<string>;
	}

	type TestAction =
		| { type: 'openModal' }
		| { type: 'dismissModal' }
		| { type: 'presentation'; event: { type: 'presentationCompleted' | 'dismissalCompleted' } };

	// ============================================================================
	// Reducer
	// ============================================================================

	function testReducer(state: TestState, action: TestAction): [TestState, Effect<TestAction>] {
		switch (action.type) {
			case 'openModal':
				return [
					{
						...state,
						modalContent: 'Test Modal Content',
						presentation: { status: 'presenting', content: 'Test Modal Content', duration: 300 }
					},
					Effect.none()
				];

			case 'dismissModal':
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
							modalContent: null,
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
			modalContent: null,
			presentation: { status: 'idle' as const }
		} satisfies TestState,
		reducer: testReducer
	});

	// Scoped store for modal
	const modalStore = $derived(
		store.state.modalContent
			? {
					state: store.state.modalContent,
					dispatch: store.dispatch,
					dismiss: () => store.dispatch({ type: 'dismissModal' })
				}
			: null
	);

	// Expose store for testing (attach to window)
	if (typeof window !== 'undefined') {
		(window as any).__modalTestStore = store;
	}
</script>

<!-- Test Controls -->
<div>
	<button data-testid="open-modal" onclick={() => store.dispatch({ type: 'openModal' })}>
		Open Modal
	</button>

	<!-- Display presentation status for testing -->
	<div data-testid="presentation-status">{store.state.presentation.status}</div>
</div>

<!-- Modal Component -->
<Modal
	store={modalStore}
	presentation={store.state.presentation}
	onPresentationComplete={() =>
		store.dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } })}
	onDismissalComplete={() =>
		store.dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })}
>
	{#snippet children({ store: scopedStore })}
		<div data-testid="modal-backdrop" class="modal-test-backdrop"></div>
		<div data-testid="modal-content" class="modal-test-content">
			<h2>Test Modal</h2>
			<p>{scopedStore.state}</p>

			<button
				data-testid="modal-action-button"
				disabled={store.state.presentation.status === 'presenting' ||
					store.state.presentation.status === 'dismissing'}
			>
				Action Button
			</button>

			<button data-testid="dismiss-modal" onclick={() => scopedStore.dismiss()}>
				Dismiss
			</button>
		</div>
	{/snippet}
</Modal>

<style>
	.modal-test-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
	}

	.modal-test-content {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		background: white;
		padding: 2rem;
		border-radius: 8px;
		min-width: 300px;
	}
</style>
