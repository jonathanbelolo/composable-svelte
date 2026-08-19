<script lang="ts">
	import { createStore } from '../../../store.svelte.js';
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
		// Getter for the same reason as FileUpload: a literal would freeze the
		// mount-time delay and ignore later changes to the prop.
		dependencies: {
			get hoverDelay() {
				return delay;
			}
		}
	});

	// Subscribe to store for reactivity
	const tooltipState = $derived($store);

	// Reference to the wrapper element (which contains the trigger)
	let wrapperElement: HTMLElement | null = $state(null);

	// Get the actual trigger element (first child of wrapper)
	// `$derived.by` rather than `$derived`: the latter is an inline expression, so
	// `wrapperElement` is still control-flow-narrowed to its `null` initialiser
	// there — only `bind:this` ever assigns it.
	const triggerElement = $derived.by(
		() => (wrapperElement?.firstElementChild as HTMLElement | null) ?? null
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

<!-- This wrapper only positions the tooltip; the real trigger is the caller's
     own element, rendered via `children`. Giving the wrapper an interactive
     role would misdescribe it and simply trade this warning for another. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={wrapperElement}
	class="relative inline-flex"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	onfocusin={handleMouseEnter}
	onfocusout={handleMouseLeave}
>
	<!-- Trigger element -->
	{@render children()}
</div>

<!-- Tooltip (rendered outside wrapper with fixed positioning) -->
<TooltipPrimitive
	presentation={tooltipState.presentation}
	{triggerElement}
	{position}
	class={className}
	onPresentationComplete={handlePresentationComplete}
	onDismissalComplete={handleDismissalComplete}
/>
