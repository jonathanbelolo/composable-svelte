<script lang="ts">
	import type { Store } from '@composable-svelte/core';
	import type { Message, StreamingChatState, StreamingChatAction } from '../types.js';

	/**
	 * Message action buttons primitive.
	 *
	 * Provides Copy, Edit (for user messages), and Regenerate (for assistant messages) buttons.
	 */
	interface Props {
		message: Message;
		store: Store<StreamingChatState, StreamingChatAction>;
	}

	const { message, store }: Props = $props();
</script>

<div class="action-buttons">
	<button
		class="action-button"
		onclick={() => store.dispatch({ type: 'copyMessage', messageId: message.id })}
		aria-label="Copy message"
		title="Copy"
	>
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path d="M11 1H3C2.4 1 2 1.4 2 2V11C2 11.6 2.4 12 3 12H11C11.6 12 12 11.6 12 11V2C12 1.4 11.6 1 11 1Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			<path d="M14 5V14C14 14.6 13.6 15 13 15H5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
	</button>

	{#if message.role === 'user'}
		<button
			class="action-button"
			onclick={() => store.dispatch({ type: 'startEditingMessage', messageId: message.id })}
			aria-label="Edit message"
			title="Edit"
		>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M11.3333 2.00001C11.5084 1.82491 11.716 1.68602 11.9447 1.59126C12.1735 1.49651 12.4191 1.44787 12.6667 1.44787C12.9142 1.44787 13.1598 1.49651 13.3886 1.59126C13.6174 1.68602 13.8249 1.82491 14 2.00001C14.1751 2.17511 14.314 2.38264 14.4088 2.61142C14.5035 2.8402 14.5522 3.08578 14.5522 3.33334C14.5522 3.58091 14.5035 3.82649 14.4088 4.05527C14.314 4.28405 14.1751 4.49158 14 4.66668L5 13.6667L1 14.6667L2 10.6667L11.3333 2.00001Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		</button>
	{:else}
		<button
			class="action-button"
			onclick={() => store.dispatch({ type: 'regenerateMessage', messageId: message.id })}
			disabled={$store.isWaitingForResponse}
			aria-label="Regenerate response"
			title="Regenerate"
		>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M1 4V1M1 1H4M1 1L4.5 4.5C5.66667 5.66667 7.33333 6.66667 9.5 6.66667C12.5 6.66667 14.3333 5 15 4M15 12V15M15 15H12M15 15L11.5 11.5C10.3333 10.3333 8.66667 9.33333 6.5 9.33333C3.5 9.33333 1.66667 11 1 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		</button>
	{/if}
</div>

<style>
	.action-buttons {
		display: flex;
		gap: 4px;
		margin-left: auto;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	:global(.chat-message:hover) .action-buttons {
		opacity: 1;
	}

	.action-button {
		background: rgba(0, 0, 0, 0.1);
		border: none;
		border-radius: 4px;
		padding: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		color: currentColor;
		transition: background 0.2s ease, transform 0.1s ease;
		width: 24px;
		height: 24px;
	}

	.action-button:hover:not(:disabled) {
		background: rgba(0, 0, 0, 0.2);
	}

	.action-button:active:not(:disabled) {
		transform: scale(0.95);
	}

	.action-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	:global(.chat-message[data-role='user']) .action-button {
		background: rgba(255, 255, 255, 0.2);
	}

	:global(.chat-message[data-role='user']) .action-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.3);
	}

	/* Dark mode support */
	:global(.dark .chat-message[data-role='assistant']) .action-button {
		background: rgba(255, 255, 255, 0.1);
	}

	:global(.dark .chat-message[data-role='assistant']) .action-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
	}
</style>
