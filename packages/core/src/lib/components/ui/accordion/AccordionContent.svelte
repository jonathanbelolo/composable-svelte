<script lang="ts">
	import type { Snippet } from 'svelte';
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

		/**
		 * Content snippet.
		 */
		children?: Snippet;
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

	// The resting appearance, captured once and never reactive.
	//
	// This element has exactly one author for height, opacity and overflow after
	// mount: Motion One. It used to have three. A reactive style attribute
	// compiles to `set_style`, which assigns `cssText` — a total wipe of every
	// inline style Motion had written — and it fires exactly on an expand or
	// collapse, i.e. while an animation is starting or being interrupted. The
	// Tailwind height/overflow/opacity utilities were a third author, and an
	// unreliable one: `cn` is `twMerge`, so a consumer className setting its own
	// height deletes them outright.
	//
	// They cannot simply be dropped, either: `$effect` does not run on the server,
	// so without a declarative resting value a collapsed section is sent at full
	// height anywhere Tailwind is not compiled. Bound per-property below, which
	// Svelte diffs rather than rebuilding — and since this never changes, it is
	// written once and then left to Motion One.
	// svelte-ignore state_referenced_locally
	// Capturing the initial value is the point — see above. The lint is right that
	// this does not track; that is what makes it a one-time placement the server
	// can render and Motion One can then own.
	const initialContentStyle = isExpanded
		? { height: 'auto', overflow: undefined, opacity: undefined }
		: { height: '0px', overflow: 'hidden', opacity: '0' };
</script>

<div
	bind:this={contentElement}
	id={`accordion-content-${itemContext.id}`}
	role="region"
	aria-labelledby={`accordion-trigger-${itemContext.id}`}
	class={cn('text-sm', className)}
	style:height={initialContentStyle.height}
	style:overflow={initialContentStyle.overflow}
	style:opacity={initialContentStyle.opacity}
>
	<div class="pb-4 pt-0">
		{@render children?.()}
	</div>
</div>
