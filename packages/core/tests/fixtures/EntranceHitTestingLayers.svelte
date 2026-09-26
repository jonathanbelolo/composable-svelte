<script lang="ts">
	import Modal from '../../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
	import Sheet from '../../src/lib/navigation-components/primitives/SheetPrimitive.svelte';
	import Drawer from '../../src/lib/navigation-components/primitives/DrawerPrimitive.svelte';
	import Alert from '../../src/lib/navigation-components/primitives/AlertPrimitive.svelte';
	import Popover from '../../src/lib/navigation-components/primitives/PopoverPrimitive.svelte';
	import Sidebar from '../../src/lib/navigation-components/primitives/SidebarPrimitive.svelte';
	import NavigationStack from '../../src/lib/navigation-components/primitives/NavigationStackPrimitive.svelte';
	import { Effect } from '../../src/lib/effect.js';
	import { createStore } from '../../src/lib/store.svelte.js';
	import { ManagedIntegrationBuilder, optionalSlot, keyedSlot, type ChildView, type PresentationView } from '../../src/lib/navigation/managed-integration.js';
	import type { PresentationAction, PresentationState } from '../../src/lib/navigation/types.js';
	import type { Reducer } from '../../src/lib/types.js';

	interface Props {
		kind: 'modal' | 'sheet' | 'drawer' | 'alert' | 'popover';
		requests: (name: string) => void;
	}
	let { kind, requests }: Props = $props();
	type Layer = { label: string };
	type LayerAction = { type: 'noop' };
	type Root = { sidebar: Layer | null; navigation: Array<{id: number; state: Layer}>; overlay: Layer | null };
	type RootAction =
		| { type: 'sidebar'; action: PresentationAction<LayerAction> }
		| { type: 'navigation'; id: number; action: LayerAction }
		| { type: 'overlay'; action: PresentationAction<LayerAction> };
	const sidebarSlot = optionalSlot<Root, RootAction>()('sidebar');
	const navigationSlot = keyedSlot<Root, RootAction>()('navigation');
	const overlaySlot = optionalSlot<Root, RootAction>()('overlay');
	const layerReducer: Reducer<Layer, LayerAction> = (state) => [state, Effect.none()];
	const reducer: Reducer<Root, RootAction> = (state, action) => {
		if (action.type === 'sidebar' && action.action.type === 'dismiss') {
			return [state, Effect.fireAndForget(() => requests('sidebar'))];
		}
		if (action.type === 'overlay' && action.action.type === 'dismiss') {
			return [state, Effect.fireAndForget(() => requests('overlay'))];
		}
		return [state, Effect.none()];
	};
	const composition = new ManagedIntegrationBuilder<Root, RootAction, undefined>(reducer)
		.with(sidebarSlot, layerReducer)
		.forEach(navigationSlot, layerReducer)
		.with(overlaySlot, layerReducer)
		.build();
	const root = createStore({initialState: {sidebar: {label: 'sidebar'}, navigation: [{id: 1, state: {label: 'navigation'}}], overlay: {label: 'overlay'}}, ...composition});
	const sidebar: PresentationView<Layer, LayerAction> | undefined = composition.bind(root, sidebarSlot);
	const navigation: ChildView<Layer, LayerAction> | undefined = composition.bind(root, navigationSlot.at(1));
	const overlay: PresentationView<Layer, LayerAction> | undefined = composition.bind(root, overlaySlot);
	let sidebarPresentation = $state<PresentationState<string>>({status: 'presented', content: 'sidebar'});
	let overlayPresentation = $state<PresentationState<string>>({status: 'idle'});
	let childClicks = $state(0);
	let underlayClicks = $state(0);
	let navigationBacks = $state(0);
	let navigationVisible = $state(true);
	export function phaseSidebar(status: 'presenting' | 'presented' | 'dismissing') {
		sidebarPresentation = {status, content: 'sidebar'};
	}
	export function phaseOverlay(status: 'presenting' | 'presented' | 'dismissing') {
		overlayPresentation = {status, content: 'overlay'};
	}
	export function getClicks() { return {child: childClicks, underlay: underlayClicks}; }
	export function getNavigationBacks() { return navigationBacks; }
	export function hideNavigation() { navigationVisible = false; }
</script>

<button data-underlay onclick={() => underlayClicks++} style="position:fixed;inset:0;width:100%;height:100%">Underlay</button>
<div style="position:fixed;left:0;top:0;width:80px;height:100vh">
	<Sidebar store={sidebar} presentation={sidebarPresentation}>
		{#snippet children({bindContent})}<nav use:bindContent data-sidebar>Sidebar</nav>{/snippet}
	</Sidebar>
	{#if navigationVisible}
		<NavigationStack store={navigation} stack={[{label: 'one'}, {label: 'two'}]} onBack={() => { navigationBacks++; requests('navigation'); }}>
			{#snippet children()}<div data-navigation>Navigation</div>{/snippet}
		</NavigationStack>
	{/if}
</div>
{#if overlayPresentation.status !== 'idle'}
	{#if kind === 'modal'}
		<Modal store={overlay} presentation={overlayPresentation}>{#snippet children({bindBackdrop,bindContent})}<div use:bindBackdrop style="position:fixed;inset:0"><button use:bindContent data-hit-child onclick={() => childClicks++} style="position:fixed;left:40vw;top:40vh;width:20vw;height:20vh">Overlay</button></div>{/snippet}</Modal>
	{:else if kind === 'sheet'}
		<Sheet store={overlay} presentation={overlayPresentation}>{#snippet children({bindBackdrop,bindContent})}<div use:bindBackdrop style="position:fixed;inset:0"><button use:bindContent data-hit-child onclick={() => childClicks++} style="position:fixed;left:40vw;top:40vh;width:20vw;height:20vh">Overlay</button></div>{/snippet}</Sheet>
	{:else if kind === 'drawer'}
		<Drawer store={overlay} presentation={overlayPresentation}>{#snippet children({bindBackdrop,bindContent})}<div use:bindBackdrop style="position:fixed;inset:0"><button use:bindContent data-hit-child onclick={() => childClicks++} style="position:fixed;left:40vw;top:40vh;width:20vw;height:20vh">Overlay</button></div>{/snippet}</Drawer>
	{:else if kind === 'alert'}
		<Alert store={overlay} presentation={overlayPresentation}>{#snippet children({bindBackdrop,bindContent})}<div use:bindBackdrop style="position:fixed;inset:0"><button use:bindContent data-hit-child onclick={() => childClicks++} style="position:fixed;left:40vw;top:40vh;width:20vw;height:20vh">Overlay</button></div>{/snippet}</Alert>
	{:else}
		<Popover store={overlay} presentation={overlayPresentation}>{#snippet children({bindContent})}<button use:bindContent data-hit-child onclick={() => childClicks++} style="position:fixed;left:40vw;top:40vh;width:20vw;height:20vh">Overlay</button>{/snippet}</Popover>
	{/if}
{/if}
