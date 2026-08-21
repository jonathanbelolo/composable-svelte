<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getAccordionContext } from './Accordion.svelte';
	import { getAccordionItemContext } from './AccordionItem.svelte';
	import { cn } from '../../../utils.js';
	import { animateChevron } from '../../../animation/animate.js';

	/**
	 * AccordionTrigger component - Clickable header for accordion item.
	 *
	 * @example
	 * ```svelte
	 * <AccordionTrigger>
	 *   Section Title
	 * </AccordionTrigger>
	 * ```
	 */

	interface AccordionTriggerProps {
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
	}: AccordionTriggerProps = $props();

	const store = getAccordionContext();
	const itemContext = getAccordionItemContext();

	// Read isExpanded directly from store, not from context (context is not reactive!)
	const isExpanded = $derived($store.expandedIds.includes(itemContext.id));

	function handleClick() {
		if (itemContext.disabled) return;
		store.dispatch({ type: 'itemToggled', id: itemContext.id });
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (itemContext.disabled) return;

		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			store.dispatch({ type: 'itemToggled', id: itemContext.id });
		}
	}

	// Rotate the chevron on the same timeline as the content it discloses.
	//
	// A utility-class transition here would be a second, unrelated timeline next
	// to `animateAccordionExpand` — and, because Tailwind is not compiled under
	// test, an unobservable one. The guard is a plain `let`: the effect reads and
	// writes it, and a reactive guard re-triggers the effect it lives in
	// (`effect_update_depth_exceeded`).
	let chevronElement: SVGElement | null = $state(null);
	let lastRotated: boolean | undefined = undefined;

	$effect(() => {
		const expanded = isExpanded;
		if (!chevronElement || lastRotated === expanded) return;
		const first = lastRotated === undefined;
		lastRotated = expanded;
		if (first) {
			// Nothing to animate on the first run — land on the angle rather than
			// spinning a chevron that has only just mounted.
			chevronElement.style.transform = expanded ? 'rotate(180deg)' : 'rotate(0deg)';
			return;
		}
		animateChevron(chevronElement, expanded);
	});
</script>

<button
	type="button"
	class={cn(
		'flex w-full items-center justify-between py-4 text-sm font-medium',
		'transition-all hover:underline',
		itemContext.disabled ? 'cursor-not-allowed' : 'cursor-pointer',
		className
	)}
	aria-expanded={isExpanded}
	aria-controls={`accordion-content-${itemContext.id}`}
	disabled={itemContext.disabled}
	onclick={handleClick}
	onkeydown={handleKeyDown}
>
	<span class="text-left">
		{@render children?.()}
	</span>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		bind:this={chevronElement}
		data-disclosure-chevron
		class="shrink-0"
	>
		<polyline points="6 9 12 15 18 9"></polyline>
	</svg>
</button>
