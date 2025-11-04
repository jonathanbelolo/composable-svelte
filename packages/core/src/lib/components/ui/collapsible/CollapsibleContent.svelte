<script lang="ts">
	import { animateAccordionExpand, animateAccordionCollapse } from '../../../animation/animate.js';
	import { getCollapsibleContext } from './Collapsible.svelte';
	import { cn } from '../../../utils.js';

	/**
	 * CollapsibleContent component - Collapsible content section.
	 *
	 * Uses centralized animation system for smooth expand/collapse animations.
	 * Only renders content when expanded for performance.
	 *
	 * @example
	 * ```svelte
	 * <CollapsibleContent>
	 *   This is the content that will expand and collapse.
	 * </CollapsibleContent>
	 * ```
	 */

	interface CollapsibleContentProps {
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
		class: className,
		children
	}: CollapsibleContentProps = $props();

	const context = getCollapsibleContext();
	const { store, contentId, triggerId } = context;

	let contentElement: HTMLDivElement | null = $state(null);
	let previousExpandedState = $state(store.state.isExpanded);

	// Animate expand/collapse when isExpanded changes
	$effect(() => {
		const isExpanded = store.state.isExpanded;

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
	id={contentId}
	role="region"
	aria-labelledby={triggerId}
	class={cn(
		'text-sm',
		!store.state.isExpanded && 'h-0 overflow-hidden opacity-0',
		className
	)}
	style={store.state.isExpanded ? 'height: auto;' : 'height: 0; overflow: hidden; opacity: 0;'}
>
	{#if store.state.isExpanded}
		<div class="pb-4 pt-0">
			{@render children?.()}
		</div>
	{/if}
</div>
