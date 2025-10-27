<script lang="ts" generics="State, Action, Dest extends { type: string; state: any }">
	/**
	 * DestinationRouter - Declarative routing for navigation destinations.
	 *
	 * This component reduces boilerplate by automatically:
	 * - Scoping stores to destination cases
	 * - Rendering appropriate presentation components (Modal, Sheet, Drawer)
	 * - Managing conditional rendering
	 *
	 * **Benefits:**
	 * - 70% less view boilerplate
	 * - Declarative route configuration
	 * - Type-safe component mapping
	 * - Automatic presentation handling
	 *
	 * @example
	 * ```svelte
	 * <DestinationRouter
	 *   {store}
	 *   field="destination"
	 *   routes={{
	 *     addItem: { component: AddItemView, presentation: 'modal' },
	 *     editItem: { component: EditItemView, presentation: 'sheet' },
	 *     detail: { component: DetailView, presentation: 'drawer' }
	 *   }}
	 * />
	 * ```
	 */

	import { scopeTo } from '../navigation/scope.js';
	import Modal from './Modal.svelte';
	import Sheet from './Sheet.svelte';
	import Drawer from './Drawer.svelte';
	import type { Store } from '../types.js';
	import type { Component } from 'svelte';

	// ============================================================================
	// Types
	// ============================================================================

	/**
	 * Configuration for a single route.
	 */
	interface RouteConfig {
		/**
		 * The Svelte component to render for this destination case.
		 *
		 * Component will receive a `store` prop with the scoped store.
		 */
		component: Component;

		/**
		 * The presentation style to use.
		 *
		 * - `modal`: Full-screen overlay with backdrop
		 * - `sheet`: Bottom sheet (mobile) or side panel (desktop)
		 * - `drawer`: Side drawer that pushes content
		 */
		presentation: 'modal' | 'sheet' | 'drawer';

		/**
		 * Additional props to pass to the presentation component.
		 *
		 * @example
		 * ```typescript
		 * {
		 *   presentationProps: {
		 *     unstyled: true,
		 *     disableClickOutside: true
		 *   }
		 * }
		 * ```
		 */
		presentationProps?: Record<string, any>;

		/**
		 * Additional props to pass to the child component.
		 *
		 * @example
		 * ```typescript
		 * {
		 *   componentProps: {
		 *     showAdvanced: true,
		 *     theme: 'dark'
		 *   }
		 * }
		 * ```
		 */
		componentProps?: Record<string, any>;
	}

	/**
	 * Props for DestinationRouter.
	 */
	interface Props {
		/**
		 * The parent store containing destination state.
		 */
		store: Store<State, Action>;

		/**
		 * The field name in state that contains the destination.
		 *
		 * Must be a discriminated union with `{ type: string; state: any }` structure.
		 */
		field: keyof State & string;

		/**
		 * Map of destination case types to route configurations.
		 *
		 * Keys must match the `type` values in the destination union.
		 */
		routes: Record<string, RouteConfig>;
	}

	// ============================================================================
	// Props
	// ============================================================================

	let { store, field, routes }: Props = $props();

	// ============================================================================
	// Derived State
	// ============================================================================

	/**
	 * For each route, create a scoped store.
	 *
	 * This reactively creates scoped stores for all destination cases.
	 * Only the active destination will have a non-null scoped store.
	 */
	const scopedStores = $derived.by(() => {
		const result: Record<string, any> = {};

		for (const key of Object.keys(routes)) {
			result[key] = scopeTo(store).into(field).case(key);
		}

		return result;
	});
</script>

<!--
  Render presentation components for each route.

  Only the route matching the current destination will render content,
  as its scoped store will be non-null.
-->
{#each Object.entries(routes) as [key, config] (key)}
	{@const scopedStore = scopedStores[key]}

	{#if config.presentation === 'modal'}
		<Modal store={scopedStore} {...(config.presentationProps ?? {})}>
			{#if scopedStore}
				{@const Component = config.component}
				<Component store={scopedStore} {...(config.componentProps ?? {})} />
			{/if}
		</Modal>
	{:else if config.presentation === 'sheet'}
		<Sheet store={scopedStore} {...(config.presentationProps ?? {})}>
			{#if scopedStore}
				{@const Component = config.component}
				<Component store={scopedStore} {...(config.componentProps ?? {})} />
			{/if}
		</Sheet>
	{:else if config.presentation === 'drawer'}
		<Drawer store={scopedStore} {...(config.presentationProps ?? {})}>
			{#if scopedStore}
				{@const Component = config.component}
				<Component store={scopedStore} {...(config.componentProps ?? {})} />
			{/if}
		</Drawer>
	{/if}
{/each}
