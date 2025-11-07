<script lang="ts">
	/**
	 * Cursor Marker
	 *
	 * Visual marker showing where another user's cursor is.
	 * Shows user name on hover.
	 */

	interface Props {
		/** User name */
		name: string;
		/** User color */
		color: string;
		/** Position from left (pixels) */
		left: number;
		/** Position from top (pixels) */
		top: number;
		/** Whether this cursor has a selection */
		hasSelection?: boolean;
		/** Selection width (pixels) */
		selectionWidth?: number;
		/** Custom class */
		class?: string;
	}

	let {
		name,
		color,
		left,
		top,
		hasSelection = false,
		selectionWidth = 0,
		class: className = ''
	}: Props = $props();
</script>

<div
	class="cursor-marker {className}"
	style="left: {left}px; top: {top}px;"
	title={name}
>
	<!-- Selection highlight (if user has text selected) -->
	{#if hasSelection && selectionWidth > 0}
		<div
			class="selection-highlight"
			style="background-color: {color}33; width: {selectionWidth}px;"
		></div>
	{/if}

	<!-- Cursor line -->
	<div class="cursor-line" style="background-color: {color};"></div>

	<!-- User label -->
	<div class="cursor-label" style="background-color: {color};">
		{name}
	</div>
</div>

<style>
	.cursor-marker {
		position: absolute;
		pointer-events: none;
		z-index: 100;
		animation: cursor-fade-in 0.2s ease-out;
	}

	@keyframes cursor-fade-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.selection-highlight {
		position: absolute;
		top: 0;
		left: 0;
		height: 24px;
		border-radius: 2px;
	}

	.cursor-line {
		position: absolute;
		width: 2px;
		height: 24px;
		animation: cursor-blink 1s step-end infinite;
	}

	@keyframes cursor-blink {
		0%,
		50% {
			opacity: 1;
		}
		51%,
		100% {
			opacity: 0.3;
		}
	}

	.cursor-label {
		position: absolute;
		top: -24px;
		left: 0;
		padding: 2px 6px;
		border-radius: 4px 4px 4px 0;
		font-size: 11px;
		font-weight: 600;
		color: white;
		white-space: nowrap;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		opacity: 0;
		transition: opacity 0.2s;
	}

	.cursor-marker:hover .cursor-label {
		opacity: 1;
	}

	/* Show label initially, then fade out */
	.cursor-marker {
		animation:
			cursor-fade-in 0.2s ease-out,
			cursor-label-show 3s ease-out;
	}

	@keyframes cursor-label-show {
		0% {
			--label-opacity: 1;
		}
		80% {
			--label-opacity: 1;
		}
		100% {
			--label-opacity: 0;
		}
	}

	/* Use CSS custom property for initial label visibility */
	.cursor-marker .cursor-label {
		opacity: var(--label-opacity, 0);
	}
</style>
