<script lang="ts">
	/**
	 * Cursor Marker
	 *
	 * Visual marker showing where another user's cursor is: a blinking caret in
	 * the user's colour, with a name flag hanging above it.
	 *
	 * The flag is **always visible**, not shown on hover. `CursorOverlay` floats
	 * this over a live text input, so the marker must not take pointer events —
	 * intercepting one would stop the user typing. That rules out hover, and it
	 * rules out `title` too, which is why neither is here.
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
		hasSelection?: boolean | undefined;
		/** Selection width (pixels) */
		selectionWidth?: number | undefined;
		/** Custom class */
		class?: string | undefined;
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

<div class="cursor-marker {className}" style="left: {left}px; top: {top}px;">
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
		/* Unclickable by design — see the note at the top of this file. */
		pointer-events: none;
		z-index: 100;
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
		/* Hangs above the caret; the squared bottom-left corner is its tail.
		   `CursorOverlay` reserves exactly this much room above the input, or
		   its `overflow: hidden` scissors the flag off. */
		top: -24px;
		left: 0;
		padding: 2px 6px;
		border-radius: 4px 4px 4px 0;
		font-size: 11px;
		font-weight: 600;
		color: white;
		white-space: nowrap;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}
</style>
