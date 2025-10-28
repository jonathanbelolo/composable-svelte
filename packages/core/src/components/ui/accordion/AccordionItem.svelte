<script lang="ts" context="module">
	import { setContext, getContext } from 'svelte';

	const ACCORDION_ITEM_CONTEXT_KEY = Symbol('accordion-item');

	interface AccordionItemContext {
		id: string;
		disabled: boolean;
		isExpanded: boolean;
	}

	export function setAccordionItemContext(context: AccordionItemContext) {
		setContext(ACCORDION_ITEM_CONTEXT_KEY, context);
	}

	export function getAccordionItemContext(): AccordionItemContext {
		const context = getContext<AccordionItemContext>(ACCORDION_ITEM_CONTEXT_KEY);
		if (!context) {
			throw new Error('AccordionItem context not found. Make sure AccordionTrigger/AccordionContent is used within AccordionItem.');
		}
		return context;
	}
</script>

<script lang="ts">
	import { getAccordionContext } from './Accordion.svelte';
	import { cn } from '$lib/utils.js';

	/**
	 * AccordionItem component - Individual accordion section.
	 *
	 * @example
	 * ```svelte
	 * <AccordionItem id="item-1" disabled={false}>
	 *   <AccordionTrigger>Title</AccordionTrigger>
	 *   <AccordionContent>Content</AccordionContent>
	 * </AccordionItem>
	 * ```
	 */

	interface AccordionItemProps {
		/**
		 * Unique item ID.
		 */
		id: string;

		/**
		 * Whether the item is disabled.
		 */
		disabled?: boolean;

		/**
		 * Additional CSS classes.
		 */
		class?: string;
	}

	let {
		id,
		disabled = false,
		class: className,
		children
	}: AccordionItemProps = $props();

	const store = getAccordionContext();

	// Check if this item is expanded
	const isExpanded = $derived(store.state.expandedIds.includes(id));

	// Set context for trigger and content
	setAccordionItemContext({
		id,
		disabled,
		isExpanded
	});
</script>

<div
	class={cn(
		'border-b border-border',
		disabled && 'opacity-50',
		className
	)}
	data-accordion-item={id}
	data-state={isExpanded ? 'open' : 'closed'}
>
	{@render children?.()}
</div>
