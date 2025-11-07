<script lang="ts">
	/**
	 * MessageReactions Component
	 *
	 * Displays emoji reactions for a message with counts.
	 * Reactions are clickable to add/remove.
	 */
	import type { MessageReaction } from '../types.js';

	interface Props {
		/** Array of reactions to display */
		reactions: MessageReaction[];
		/** Click handler for reactions */
		onclick?: (emoji: string) => void;
		/** Optional class name */
		class?: string;
	}

	let { reactions, onclick, class: className = '' }: Props = $props();
</script>

{#if reactions.length > 0}
	<div class="message-reactions {className}">
		{#each reactions as reaction (reaction.emoji)}
			<button
				type="button"
				class="message-reaction"
				onclick={() => onclick?.(reaction.emoji)}
				disabled={!onclick}
				aria-label="{reaction.emoji} {reaction.count}"
			>
				<span class="message-reaction__emoji">{reaction.emoji}</span>
				{#if reaction.count > 1}
					<span class="message-reaction__count">{reaction.count}</span>
				{/if}
			</button>
		{/each}
	</div>
{/if}

<style>
	.message-reactions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}

	.message-reaction {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: rgba(0, 0, 0, 0.05);
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 12px;
		cursor: pointer;
		transition: background 0.2s, border-color 0.2s, transform 0.1s;
		font-size: 14px;
	}

	.message-reaction:hover:not(:disabled) {
		background: rgba(0, 122, 255, 0.1);
		border-color: rgba(0, 122, 255, 0.3);
		transform: scale(1.05);
	}

	.message-reaction:active:not(:disabled) {
		transform: scale(0.95);
	}

	.message-reaction:disabled {
		cursor: default;
	}

	.message-reaction__emoji {
		font-size: 16px;
		line-height: 1;
		/* Ensure emoji render with proper font */
		font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji',
			sans-serif;
	}

	.message-reaction__count {
		font-size: 12px;
		font-weight: 600;
		color: rgba(0, 0, 0, 0.6);
		line-height: 1;
	}

	/* Dark mode support */
	:global(.dark) .message-reaction {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.15);
	}

	:global(.dark) .message-reaction:hover:not(:disabled) {
		background: rgba(0, 102, 204, 0.2);
		border-color: rgba(0, 102, 204, 0.4);
	}

	:global(.dark) .message-reaction__count {
		color: rgba(255, 255, 255, 0.7);
	}
</style>
