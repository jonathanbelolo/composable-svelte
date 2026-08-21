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

	// Captured once, never reactive — this is the element's position *before* any
	// animation, and it is the only thing the server can emit. `$effect` does not
	// run during SSR, so a purely effect-driven transform renders every chevron
	// unrotated on the server and pops on hydration. Verified by compiling with
	// `generate: 'server'`.
	//
	// Because it never changes, Svelte writes it once and then leaves the property
	// alone, which keeps invariant 6 (one property, one author): the markup places,
	// Motion One animates.
	// svelte-ignore state_referenced_locally
	// Capturing the initial value is the entire point — see above. The lint is
	// right that this does not track; that is what makes it a one-time placement
	// the server can render and Motion One can then own.
	const initialChevronTransform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';

	let chevronElement: SVGElement | null = $state(null);
	let lastRotated: boolean | undefined = undefined;

	$effect(() => {
		const expanded = isExpanded;
		if (!chevronElement || lastRotated === expanded) return;
		const first = lastRotated === undefined;
		lastRotated = expanded;
		if (first) {
			// Placement is the markup's job (see `initialChevronTransform`); the
			// first run only seeds the guard, so a chevron that mounts already open
			// does not spin on arrival.
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
		style:transform={initialChevronTransform}
		class="shrink-0"
	>
		<polyline points="6 9 12 15 18 9"></polyline>
	</svg>
</button>
