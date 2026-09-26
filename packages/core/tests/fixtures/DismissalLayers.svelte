<script lang="ts">
	import { onDestroy } from 'svelte';
	import Modal from '../../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
	import Sheet from '../../src/lib/navigation-components/primitives/SheetPrimitive.svelte';
	import Drawer from '../../src/lib/navigation-components/primitives/DrawerPrimitive.svelte';
	import Alert from '../../src/lib/navigation-components/primitives/AlertPrimitive.svelte';
	import Popover from '../../src/lib/navigation-components/primitives/PopoverPrimitive.svelte';
	import Sidebar from '../../src/lib/navigation-components/primitives/SidebarPrimitive.svelte';
	import NavigationStack from '../../src/lib/navigation-components/primitives/NavigationStackPrimitive.svelte';
	import { Effect } from '../../src/lib/effect.js';
	import { createStore } from '../../src/lib/store.svelte.js';
	import { ManagedIntegrationBuilder, optionalSlot, type PresentationView } from '../../src/lib/navigation/managed-integration.js';
	import type { PresentationAction, PresentationState } from '../../src/lib/navigation/types.js';
	import type { Reducer } from '../../src/lib/types.js';

	interface Props {
		nested?: boolean; initialTop?: boolean; initialNavigation?: boolean; reverse?: boolean;
		initialStoreGated?: boolean; kind: 'modal' | 'sheet' | 'drawer' | 'alert' | 'popover';
		requests: (name: string) => void; onDismissalComplete?: () => void; onPresentationComplete?: () => void;
	}
	let { kind, requests, reverse = false, initialTop = false, initialNavigation = false, nested = false,
		initialStoreGated = false, onDismissalComplete, onPresentationComplete }: Props = $props();

	type Layer = Record<string, never>;
	type LayerAction = { type: 'noop' };
	type Root = { parent: Layer | null; child: Layer | null; childLabel: 'child' | 'replacement' };
	type RootAction =
		| { type: 'parent'; action: PresentationAction<LayerAction> }
		| { type: 'child'; action: PresentationAction<LayerAction> }
		| { type: 'replaceChild' }
		| { type: 'clearChild' }
		| { type: 'restoreChild' };
	const parentSlot = optionalSlot<Root, RootAction>()('parent');
	const childSlot = optionalSlot<Root, RootAction>()('child');
	const layerReducer: Reducer<Layer, LayerAction> = (state) => [state, Effect.none()];
	const reducer: Reducer<Root, RootAction> = (state, action) => {
		if (action.type === 'parent' && action.action.type === 'dismiss') {
			return [{ ...state, parent: {} }, Effect.fireAndForget(() => requests('parent'))];
		}
		if (action.type === 'child' && action.action.type === 'dismiss') {
			const label = state.childLabel;
			return [{ ...state, child: {} }, Effect.fireAndForget(() => requests(label))];
		}
		if (action.type === 'replaceChild') return [{ ...state, child: {}, childLabel: 'replacement' }, Effect.none()];
		if (action.type === 'clearChild') return [{ ...state, child: null }, Effect.none()];
		if (action.type === 'restoreChild') return [{ ...state, child: {}, childLabel: 'child' }, Effect.none()];
		return [state, Effect.none()];
	};
	const composition = new ManagedIntegrationBuilder<Root, RootAction, undefined>(reducer)
		.with(parentSlot, layerReducer)
		.with(childSlot, layerReducer, { replaceOn: (action) => action.type === 'replaceChild' })
		.build();
	const root = createStore({ initialState: { parent: {}, child: {}, childLabel: 'child' } satisfies Root, ...composition });
	let isDestroyed = false;
	onDestroy(() => { root.destroy(); isDestroyed = true; });

	const Selected = $derived({ modal: Modal, sheet: Sheet, drawer: Drawer, alert: Alert, popover: Popover }[kind]);
	const Outer = $derived(reverse ? Selected : Modal);
	const Inner = $derived(reverse ? Modal : Selected);
	let parent = $state.raw<PresentationView<Layer, LayerAction> | undefined>(composition.bind(root, parentSlot));
	let child = $state.raw<PresentationView<Layer, LayerAction> | undefined>(composition.bind(root, childSlot));
	const syncChild = () => (child = composition.bind(root, childSlot));
	let top = $state(initialTop), disabled = $state(false), pointerDisabled = $state(false), navigation = $state(initialNavigation);
	let storeGated = $state(initialStoreGated), contentMounted = $state(true);
	let dismissalCompletedCount = $state(0), presentationCompletedCount = $state(0);
	const dismissalCallbacks: Array<() => void> = [];
	function handlePresentationComplete() { if (!isDestroyed) { presentationCompletedCount++; onPresentationComplete?.(); } }
	function handleDismissalComplete() {
		if (isDestroyed) return;
		dismissalCompletedCount++; requests('dismissalComplete'); onDismissalComplete?.();
		for (const callback of dismissalCallbacks) callback();
	}
	let presentation = $state<PresentationState<string> | undefined>(undefined);
	export function replaceOwner() { root.dispatch({ type: 'replaceChild' }); syncChild(); }
	export function phase(status: 'presenting' | 'presented' | 'dismissing') { presentation = { status, content: 'child' }; }
	export function idle() { presentation = { status: 'idle' }; }
	export function open() { top = true; }
	export function hide() { top = false; }
	export function veto(value: boolean) { disabled = value; }
	export function disableOutsidePointer(value: boolean) { pointerDisabled = value; }
	export function showNavigation() { navigation = true; }
	export function onDismissal(callback: () => void) { dismissalCallbacks.push(callback); }
	export function getDismissalCompletionCount() { return dismissalCompletedCount; }
	export function getPresentationCompletionCount() { return presentationCompletedCount; }
	export function setStoreGated(value: boolean) { storeGated = value; }
	export function clearChildState() { root.dispatch({ type: 'clearChild' }); syncChild(); }
	export function restoreChildState() { root.dispatch({ type: 'restoreChild' }); syncChild(); }
	export function removeContent() { contentMounted = false; }
	export function restoreContent() { contentMounted = true; }
</script>

<Outer store={parent}>
	{#snippet children({ bindContent })}
		<div use:bindContent data-parent><button>Parent</button>{#if nested}{@render innerLayer()}{/if}</div>
	{/snippet}
</Outer>
{#if navigation}
	<Sidebar store={parent}>{#snippet children({ bindContent })}<div use:bindContent>Sidebar</div>{/snippet}</Sidebar>
	<NavigationStack store={parent} stack={[{}, {}]} onBack={() => requests('back')} />
{/if}
{#if !nested}{@render innerLayer()}{/if}

{#snippet innerLayer()}
	{#if top}
		<Inner store={child} disableEscapeKey={disabled} disableClickOutside={pointerDisabled} {presentation}
			onPresentationComplete={handlePresentationComplete} onDismissalComplete={handleDismissalComplete}>
			{#snippet children({ bindContent })}
				{#if contentMounted && (!storeGated || child?.state !== undefined)}
					<div use:bindContent data-child><button>Child</button></div>
				{/if}
			{/snippet}
		</Inner>
	{/if}
{/snippet}
