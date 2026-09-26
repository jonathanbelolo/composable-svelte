<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Effect } from '../../src/lib/effect.js';
	import { createStore } from '../../src/lib/store.svelte.js';
	import {
		ManagedIntegrationBuilder,
		optionalSlot,
		type PresentationView
	} from '../../src/lib/navigation/managed-integration.js';
	import type { PresentationAction } from '../../src/lib/navigation/types.js';
	import type { Reducer } from '../../src/lib/types.js';
	import ModalPrimitive from '../../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
	import DropdownMenu from '../../src/lib/components/ui/dropdown-menu/DropdownMenu.svelte';
	import Select from '../../src/lib/components/ui/select/Select.svelte';
	import Combobox from '../../src/lib/components/ui/combobox/Combobox.svelte';

	interface Props {
		control: 'dropdown' | 'select' | 'combobox';
		requests: (source: string) => void;
		initialShowChild?: boolean;
	}

	let { control, requests, initialShowChild = true }: Props = $props();

	let showChild = $state(initialShowChild);

	type Child = Record<string, never>;
	type ChildAction = { type: 'noop' };
	type Root = { overlay: Child | null };
	type RootAction = { type: 'overlay'; action: PresentationAction<ChildAction> };

	const overlaySlot = optionalSlot<Root, RootAction>()('overlay');
	const childReducer: Reducer<Child, ChildAction> = (state) => [state, Effect.none()];
	const reducer: Reducer<Root, RootAction> = (state, action) => {
		if (action.type === 'overlay' && action.action.type === 'dismiss') {
			return [{ ...state, overlay: {} }, Effect.fireAndForget(() => requests('parent'))];
		}
		return [state, Effect.none()];
	};
	const composition = new ManagedIntegrationBuilder<Root, RootAction, undefined>(reducer)
		.with(overlaySlot, childReducer)
		.build();
	const root = createStore({ initialState: { overlay: {} }, ...composition });
	onDestroy(() => root.destroy());

	const view: PresentationView<Child, ChildAction> | undefined = $derived(composition.bind(root, overlaySlot));

	export function unmountChild() {
		showChild = false;
	}

	export function mountChild() {
		showChild = true;
	}
</script>

<ModalPrimitive store={view}>
	{#snippet children({ bindContent })}
		<div use:bindContent data-modal-content>
			<button type="button" data-modal-inside>Inside Modal</button>
			{#if showChild}
				{#if control === 'dropdown'}
					<DropdownMenu
						items={[
							{ id: 'item-1', label: 'Item 1' },
							{ id: 'item-2', label: 'Item 2' }
						]}
					>
						{#snippet children()}
							<span>Dropdown Trigger</span>
						{/snippet}
					</DropdownMenu>
				{:else if control === 'select'}
					<Select
						options={[
							{ value: 'opt-1', label: 'Option 1' },
							{ value: 'opt-2', label: 'Option 2' }
						]}
						placeholder="Select option"
					/>
				{:else if control === 'combobox'}
					<Combobox
						options={[
							{ value: 'opt-1', label: 'Option 1' },
							{ value: 'opt-2', label: 'Option 2' }
						]}
						placeholder="Search option"
					/>
				{/if}
			{/if}
		</div>
	{/snippet}
</ModalPrimitive>
