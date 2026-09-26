<script lang="ts">
	/**
	 * Sidebar animation harness. There was no Sidebar entry in `tests/animations/`
	 * at all, which is why `springConfig` could sit destructured-and-unused and a
	 * CSS transition could stand in for Motion One unnoticed.
	 */
	let {
		springConfig,
		startOpen = false
		// `Partial<SpringConfig>`, which is what `Sidebar` takes — as
		// `Record<string, unknown>` this harness accepted values the component
		// would reject. The explicit `| undefined` is required under
		// `exactOptionalPropertyTypes` because the test passes the prop through
		// even when it has nothing to pass.
	}: { springConfig?: Partial<SpringConfig> | undefined; startOpen?: boolean } = $props();

	import { onDestroy } from 'svelte';
	import { createStore } from '../../../src/lib/store.svelte.js';
	import type { SpringConfig } from '../../../src/lib/animation/spring-config.js';
	import Sidebar from '../../../src/lib/navigation-components/Sidebar.svelte';
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
		sidebarContent: string | null;
		presentation: PresentationState<string>;
	}

	type TestAction =
		| { type: 'openSidebar' }
		| { type: 'dismissSidebar' }
		| { type: 'sidebarContent'; action: PresentationAction<{ type: 'inert' }> }
		| { type: 'presentation'; event: { type: 'presentationCompleted' | 'dismissalCompleted' } };

	// ============================================================================
	// Reducer
	// ============================================================================

	const childReducer = (s: string): [string, EffectType<{ type: 'inert' }>] => [s, Effect.none()];

	function testReducer(state: TestState, action: TestAction): [TestState, EffectType<TestAction>] {
		switch (action.type) {
			case 'openSidebar':
				return [
					{
						...state,
						sidebarContent: 'Test Sidebar Content',
						presentation: { status: 'presenting', content: 'Test Sidebar Content', duration: 300 }
					},
					Effect.none()
				];

			case 'dismissSidebar':
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

			case 'sidebarContent':
				if (action.action.type === 'dismiss') {
					if (state.presentation.status !== 'presented') {
						return [{ ...state, sidebarContent: state.presentation.status === 'idle' ? null : state.presentation.content }, Effect.none()];
					}
					return [{ ...state, sidebarContent: state.presentation.content, presentation: { ...state.presentation, status: 'dismissing' } }, Effect.none()];
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
							sidebarContent: null,
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

	const sidebarSlot = optionalSlot<TestState, TestAction>()('sidebarContent');
	const composition = new ManagedIntegrationBuilder<TestState, TestAction, undefined>(testReducer).with(sidebarSlot, childReducer).build();

	const store = createStore({
		// `startOpen` mounts the sidebar already `presented`. That is the *normal*
		// configuration for a persistent desktop sidebar — SidebarDemo does exactly
		// this — and it exercises a path the open-then-close flow never reaches:
		// the animation guard has to allow a dismissal it never saw presented.
		initialState: (startOpen
			? {
					sidebarContent: 'Test Sidebar Content',
					presentation: { status: 'presented' as const, content: 'Test Sidebar Content' }
				}
			: {
					sidebarContent: null,
					presentation: { status: 'idle' as const }
				}) satisfies TestState,
		...composition
	});

	onDestroy(() => store.destroy());
	const sidebarStore = $derived(store.state.sidebarContent != null ? composition.bind(store, sidebarSlot) : undefined);

	// Expose store for testing (attach to window)
	if (typeof window !== 'undefined') {
		(window as any).__sidebarTestStore = store;
	}
</script>

<!-- Test Controls -->
<div>
	<button data-testid="open-sidebar" onclick={() => store.dispatch({ type: 'openSidebar' })}>
		Open Sidebar
	</button>

	<button data-testid="dismiss-sidebar" onclick={() => store.dispatch({ type: 'dismissSidebar' })}>
		Dismiss Sidebar
	</button>

	<!-- Display presentation status for testing -->
	<div data-testid="presentation-status">{store.state.presentation.status}</div>
</div>

<!-- Sidebar Component -->
<Sidebar
	{springConfig}
	store={sidebarStore}
	presentation={store.state.presentation}
	onPresentationComplete={() =>
		store.dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } })}
	onDismissalComplete={() =>
		store.dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })}
>
	{#snippet children({ store: scopedStore })}
		<div data-testid="sidebar-content" class="sidebar-test-content">
			<h2>Test Sidebar</h2>
			<p>{scopedStore!.state}</p>

			<button
				data-testid="sidebar-action-button"
				disabled={store.state.presentation.status === 'presenting' ||
					store.state.presentation.status === 'dismissing'}
			>
				Action Button
			</button>

			<button data-testid="dismiss-via-scope" onclick={() => scopedStore!.dismiss()}>
				Dismiss
			</button>
		</div>
	{/snippet}
</Sidebar>

<style>
	.sidebar-test-content {
		padding: 1rem;
	}
</style>
