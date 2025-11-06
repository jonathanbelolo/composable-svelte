<script lang="ts">
	import type { Message } from './types.js';

	/**
	 * Individual chat message bubble.
	 */
	interface Props {
		message: Message;
		isStreaming?: boolean;
	}

	const { message, isStreaming = false }: Props = $props();

	// Format timestamp
	const timeString = $derived(() => {
		const date = new Date(message.timestamp);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	});
</script>

<div class="chat-message" data-role={message.role} data-streaming={isStreaming}>
	<div class="chat-message__header">
		<span class="chat-message__role">
			{message.role === 'user' ? 'You' : 'Assistant'}
		</span>
		<span class="chat-message__time">{timeString()}</span>
	</div>
	<div class="chat-message__content">
		{message.content}
		{#if isStreaming}
			<span class="chat-message__cursor">▊</span>
		{/if}
	</div>
</div>

<style>
	.chat-message {
		padding: 12px 16px;
		margin: 8px 0;
		border-radius: 8px;
		max-width: 85%;
		animation: slideIn 0.2s ease-out;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.chat-message[data-role='user'] {
		background: #007aff;
		color: white;
		margin-left: auto;
		align-self: flex-end;
	}

	.chat-message[data-role='assistant'] {
		background: #f0f0f0;
		color: #1a1a1a;
		margin-right: auto;
		align-self: flex-start;
	}

	.chat-message[data-role='assistant'][data-streaming='true'] {
		background: #e8e8e8;
	}

	.chat-message__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 6px;
		font-size: 12px;
		opacity: 0.7;
	}

	.chat-message__role {
		font-weight: 600;
	}

	.chat-message__time {
		font-size: 11px;
	}

	.chat-message__content {
		font-size: 14px;
		line-height: 1.5;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.chat-message__cursor {
		display: inline-block;
		animation: blink 1s step-end infinite;
		margin-left: 2px;
	}

	@keyframes blink {
		50% {
			opacity: 0;
		}
	}

	/* Dark mode support */
	:global(.dark) .chat-message[data-role='assistant'] {
		background: #2a2a2a;
		color: #e0e0e0;
	}

	:global(.dark) .chat-message[data-role='assistant'][data-streaming='true'] {
		background: #333333;
	}

	:global(.dark) .chat-message[data-role='user'] {
		background: #0066cc;
	}
</style>
