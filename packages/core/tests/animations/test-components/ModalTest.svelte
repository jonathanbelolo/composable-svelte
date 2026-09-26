<script lang="ts">
	let { startOpen = false }: { startOpen?: boolean } = $props();

	import { onDestroy } from 'svelte';
	import { createStore } from '../../../src/lib/store.svelte.js';
	import Modal from '../../../src/lib/navigation-components/Modal.svelte';
	import { optionalSlot, ManagedIntegrationBuilder } from '../../../src/lib/navigation/managed-integration.js';
	import type { PresentationState, PresentationAction } from '../../../src/lib/navigation/types.js';
	import { Effect } from '../../../src/lib/effect.js';
	// The value `Effect` shadows the type of the same name, which lives in
	// `types.ts`. Aliased so the reducer's return type resolves.
	import type { Effect as EffectType } from '../../../src/lib/types.js';

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
		| { type: 'modalContent'; action: PresentationAction<{ type: 'inert' }> }
		| { type: 'presentation'; event: { type: 'presentationCompleted' | 'dismissalCompleted' } };

	// ============================================================================
	// Reducer
	// ============================================================================

	const childReducer = (s: string): [string, EffectType<{ type: 'inert' }>] => [s, Effect.none()];

	function testReducer(state: TestState, action: TestAction): [TestState, EffectType<TestAction>] {
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

			case 'modalContent':
				if (action.action.type === 'dismiss') {
					if (state.presentation.status !== 'presented') {
						return [{ ...state, modalContent: state.presentation.status === 'idle' ? null : state.presentation.content }, Effect.none()];
					}
					return [{ ...state, modalContent: state.presentation.content, presentation: { ...state.presentation, status: 'dismissing' } }, Effect.none()];
				}
				return [state, Effect.none()];

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
	// Store & Managed Composition
	// ============================================================================

	const modalSlot = optionalSlot<TestState, TestAction>()('modalContent');
	const composition = new ManagedIntegrationBuilder<TestState, TestAction, undefined>(testReducer).with(modalSlot, childReducer).build();

	const store = createStore({
		// `startOpen` mounts already `presented` — what SSR hydration produces for a
		// page whose overlay was open when the HTML was generated. It reaches a path
		// the open-then-close flow cannot: a dismissal the animation guard never saw
		// presented.
		initialState: (startOpen
			? {
					modalContent: 'Test Modal Content',
					presentation: { status: 'presented' as const, content: 'Test Modal Content' }
				}
			: {
					modalContent: null,
					presentation: { status: 'idle' as const }
				}) satisfies TestState,
		...composition
	});

	onDestroy(() => store.destroy());
	const modalStore = $derived(store.state.modalContent != null ? composition.bind(store, modalSlot) : undefined);

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
	backdropClass="actual-modal-backdrop"
	class="actual-modal-content"
	store={modalStore}
	presentation={store.state.presentation}
	onPresentationComplete={() =>
		store.dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } })}
	onDismissalComplete={() =>
		store.dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })}
>
	{#snippet children({ store: scopedStore })}
		<div data-testid="modal-content" class="modal-test-content">
			<h2>Test Modal</h2>
			<p>{scopedStore!.state}</p>

			<button
				data-testid="modal-action-button"
				disabled={store.state.presentation.status === 'presenting' ||
					store.state.presentation.status === 'dismissing'}
			>
				Action Button
			</button>

			<button data-testid="dismiss-modal" onclick={() => scopedStore!.dismiss()}>
				Dismiss
			</button>
		</div>
	{/snippet}
</Modal>

<style>
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
