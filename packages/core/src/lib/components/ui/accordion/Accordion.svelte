<script lang="ts" module>
	import { setContext, getContext } from 'svelte';
	import type { Store } from '../../../types.js';
	import type { AccordionState, AccordionAction } from './accordion.types.js';

	const ACCORDION_CONTEXT_KEY = Symbol('accordion');
	const ACCORDION_ACTIVE_CONTEXT_KEY = Symbol('accordion-active');

	export function setAccordionContext(store: Store<AccordionState, AccordionAction>) {
		setContext(ACCORDION_CONTEXT_KEY, store);
	}

	export function getAccordionContext(): Store<AccordionState, AccordionAction> {
		const store = getContext<Store<AccordionState, AccordionAction>>(ACCORDION_CONTEXT_KEY);
		if (!store) {
			throw new Error('Accordion context not found. Make sure AccordionItem is used within Accordion.');
		}
		return store;
	}

	export function isAccordionActive(): () => boolean {
		return getContext<() => boolean>(ACCORDION_ACTIVE_CONTEXT_KEY) ?? (() => true);
	}

</script>

<script lang="ts">
	import { onDestroy, untrack, type Snippet } from 'svelte';
	import { createStore } from '../../../store.svelte.js';
	import { accordionReducer } from './accordion.reducer.js';
	import { createInitialAccordionState } from './accordion.types.js';
	import type { AccordionItem as AccordionItemType } from './accordion.types.js';
	import AccordionItem from './AccordionItem.svelte';
	import AccordionTrigger from './AccordionTrigger.svelte';
	import AccordionContent from './AccordionContent.svelte';
	import { cn } from '../../../utils.js';

	/**
	 * Accordion component - Collapsible sections.
	 *
	 * Uses Composable Architecture pattern with reducer and store for
	 * state management.
	 *
	 * @example
	 * ```svelte
	 * <Accordion items={[
	 *   { id: '1', title: 'Section 1', content: 'Content 1' },
	 *   { id: '2', title: 'Section 2', content: 'Content 2' }
	 * ]} />
	 * ```
	 */

	interface AccordionProps {
		/**
		 * Accordion items (optional - use this for declarative mode or omit to use composition with AccordionItem children).
		 */
		items?: AccordionItemType[] | undefined;

		/**
		 * Initially expanded item IDs.
		 */
		initialExpandedIds?: string[] | undefined;

		/**
		 * Allow multiple items expanded simultaneously.
		 */
		allowMultiple?: boolean | undefined;

		/**
		 * Allow all items to be collapsed (no minimum expanded).
		 */
		collapsible?: boolean | undefined;

		/**
		 * Callback when an item is expanded.
		 */
		onExpand?: ((id: string) => void) | undefined;

		/**
		 * Callback when an item is collapsed.
		 */
		onCollapse?: ((id: string) => void) | undefined;

		/**
		 * Additional CSS classes.
		 */
		class?: string | undefined;

		/**
		 * Content snippet.
		 */
		children?: Snippet | undefined;
	}

	let {
		items,
		initialExpandedIds = [],
		allowMultiple = true,
		collapsible = true,
		onExpand,
		onCollapse,
		class: className,
		children
	}: AccordionProps = $props();

	let active = true;
	setContext(ACCORDION_ACTIVE_CONTEXT_KEY, () => active);

	// Create accordion store with reducer
	const store = createStore({
		initialState: createInitialAccordionState(items || [], initialExpandedIds, allowMultiple, collapsible),
		reducer: accordionReducer,
		// Getters, not values: `createStore` re-reads `config.dependencies` on
		// every dispatch, but a plain object literal freezes what these resolve
		// to at setup, so swapping a callback prop left the store calling the
		// original. Mirrors `ui/file-upload/FileUpload.svelte:43-59`.
		dependencies: {
			get onExpand() {
				return onExpand;
			},
			get onCollapse() {
				return onCollapse;
			}
		}
	});

	// Set context for child components
	setAccordionContext(store);

	// Sync items changes (only when items prop is provided for declarative mode)
	// Only track items prop, not store.state (to avoid re-running on item registration)
	$effect(() => {
		if (items) {
			const nextItems = items;
			untrack(() => store.dispatch({ type: 'itemsChanged', items: nextItems }));
		}
	});

	onDestroy(() => {
		active = false;
		store.destroy();
	});
</script>

<div class={cn('space-y-2', className)}>
	{#if children}
		{@render children()}
	{:else if items}
		{#each items as item (item.id)}
			<AccordionItem id={item.id} disabled={item.disabled}>
				<AccordionTrigger>{item.title}</AccordionTrigger>
				<AccordionContent>{item.content}</AccordionContent>
			</AccordionItem>
		{/each}
	{/if}
</div>
