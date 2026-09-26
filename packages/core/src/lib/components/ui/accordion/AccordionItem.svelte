<script lang="ts" module>
	import { setContext, getContext } from 'svelte';

	const ACCORDION_ITEM_CONTEXT_KEY = Symbol('accordion-item');

	/**
	 * Live view of the accordion item context. `id` is static but `disabled` is
	 * exposed through a getter so children see prop updates instead of a
	 * frozen snapshot captured at mount.
	 */
	export interface AccordionItemContext {
		readonly id: string;
		readonly disabled: boolean;
		readonly triggerId: string;
		readonly contentId: string;
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
	import { untrack, type Snippet } from 'svelte';
	import { getAccordionContext, isAccordionActive } from './Accordion.svelte';
	import { cn } from '../../../utils.js';

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
		disabled?: boolean | undefined;

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
		id,
		disabled = false,
		class: className,
		children
	}: AccordionItemProps = $props();

	const store = getAccordionContext();
	const active = isAccordionActive();
	const uid = $props.id();
	const triggerId = `${uid}-trigger`;
	const contentId = `${uid}-content`;

	// Check if this item is expanded (for template data-state attribute)
	const isExpanded = $derived($store.expandedIds.includes(id));

	// Register/unregister item lifecycle with store
	$effect(() => {
		const currentId = id;
		untrack(() => store.dispatch({ type: 'itemRegistered', id: currentId, disabled }));
		return () => {
			if (active()) untrack(() => store.dispatch({ type: 'itemUnregistered', id: currentId }));
		};
	});

	// Sync disabled updates without unregistering (prevents wiping expansion)
	$effect(() => {
		const currentDisabled = disabled;
		const currentId = untrack(() => id);
		untrack(() => store.dispatch({ type: 'itemRegistered', id: currentId, disabled: currentDisabled }));
	});

	// Set context for trigger and content.
	setAccordionItemContext({
		get id() {
			return id;
		},
		get disabled() {
			return disabled;
		},
		get triggerId() {
			return triggerId;
		},
		get contentId() {
			return contentId;
		}
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
