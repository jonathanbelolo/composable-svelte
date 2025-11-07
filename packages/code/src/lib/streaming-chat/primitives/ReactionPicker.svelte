<script lang="ts">
	/**
	 * ReactionPicker Component
	 *
	 * Quick emoji picker popover for adding reactions to messages.
	 * Shows default reaction set in a compact layout.
	 */
	import { DEFAULT_REACTIONS } from '../types.js';

	interface Props {
		/** Whether the picker is open */
		open: boolean;
		/** Click handler when emoji is selected */
		onselect?: (emoji: string) => void;
		/** Close handler */
		onclose?: () => void;
		/** Optional class name */
		class?: string;
	}

	let { open, onselect, onclose, class: className = '' }: Props = $props();

	// Handle escape key
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onclose?.();
		}
	}

	// Handle backdrop click
	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onclose?.();
		}
	}

	function handleEmojiClick(emoji: string) {
		onselect?.(emoji);
		onclose?.();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="reaction-picker-backdrop"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		<div class="reaction-picker {className}">
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
		background: white;
		border: 1px solid #e0e0e0;
		border-radius: 12px;
		box-shadow:
			0 4px 6px rgba(0, 0, 0, 0.1),
			0 10px 25px rgba(0, 0, 0, 0.15);
		padding: 8px;
		min-width: 200px;
		animation: slideUp 0.2s ease-out;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
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
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.reaction-picker__close {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: transparent;
		border: none;
		color: #999;
		font-size: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background 0.2s, color 0.2s;
	}

	.reaction-picker__close:hover {
		background: #f5f5f5;
		color: #333;
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
		transition: background 0.2s, transform 0.1s;
		display: flex;
		align-items: center;
		justify-content: center;
		/* Ensure emoji render with proper font */
		font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji',
			sans-serif;
	}

	.reaction-picker__emoji:hover {
		background: #f5f5f5;
		transform: scale(1.15);
	}

	.reaction-picker__emoji:active {
		transform: scale(0.95);
	}

	/* Dark mode support */
	:global(.dark) .reaction-picker {
		background: #1a1a1a;
		border-color: #333;
		box-shadow:
			0 4px 6px rgba(0, 0, 0, 0.3),
			0 10px 25px rgba(0, 0, 0, 0.4);
	}

	:global(.dark) .reaction-picker__title {
		color: #999;
	}

	:global(.dark) .reaction-picker__close {
		color: #666;
	}

	:global(.dark) .reaction-picker__close:hover {
		background: #2a2a2a;
		color: #e0e0e0;
	}

	:global(.dark) .reaction-picker__emoji:hover {
		background: #2a2a2a;
	}
</style>
