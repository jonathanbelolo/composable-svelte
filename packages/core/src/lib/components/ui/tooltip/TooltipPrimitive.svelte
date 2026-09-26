<script lang="ts">
	import { cn } from '../../../utils.js';
	import { animateTooltipIn, animateTooltipOut } from '../../../animation/animate.js';
	import type { PresentationState } from '../../../navigation/types.js';
	import { untrack, type Snippet } from 'svelte';

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
		 * Reference to the trigger element for positioning
		 */
		triggerElement: HTMLElement | null;

		/**
		 * Callback when presentation animation completes
		 */
		onPresentationComplete?: (() => void) | undefined;

		/**
		 * Callback when dismissal animation completes
		 */
		onDismissalComplete?: (() => void) | undefined;

		/**
		 * Tooltip position relative to trigger
		 * @default 'top'
		 */
		position?: 'top' | 'bottom' | 'left' | 'right' | undefined;

		/**
		 * Additional CSS classes
		 */
		class?: string | undefined;
	}

	let {
		presentation,
		triggerElement,
		onPresentationComplete,
		onDismissalComplete,
		position = 'top',
		class: className
	}: TooltipPrimitiveProps = $props();

	let tooltipElement: HTMLElement | null = $state(null);
	let tooltipTop = $state(0);
	let tooltipLeft = $state(0);

	// Calculate dynamic position based on trigger element's bounding rect
	function updateTooltipPosition() {
		if (!tooltipElement || !triggerElement) return;

		const triggerRect = triggerElement.getBoundingClientRect();
		const tooltipRect = tooltipElement.getBoundingClientRect();
		const gap = 8; // Gap between trigger and tooltip (0.5rem)

		let top = 0;
		let left = 0;

		switch (position) {
			case 'top':
				top = triggerRect.top - tooltipRect.height - gap;
				left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
				break;

			case 'bottom':
				top = triggerRect.bottom + gap;
				left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
				break;

			case 'left':
				top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
				left = triggerRect.left - tooltipRect.width - gap;
				break;

			case 'right':
				top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
				left = triggerRect.right + gap;
				break;
		}

		// Ensure tooltip stays within viewport bounds
		const padding = 8;
		top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));
		left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));

		tooltipTop = top;
		tooltipLeft = left;
	}

	const animationPhase = $derived(presentation.status);

	// Watch phase changes, not caller callback identities or positioning props.
	$effect(() => {
		if (!tooltipElement) return;
		let active = true;
		const presented = untrack(() => onPresentationComplete);
		const dismissed = untrack(() => onDismissalComplete);

		if (animationPhase === 'presenting') {
			// Calculate position before animating in
			untrack(updateTooltipPosition);

			// Animate in
			animateTooltipIn(tooltipElement).then(() => {
				if (active) presented?.();
			});
		} else if (animationPhase === 'dismissing') {
			// Animate out
			animateTooltipOut(tooltipElement).then(() => {
				if (active) dismissed?.();
			});
		}
		return () => { active = false; };
	});

	// Update position when trigger element changes or window resizes
	$effect(() => {
		if (!shouldShow || !triggerElement || !tooltipElement) return;

		updateTooltipPosition();

		// Update position on scroll or resize
		const handlePositionUpdate = () => updateTooltipPosition();
		window.addEventListener('scroll', handlePositionUpdate, true);
		window.addEventListener('resize', handlePositionUpdate);

		return () => {
			window.removeEventListener('scroll', handlePositionUpdate, true);
			window.removeEventListener('resize', handlePositionUpdate);
		};
	});

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

	// Narrowing does not survive the boolean above, so derive the content too.
	const content = $derived(presentation.status === 'idle' ? null : presentation.content);
</script>

{#if shouldShow}
	<!-- Keep the opacity attribute static: position updates must preserve Motion-owned styles. -->
	<div
		bind:this={tooltipElement}
		class={cn(
			'fixed z-50 px-3 py-1.5 text-sm rounded-md',
			'bg-popover text-popover-foreground',
			'border border-border shadow-md',
			'pointer-events-none whitespace-nowrap',
			className
		)}
		role="tooltip"
		data-state={presentation.status}
		style="opacity: 0;"
		style:top={`${tooltipTop}px`}
		style:left={`${tooltipLeft}px`}
	>
		{content}

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
