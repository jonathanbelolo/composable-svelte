<script lang="ts">
	import { createStore } from '../../../store.js';
	import { tooltipReducer } from './tooltip.reducer.js';
	import { initialTooltipState } from './tooltip.types.js';
	import TooltipPrimitive from './TooltipPrimitive.svelte';
	import type { Snippet } from 'svelte';

	/**
	 * Tooltip component - Hover-triggered tooltip with state-based animations.
	 *
	 * Uses Composable Architecture pattern with reducer and store for
	 * coordinated animations and state management.
	 *
	 * @example
	 * ```svelte
	 * <Tooltip content="Click to save">
	 *   <button>Save</button>
	 * </Tooltip>
	 * ```
	 */

	interface TooltipProps {
		/**
		 * Tooltip content (string).
		 */
		content: string;

		/**
		 * Tooltip position relative to trigger element.
		 * @default 'top'
		 */
		position?: 'top' | 'bottom' | 'left' | 'right';

		/**
		 * Delay before showing tooltip (ms).
		 * @default 300
		 */
		delay?: number;

		/**
		 * Additional CSS classes for the tooltip container.
		 */
		class?: string;

		/**
		 * Disable tooltip.
		 * @default false
		 */
		disabled?: boolean;

		/**
		 * Trigger element (wrapped children).
		 */
		children: Snippet;
	}

	let {
		content,
		position = 'top',
		delay = 300,
		class: className,
		disabled = false,
		children
	}: TooltipProps = $props();

	// Create tooltip store with reducer
	const store = createStore({
		initialState: initialTooltipState,
		reducer: tooltipReducer,
		dependencies: { hoverDelay: delay }
	});

	// Subscribe to store for reactivity
	const state = $derived($store);

	// Reference to the wrapper element (which contains the trigger)
	let wrapperElement: HTMLElement | null = $state(null);

	// Get the actual trigger element (first child of wrapper)
	const triggerElement = $derived(
		wrapperElement?.children[0] as HTMLElement | null ?? null
	);

	function handleMouseEnter() {
		if (disabled) return;
		store.dispatch({ type: 'hoverStarted', content });
	}

	function handleMouseLeave() {
		if (disabled) return;
		store.dispatch({ type: 'hoverEnded' });
	}

	function handlePresentationComplete() {
		store.dispatch({
			type: 'presentation',
			event: { type: 'presentationCompleted' }
		});
	}

	function handleDismissalComplete() {
		store.dispatch({
			type: 'presentation',
			event: { type: 'dismissalCompleted' }
		});
	}
</script>

<div
	bind:this={wrapperElement}
	class="relative inline-flex"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	onfocus={handleMouseEnter}
	onblur={handleMouseLeave}
>
	<!-- Trigger element -->
	{@render children()}
</div>

<!-- Tooltip (rendered outside wrapper with fixed positioning) -->
<TooltipPrimitive
	presentation={state.presentation}
	{triggerElement}
	{position}
	class={className}
	onPresentationComplete={handlePresentationComplete}
	onDismissalComplete={handleDismissalComplete}
/>
