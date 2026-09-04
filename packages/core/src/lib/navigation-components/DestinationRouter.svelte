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

	import { isDev } from '../dependencies/utils.js';
	import { scopeTo } from '../navigation/scope.js';
	import Modal from './Modal.svelte';
	import Sheet from './Sheet.svelte';
	import Drawer from './Drawer.svelte';
	import type { DestinationRouterProps } from './destination-router.types.js';

	// ============================================================================
	// Types
	// ============================================================================



	// ============================================================================
	// Props
	// ============================================================================

	let { store, field, routes }: DestinationRouterProps<State, Action> = $props();

	// ============================================================================
	// Derived State
	// ============================================================================

	/**
	 * Get the current destination value for reactive tracking.
	 * Only recompute when this specific field changes.
	 */
	const destinationValue = $derived(store.state[field]);

	/**
	 * For each route, create a scoped store.
	 *
	 * This reactively creates scoped stores for all destination cases.
	 * Only the active destination will have a non-null scoped store.
	 *
	 * Performance: We create scoped stores for all routes, but only one
	 * will be non-null at a time. This is acceptable for typical use
	 * (3-7 routes). For very large route tables (>20), consider
	 * on-demand scoping in the loop below.
	 */
	const scopedStores = $derived.by(() => {
		const result: Record<string, any> = {};

		// No destination: every route is explicitly `null`, not absent.
		//
		// This used to `return result` while it was still `{}`, so each route's
		// store came out `undefined` — and `Modal`, `Sheet` and `Drawer` all
		// declare `store: ScopedDestinationStore | null`. `undefined` is not
		// `null` under exactOptionalPropertyTypes, and at runtime it threw
		// `Cannot read properties of undefined (reading 'state')`. A router
		// rendered with nothing presented — which is its resting state, most of
		// the time — crashed.
		if (!destinationValue) {
			for (const key of Object.keys(routes)) result[key] = null;
			return result;
		}

		// Development-mode validation: check if active destination has a route
		if (
			isDev() &&
			typeof destinationValue === 'object' &&
			'type' in destinationValue
		) {
			const activeType = destinationValue.type as string;
			if (!(activeType in routes)) {
				console.warn(
					`[DestinationRouter] No route configured for destination case '${activeType}'. ` +
						`Available routes: ${Object.keys(routes).join(', ')}. ` +
						`The destination will not be rendered.`
				);
			}
		}

		// Create scoped stores for all routes
		for (const key of Object.keys(routes)) {
			// String-keyed by design: the route table is a Record, so the case
			// name cannot be checked against the union here.
			result[key] = scopeTo(store).into(field).case(key as never);
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
