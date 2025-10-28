<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { animateTooltipIn, animateTooltipOut } from '../../../animation/animate.js';
	import type { PresentationState } from '../../../navigation/types.js';
	import type { Snippet } from 'svelte';

	/**
	 * TooltipPrimitive - Animation-driven tooltip display
	 *
	 * Watches presentation state and triggers animations via Motion One.
	 * This is the low-level primitive - use Tooltip.svelte for most cases.
	 */

	interface TooltipPrimitiveProps {
		/**
		 * Presentation state from tooltip reducer
		 */
		presentation: PresentationState<string>;

		/**
		 * Callback when presentation animation completes
		 */
		onPresentationComplete?: () => void;

		/**
		 * Callback when dismissal animation completes
		 */
		onDismissalComplete?: () => void;

		/**
		 * Tooltip position relative to trigger
		 * @default 'top'
		 */
		position?: 'top' | 'bottom' | 'left' | 'right';

		/**
		 * Additional CSS classes
		 */
		class?: string;
	}

	let {
		presentation,
		onPresentationComplete,
		onDismissalComplete,
		position = 'top',
		class: className
	}: TooltipPrimitiveProps = $props();

	let tooltipElement: HTMLElement | null = $state(null);

	// Watch presentation state and trigger animations
	$effect(() => {
		if (!tooltipElement) return;

		if (presentation.status === 'presenting') {
			// Animate in
			animateTooltipIn(tooltipElement).then(() => {
				onPresentationComplete?.();
			});
		} else if (presentation.status === 'dismissing') {
			// Animate out
			animateTooltipOut(tooltipElement).then(() => {
				onDismissalComplete?.();
			});
		}
	});

	// Position classes based on position prop
	const positionClasses = $derived({
		top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
		bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
		left: 'right-full top-1/2 -translate-y-1/2 mr-2',
		right: 'left-full top-1/2 -translate-y-1/2 ml-2'
	}[position]);

	// Arrow position classes
	const arrowClasses = $derived({
		top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-popover',
		bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-popover',
		left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-popover',
		right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-popover'
	}[position]);

	// Show tooltip when presenting or presented
	const shouldShow = $derived(
		presentation.status === 'presenting' ||
		presentation.status === 'presented' ||
		presentation.status === 'dismissing'
	);
</script>

{#if shouldShow}
	<div
		bind:this={tooltipElement}
		class={cn(
			'absolute z-50 px-3 py-1.5 text-sm rounded-md',
			'bg-popover text-popover-foreground',
			'border border-border shadow-md',
			'pointer-events-none whitespace-nowrap',
			positionClasses,
			className
		)}
		role="tooltip"
		style="opacity: 0;"
	>
		{presentation.content}

		<!-- Arrow -->
		<div
			class={cn(
				'absolute w-0 h-0',
				'border-4',
				arrowClasses
			)}
		></div>
	</div>
{/if}
