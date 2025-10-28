<script lang="ts">
	import { getAccordionContext } from './Accordion.svelte';
	import { getAccordionItemContext } from './AccordionItem.svelte';
	import { cn } from '$lib/utils.js';

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
	}

	let {
		class: className,
		children
	}: AccordionTriggerProps = $props();

	const store = getAccordionContext();
	const itemContext = getAccordionItemContext();

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
</script>

<button
	type="button"
	class={cn(
		'flex w-full items-center justify-between py-4 text-sm font-medium',
		'transition-all hover:underline',
		itemContext.disabled ? 'cursor-not-allowed' : 'cursor-pointer',
		className
	)}
	aria-expanded={itemContext.isExpanded}
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
		class={cn(
			'shrink-0 transition-transform duration-200',
			itemContext.isExpanded && 'rotate-180'
		)}
	>
		<polyline points="6 9 12 15 18 9"></polyline>
	</svg>
</button>
