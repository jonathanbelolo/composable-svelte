<script lang="ts">
	import { animateAccordionExpand, animateAccordionCollapse } from '../../../animation/animate.js';
	import { getAccordionItemContext } from './AccordionItem.svelte';
	import { cn } from '../../../lib/utils.js';

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

	let contentElement: HTMLDivElement | null = $state(null);
	let previousExpandedState = $state(itemContext.isExpanded);

	// Animate expand/collapse when isExpanded changes
	$effect(() => {
		const isExpanded = itemContext.isExpanded;

		// Skip animation on initial render
		if (previousExpandedState === isExpanded) {
			return;
		}

		previousExpandedState = isExpanded;

		if (!contentElement) return;

		if (isExpanded) {
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
		!itemContext.isExpanded && 'h-0 overflow-hidden opacity-0',
		className
	)}
	style={itemContext.isExpanded ? 'height: auto;' : 'height: 0; overflow: hidden; opacity: 0;'}
>
	<div class="pb-4 pt-0">
		{@render children?.()}
	</div>
</div>
