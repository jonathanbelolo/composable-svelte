<script lang="ts">
	import { tick } from 'svelte';
	import { animateAccordionExpand, animateAccordionCollapse } from '../../../animation/animate.js';
	import { getCollapsibleContext } from './Collapsible.svelte';
	import { cn } from '../../../utils.js';

	/**
	 * CollapsibleContent component - Collapsible content section.
	 *
	 * Uses centralized animation system for smooth expand/collapse animations.
	 * Content is mounted while expanded *and* for the duration of the collapse,
	 * then unmounted — see `renderContent` below.
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
	// Not $state: the effect below reads and writes this. A reactive guard
	// re-triggers the effect it lives in (effect_update_depth_exceeded).
	let previousExpandedState = $store.isExpanded;

	// What the markup renders, deliberately lagging `isExpanded` on the way out.
	//
	// The `{#if}` used to test `$store.isExpanded` directly, from *inside* the
	// element this component animates. Svelte empties the element during the DOM
	// update, and the `$effect` runs afterwards — so `animateAccordionCollapse`
	// measured `scrollHeight` on an empty box, got ~0, and animated 0 → 0. The
	// content just vanished. Measured before the fix: five consecutive height
	// samples of exactly 0.
	//
	// Accordion never had this because its content is always rendered; expanding
	// was never broken here either, since the content is already mounted by the
	// time the effect runs.
	//
	// This is invariant 5 in guides/ANIMATION-GUIDELINES.md.
	let renderContent = $state($store.isExpanded);

	// Animate expand/collapse when isExpanded changes
	$effect(() => {
		const isExpanded = $store.isExpanded;

		// Skip animation on initial render
		if (previousExpandedState === isExpanded) {
			return;
		}

		previousExpandedState = isExpanded;

		if (isExpanded) {
			// Mount first, measure second. Both helpers size themselves from
			// `scrollHeight`, so the content has to be in the DOM before either
			// runs — `tick()` is what guarantees that.
			renderContent = true;
			tick().then(() => {
				if (contentElement && $store.isExpanded) animateAccordionExpand(contentElement);
			});
			return;
		}

		if (!contentElement) return;

		// Unmount only once the collapse has finished, so the measurement it makes
		// has something to measure.
		animateAccordionCollapse(contentElement).then(() => {
			if (!$store.isExpanded) renderContent = false;
		});
	});
</script>

<div
	bind:this={contentElement}
	id={contentId}
	role="region"
	aria-labelledby={triggerId}
	class={cn(
		'text-sm',
		!$store.isExpanded && 'h-0 overflow-hidden opacity-0',
		className
	)}
	style={$store.isExpanded ? 'height: auto;' : 'height: 0; overflow: hidden; opacity: 0;'}
>
	{#if renderContent}
		<div class="pb-4 pt-0">
			{@render children?.()}
		</div>
	{/if}
</div>
