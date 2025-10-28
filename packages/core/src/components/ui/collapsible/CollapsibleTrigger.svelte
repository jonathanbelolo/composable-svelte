<script lang="ts">
	import { getCollapsibleContext } from './Collapsible.svelte';
	import { cn } from '$lib/utils.js';

	/**
	 * CollapsibleTrigger component - Clickable trigger for collapsible.
	 *
	 * Displays a button with a chevron icon that rotates based on expand state.
	 * Dispatches 'toggled' action when clicked.
	 *
	 * @example
	 * ```svelte
	 * <CollapsibleTrigger>
	 *   Click to expand
	 * </CollapsibleTrigger>
	 * ```
	 */

	interface CollapsibleTriggerProps {
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
	}: CollapsibleTriggerProps = $props();

	const context = getCollapsibleContext();
	const { store, contentId, triggerId } = context;

	function handleClick() {
		if (store.state.disabled) return;
		store.dispatch({ type: 'toggled' });
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (store.state.disabled) return;

		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			store.dispatch({ type: 'toggled' });
		}
	}
</script>

<button
	type="button"
	id={triggerId}
	class={cn(
		'flex w-full items-center justify-between py-4 text-sm font-medium',
		'transition-all hover:underline',
		store.state.disabled ? 'cursor-not-allowed' : 'cursor-pointer',
		className
	)}
	aria-expanded={store.state.isExpanded}
	aria-controls={contentId}
	disabled={store.state.disabled}
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
			store.state.isExpanded && 'rotate-180'
		)}
	>
		<polyline points="6 9 12 15 18 9"></polyline>
	</svg>
</button>
