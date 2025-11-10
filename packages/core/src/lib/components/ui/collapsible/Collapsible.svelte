<script lang="ts" module>
	import { setContext, getContext } from 'svelte';
	import type { Store } from '../../../types.js';
	import type { CollapsibleState, CollapsibleAction } from './collapsible.types.js';

	const COLLAPSIBLE_CONTEXT_KEY = Symbol('collapsible');

	interface CollapsibleContext {
		store: Store<CollapsibleState, CollapsibleAction>;
		contentId: string;
		triggerId: string;
	}

	export function setCollapsibleContext(context: CollapsibleContext) {
		setContext(COLLAPSIBLE_CONTEXT_KEY, context);
	}

	export function getCollapsibleContext(): CollapsibleContext {
		const context = getContext<CollapsibleContext>(COLLAPSIBLE_CONTEXT_KEY);
		if (!context) {
			throw new Error('Collapsible context not found. Make sure CollapsibleTrigger/CollapsibleContent is used within Collapsible.');
		}
		return context;
	}
</script>

<script lang="ts">
	import { cn } from '../../../utils.js';

	/**
	 * Collapsible component - Single expandable section.
	 *
	 * Uses Composable Architecture pattern with reducer and store for
	 * state management. Provides context for trigger and content components.
	 *
	 * @example
	 * ```svelte
	 * <Collapsible {store}>
	 *   <CollapsibleTrigger>Click to expand</CollapsibleTrigger>
	 *   <CollapsibleContent>This is the collapsible content</CollapsibleContent>
	 * </Collapsible>
	 * ```
	 */

	interface CollapsibleProps {
		/**
		 * Collapsible store.
		 */
		store: Store<CollapsibleState, CollapsibleAction>;

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Children content.
		 */
		children?: import('svelte').Snippet;
	}

	let {
		store,
		class: className,
		children
	}: CollapsibleProps = $props();

	// Generate unique IDs for ARIA relationships
	const uid = Math.random().toString(36).substring(2, 9);
	const contentId = `collapsible-content-${uid}`;
	const triggerId = `collapsible-trigger-${uid}`;

	// Set context for child components
	setCollapsibleContext({
		store,
		contentId,
		triggerId
	});
</script>

<div
	role="region"
	class={cn('space-y-2', className)}
	data-state={$store.isExpanded ? 'open' : 'closed'}
>
	{@render children?.()}
</div>
