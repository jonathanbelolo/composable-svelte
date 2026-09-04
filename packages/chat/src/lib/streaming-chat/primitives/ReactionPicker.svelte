<script lang="ts">
	/**
	 * ReactionPicker Component
	 *
	 * Quick emoji picker popover for adding reactions to messages.
	 * Shows default reaction set in a compact layout.
	 */
	import type { PresentationState } from '@composable-svelte/core';
	import {
		animateBackdropIn,
		animateBackdropOut,
		animatePopoverIn,
		animatePopoverOut
	} from '@composable-svelte/core/animation';
	import { DEFAULT_REACTIONS } from '../types.js';

	interface Props {
		/** Whether the picker is open */
		open: boolean;
		/** Click handler when emoji is selected */
		onselect?: ((emoji: string) => void) | undefined;
		/** Close handler */
		onclose?: (() => void) | undefined;
		/** Optional class name */
		class?: string | undefined;
		/**
		 * Animation lifecycle, when a store owns one. Left undefined the picker
		 * appears and disappears instantly, as it did before it could animate.
		 */
		presentation?: PresentationState<string> | undefined;
		onPresentationComplete?: (() => void) | undefined;
		onDismissalComplete?: (() => void) | undefined;
	}

	let {
		open,
		onselect,
		onclose,
		class: className = '',
		presentation = undefined,
		onPresentationComplete = undefined,
		onDismissalComplete = undefined
	}: Props = $props();

	// The element must outlive `open` so the exit has something to animate.
	const visible = $derived(open || presentation?.status === 'dismissing');

	// Refused until the entrance finishes, mirroring the reducer's guards. With
	// no `presentation` there is no entrance to wait for, so a standalone mount
	// stays fully interactive.
	const interactive = $derived(presentation ? presentation.status === 'presented' : true);

	let backdropElement: HTMLDivElement | undefined = $state();
	let pickerElement: HTMLDivElement | undefined = $state();

	// The (status, content) pair, in a plain `let` — a reactive guard would
	// re-trigger the effect it lives in, and keying on "have I animated yet"
	// deadlocks anything mounted already `presented`.
	let lastAnimated: { status: string; content: unknown } | null = null;

	$effect(() => {
		if (!presentation || !backdropElement || !pickerElement) return;

		if (presentation.status === 'idle') {
			lastAnimated = null;
			return;
		}

		const { status, content } = presentation;
		if (lastAnimated?.status === status && lastAnimated.content === content) return;
		lastAnimated = { status, content };

		if (status === 'presenting') {
			Promise.all([
				animateBackdropIn(backdropElement),
				animatePopoverIn(pickerElement)
			]).then(() => queueMicrotask(() => onPresentationComplete?.()));
		}

		if (status === 'dismissing') {
			Promise.all([
				animateBackdropOut(backdropElement),
				animatePopoverOut(pickerElement)
			]).then(() => queueMicrotask(() => onDismissalComplete?.()));
		}
	});

	let previouslyFocused: HTMLElement | null = null;

	// Without this the backdrop is never focused, so `onkeydown` never fires and
	// Escape does nothing. The picker is opened from a button outside its own
	// subtree — `ChatMessage`'s add-reaction control, or the context menu — and
	// neither moves focus, so the keydown went to the still-focused trigger.
	//
	// This is the same defect that was found and fixed in
	// `AttachmentPreviewModal`, one file over, complete with a comment explaining
	// it; the picker was rewritten in the same pass and did not get it. The
	// `a11y_no_static_element_interactions` suppression on the markup was
	// silencing the exact warning that points at it.
	//
	// Keyed on `visible`, not `open`: focus is taken as soon as the element
	// exists and restored on unmount, so a dismissal that is still animating does
	// not snap focus back to the trigger while the overlay is still up.
	$effect(() => {
		if (!visible || !backdropElement) return;
		previouslyFocused = document.activeElement as HTMLElement | null;
		backdropElement.focus();
		return () => previouslyFocused?.focus();
	});

	// Handle escape key
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && interactive) {
			onclose?.();
		}
	}

	// Handle backdrop click
	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget && interactive) {
			onclose?.();
		}
	}

	function handleEmojiClick(emoji: string) {
		if (!interactive) return;
		onselect?.(emoji);
		onclose?.();
	}
</script>

{#if visible}
	<!-- `tabindex="-1"` is load-bearing, not decoration: it is what lets the
	     effect above focus this element, which is what lets `onkeydown` fire. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={backdropElement}
		class="reaction-picker-backdrop"
		tabindex="-1"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		<div bind:this={pickerElement} class="reaction-picker {className}">
			<div class="reaction-picker__header">
				<span class="reaction-picker__title">React</span>
				<button
					type="button"
					class="reaction-picker__close"
					onclick={onclose}
					aria-label="Close"
				>
					✕
				</button>
			</div>
			<div class="reaction-picker__emojis">
				{#each DEFAULT_REACTIONS as emoji}
					<button
						type="button"
						class="reaction-picker__emoji"
						onclick={() => handleEmojiClick(emoji)}
						aria-label="React with {emoji}"
					>
						{emoji}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.reaction-picker-backdrop:focus {
		/* Focused only so it can hear Escape; it is not a control. */
		outline: none;
	}

	.reaction-picker-backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: transparent;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.reaction-picker {
		background: hsl(var(--background, 0 0% 100%));
		border: 1px solid hsl(var(--border, 0 0% 87.8%));
		border-radius: 12px;
		box-shadow:
			0 4px 6px rgba(0, 0, 0, 0.1),
			0 10px 25px rgba(0, 0, 0, 0.15);
		padding: 8px;
		min-width: 200px;
	}


	.reaction-picker__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 8px;
		margin-bottom: 4px;
	}

	.reaction-picker__title {
		font-size: 12px;
		font-weight: 600;
		color: hsl(var(--muted-foreground, 0 0% 40%));
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.reaction-picker__close {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground, 0 0% 60%));
		font-size: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.reaction-picker__close:hover {
		background: hsl(var(--muted, 0 0% 96.1%));
		color: hsl(var(--foreground, 0 0% 20%));
	}

	.reaction-picker__emojis {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 4px;
	}

	.reaction-picker__emoji {
		width: 44px;
		height: 44px;
		background: transparent;
		border: none;
		border-radius: 8px;
		font-size: 24px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		/* Ensure emoji render with proper font */
		font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji',
			sans-serif;
	}

	.reaction-picker__emoji:hover {
		background: hsl(var(--muted, 0 0% 96.1%));
		transform: scale(1.15);
	}

	.reaction-picker__emoji:active {
		transform: scale(0.95);
	}</style>
