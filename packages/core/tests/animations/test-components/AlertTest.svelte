<script lang="ts">
	let { startOpen = false }: { startOpen?: boolean } = $props();

	import { createStore } from '../../../src/lib/store.svelte.js';
	import Alert from '../../../src/lib/navigation-components/Alert.svelte';
	import type { PresentationState } from '../../../src/lib/navigation/types.js';
	import { Effect } from '../../../src/lib/effect.js';
	// The value `Effect` shadows the type of the same name, which lives in
	// `types.ts`. Aliased so the reducer's return type resolves.
	import type { Effect as EffectType } from '../../../src/lib/types.js';

	// ============================================================================
	// State & Actions
	// ============================================================================

	interface TestState {
		alertContent: string | null;
		presentation: PresentationState<string>;
	}

	type TestAction =
		| { type: 'openAlert' }
		| { type: 'dismissAlert' }
		| { type: 'presentation'; event: { type: 'presentationCompleted' | 'dismissalCompleted' } };

	// ============================================================================
	// Reducer
	// ============================================================================

	function testReducer(state: TestState, action: TestAction): [TestState, EffectType<TestAction>] {
		switch (action.type) {
			case 'openAlert':
				return [
					{
						...state,
						alertContent: 'Test Alert Content',
						presentation: { status: 'presenting', content: 'Test Alert Content', duration: 300 }
					},
					Effect.none()
				];

			case 'dismissAlert':
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
							alertContent: null,
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
					alertContent: 'Test Alert Content',
					presentation: { status: 'presented' as const, content: 'Test Alert Content' }
				}
			: {
					alertContent: null,
					presentation: { status: 'idle' as const }
				}) satisfies TestState,
		reducer: testReducer
	});

	// Scoped store for alert
	const alertStore = $derived(
		store.state.alertContent
			? {
					state: store.state.alertContent,
					dispatch: store.dispatch,
					dismiss: () => store.dispatch({ type: 'dismissAlert' })
				}
			: null
	);

	// Expose store for testing (attach to window)
	if (typeof window !== 'undefined') {
		(window as any).__alertTestStore = store;
	}
</script>

<!-- Test Controls -->
<div>
	<button data-testid="open-alert" onclick={() => store.dispatch({ type: 'openAlert' })}>
		Open Alert
	</button>

	<!-- Display presentation status for testing -->
	<div data-testid="presentation-status">{store.state.presentation.status}</div>
</div>

<!-- Alert Component -->
<Alert
	store={alertStore}
	presentation={store.state.presentation}
	onPresentationComplete={() =>
		store.dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } })}
	onDismissalComplete={() =>
		store.dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })}
>
	{#snippet children({ store: scopedStore })}
		<div data-testid="alert-backdrop" class="alert-test-backdrop"></div>
		<div data-testid="alert-content" class="alert-test-content">
			<h2>Test Alert</h2>
			<p>{scopedStore?.state}</p>

			<button
				data-testid="alert-action-button"
				disabled={store.state.presentation.status === 'presenting' ||
					store.state.presentation.status === 'dismissing'}
			>
				Action Button
			</button>

			<button data-testid="dismiss-alert" onclick={() => scopedStore?.dismiss()}>
				Dismiss
			</button>
		</div>
	{/snippet}
</Alert>

<style>
	.alert-test-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
	}

	.alert-test-content {
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
