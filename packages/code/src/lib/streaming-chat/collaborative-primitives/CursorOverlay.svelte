<script lang="ts">
	/**
	 * Cursor Overlay
	 *
	 * Overlays cursor markers on top of an input field to show
	 * where other users are typing in real-time.
	 */

	import { onMount } from 'svelte';
	import CursorMarker from './CursorMarker.svelte';

	interface Cursor {
		userId: string;
		name: string;
		color: string;
		position: number;
		selectionLength: number;
	}

	interface Props {
		/** Input element to overlay cursors on */
		inputElement: HTMLInputElement | HTMLTextAreaElement;
		/** Array of cursor positions */
		cursors: Cursor[];
		/** Current text content (to calculate positions) */
		text: string;
		/** Custom class */
		class?: string;
	}

	let { inputElement, cursors, text, class: className = '' }: Props = $props();

	let overlayElement: HTMLDivElement;
	let cursorPositions: Map<
		string,
		{ left: number; top: number; selectionWidth: number }
	> = $state(new Map());

	// Calculate pixel position for a cursor
	function calculateCursorPosition(
		position: number,
		selectionLength: number
	): { left: number; top: number; selectionWidth: number } {
		if (!inputElement) {
			return { left: 0, top: 0, selectionWidth: 0 };
		}

		// Create a temporary span to measure text width
		const measureSpan = document.createElement('span');
		measureSpan.style.cssText = `
			position: absolute;
			visibility: hidden;
			white-space: pre;
			font-family: ${window.getComputedStyle(inputElement).fontFamily};
			font-size: ${window.getComputedStyle(inputElement).fontSize};
			font-weight: ${window.getComputedStyle(inputElement).fontWeight};
			letter-spacing: ${window.getComputedStyle(inputElement).letterSpacing};
		`;

		document.body.appendChild(measureSpan);

		// Measure text up to cursor position
		const textBeforeCursor = text.slice(0, position);
		measureSpan.textContent = textBeforeCursor;
		const left = measureSpan.offsetWidth;

		// Measure selection width if any
		let selectionWidth = 0;
		if (selectionLength > 0) {
			const selectedText = text.slice(position, position + selectionLength);
			measureSpan.textContent = selectedText;
			selectionWidth = measureSpan.offsetWidth;
		}

		document.body.removeChild(measureSpan);

		// Get input padding
		const paddingLeft = parseInt(window.getComputedStyle(inputElement).paddingLeft) || 0;
		const paddingTop = parseInt(window.getComputedStyle(inputElement).paddingTop) || 0;

		return {
			left: left + paddingLeft,
			top: paddingTop,
			selectionWidth
		};
	}

	// Update cursor positions when cursors or text changes
	$effect(() => {
		const newPositions = new Map();

		for (const cursor of cursors) {
			const pos = calculateCursorPosition(cursor.position, cursor.selectionLength);
			newPositions.set(cursor.userId, pos);
		}

		cursorPositions = newPositions;
	});

	// Update overlay position when input scrolls
	function updateOverlayPosition() {
		if (!inputElement || !overlayElement) return;

		const rect = inputElement.getBoundingClientRect();
		overlayElement.style.left = `${rect.left}px`;
		overlayElement.style.top = `${rect.top}px`;
		overlayElement.style.width = `${rect.width}px`;
		overlayElement.style.height = `${rect.height}px`;
	}

	onMount(() => {
		// Initial position
		updateOverlayPosition();

		// Update on scroll and resize
		window.addEventListener('scroll', updateOverlayPosition, true);
		window.addEventListener('resize', updateOverlayPosition);

		// Update when input changes
		const resizeObserver = new ResizeObserver(updateOverlayPosition);
		resizeObserver.observe(inputElement);

		return () => {
			window.removeEventListener('scroll', updateOverlayPosition, true);
			window.removeEventListener('resize', updateOverlayPosition);
			resizeObserver.disconnect();
		};
	});
</script>

<div bind:this={overlayElement} class="cursor-overlay {className}">
	{#each cursors as cursor (cursor.userId)}
		{@const position = cursorPositions.get(cursor.userId)}
		{#if position}
			<CursorMarker
				name={cursor.name}
				color={cursor.color}
				left={position.left}
				top={position.top}
				hasSelection={cursor.selectionLength > 0}
				selectionWidth={position.selectionWidth}
			/>
		{/if}
	{/each}
</div>

<style>
	.cursor-overlay {
		position: fixed;
		pointer-events: none;
		z-index: 1000;
		overflow: hidden;
	}
</style>
