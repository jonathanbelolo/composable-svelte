<script lang="ts">
	import { animateAccordionExpand, animateAccordionCollapse } from '../../../animation/animate.js';
	import { getAccordionItemContext } from './AccordionItem.svelte';
	import { getAccordionContext } from './Accordion.svelte';
	import { cn } from '../../../utils.js';

	/**
	 * AccordionContent component - Collapsible content section.
	 *
	 * Uses centralized animation system for smooth expand/collapse animations.
	 *
	 * @example
	 * ```svelte
	 * <AccordionContent>
	 *   This is the content that will expand and collapse.
	 * </AccordionContent>
	 * ```
	 */

	interface AccordionContentProps {
		/**
		 * Additional CSS classes.
		 */
		class?: string;
	}

	let {
		class: className,
		children
	}: AccordionContentProps = $props();

	const itemContext = getAccordionItemContext();
	const store = getAccordionContext();

	let contentElement: HTMLDivElement | null = $state(null);

	// Read isExpanded directly from store
	// CRITICAL: Only depend on the specific boolean value, not the whole array
	const isExpanded = $derived($store.expandedIds.includes(itemContext.id));

	// Track previous with regular let
	let previousExpandedState: boolean | undefined = undefined;

	// Animate expand/collapse when isExpanded changes
	$effect(() => {
		const currentExpanded = isExpanded;

		// Skip animation on initial render
		if (previousExpandedState === undefined) {
			previousExpandedState = currentExpanded;
			return;
		}

		// Skip if no actual change
		if (previousExpandedState === currentExpanded) {
			return;
		}

		previousExpandedState = currentExpanded;

		if (!contentElement) return;

		if (currentExpanded) {
			animateAccordionExpand(contentElement);
		} else {
			animateAccordionCollapse(contentElement);
		}
	});
</script>

<div
	bind:this={contentElement}
	id={`accordion-content-${itemContext.id}`}
	role="region"
	aria-labelledby={`accordion-trigger-${itemContext.id}`}
	class={cn(
		'text-sm',
		!isExpanded && 'h-0 overflow-hidden opacity-0',
		className
	)}
	style={isExpanded ? 'height: auto;' : 'height: 0; overflow: hidden; opacity: 0;'}
>
	<div class="pb-4 pt-0">
		{@render children?.()}
	</div>
</div>
