<script lang="ts">
	/**
	 * StreamingChat Component
	 *
	 * Transport-agnostic streaming chat interface.
	 * Users provide their own streaming implementation via dependencies.
	 */

	import { onMount } from 'svelte';
	import type { Store } from '@composable-svelte/core';
	import type { StreamingChatState, StreamingChatAction } from './types.js';
	import ChatMessage from './ChatMessage.svelte';

	interface Props {
		/**
		 * Store managing chat state.
		 */
		store: Store<StreamingChatState, StreamingChatAction>;

		/**
		 * Placeholder text for input.
		 */
		placeholder?: string;

		/**
		 * Show clear button.
		 */
		showClearButton?: boolean;

		/**
		 * Custom CSS class.
		 */
		class?: string;
	}

	const {
		store,
		placeholder = 'Type your message...',
		showClearButton = true,
		class: className = ''
	}: Props = $props();

	// Input state
	let inputValue = $state('');
	let messagesContainer: HTMLDivElement;
	let shouldAutoScroll = $state(true);

	// Use $store auto-subscription
	const canSendMessage = $derived(!$store.isWaitingForResponse && inputValue.trim().length > 0);

	// Auto-scroll to bottom when new messages arrive
	$effect(() => {
		if (
			messagesContainer &&
			shouldAutoScroll &&
			($store.currentStreaming || $store.messages.length > 0)
		) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	});

	// Detect if user has scrolled up
	function handleScroll() {
		if (!messagesContainer) return;

		const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
		const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
		shouldAutoScroll = isAtBottom;
	}

	function handleSubmit(e: Event) {
		e.preventDefault();

		if (!canSendMessage) return;

		const message = inputValue.trim();
		inputValue = '';

		store.dispatch({ type: 'sendMessage', message });
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit(e);
		}
	}

	function handleClear() {
		if (confirm('Clear all messages?')) {
			store.dispatch({ type: 'clearMessages' });
		}
	}
</script>

<div class="streaming-chat {className}">
	<!-- Messages Container -->
	<div class="streaming-chat__messages" bind:this={messagesContainer} onscroll={handleScroll}>
		{#if $store.messages.length === 0 && !$store.currentStreaming}
			<div class="streaming-chat__empty">
				<p>No messages yet. Start a conversation!</p>
			</div>
		{:else}
			{#each $store.messages as message (message.id)}
				<ChatMessage {message} />
			{/each}

			{#if $store.currentStreaming}
				<ChatMessage
					message={{
						id: 'streaming',
						role: 'assistant',
						content: $store.currentStreaming.content,
						timestamp: Date.now()
					}}
					isStreaming={true}
				/>
			{/if}
		{/if}
	</div>

	<!-- Error Display -->
	{#if $store.error}
		<div class="streaming-chat__error">
			<span class="streaming-chat__error-text">{$store.error}</span>
			<button
				class="streaming-chat__error-close"
				onclick={() => store.dispatch({ type: 'clearError' })}
				aria-label="Dismiss error"
			>
				✕
			</button>
		</div>
	{/if}

	<!-- Input Form -->
	<form class="streaming-chat__form" onsubmit={handleSubmit}>
		<div class="streaming-chat__input-wrapper">
			<textarea
				class="streaming-chat__input"
				bind:value={inputValue}
				onkeydown={handleKeyDown}
				{placeholder}
				disabled={$store.isWaitingForResponse}
				rows="1"
				aria-label="Chat message input"
			/>
			<div class="streaming-chat__actions">
				{#if showClearButton && $store.messages.length > 0}
					<button
						type="button"
						class="streaming-chat__button streaming-chat__button--secondary"
						onclick={handleClear}
						aria-label="Clear messages"
					>
						Clear
					</button>
				{/if}
				<button
					type="submit"
					class="streaming-chat__button streaming-chat__button--primary"
					disabled={!canSendMessage}
					aria-label="Send message"
				>
					{$store.isWaitingForResponse ? 'Sending...' : 'Send'}
				</button>
			</div>
		</div>
	</form>
</div>

<style>
	.streaming-chat {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #ffffff;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		overflow: hidden;
	}

	.streaming-chat__messages {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
		scroll-behavior: smooth;
	}

	.streaming-chat__empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #999;
		font-size: 14px;
	}

	.streaming-chat__error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		background: #fee;
		border-top: 1px solid #fcc;
		color: #c00;
		font-size: 14px;
	}

	.streaming-chat__error-text {
		flex: 1;
	}

	.streaming-chat__error-close {
		background: none;
		border: none;
		color: #c00;
		cursor: pointer;
		font-size: 18px;
		padding: 0 8px;
	}

	.streaming-chat__error-close:hover {
		opacity: 0.7;
	}

	.streaming-chat__form {
		border-top: 1px solid #e0e0e0;
		padding: 16px;
		background: #fafafa;
	}

	.streaming-chat__input-wrapper {
		display: flex;
		gap: 8px;
		align-items: flex-end;
	}

	.streaming-chat__input {
		flex: 1;
		padding: 12px;
		border: 1px solid #d0d0d0;
		border-radius: 6px;
		font-size: 14px;
		font-family: inherit;
		resize: none;
		max-height: 120px;
		min-height: 44px;
		background: white;
	}

	.streaming-chat__input:focus {
		outline: none;
		border-color: #007aff;
	}

	.streaming-chat__input:disabled {
		background: #f5f5f5;
		cursor: not-allowed;
	}

	.streaming-chat__actions {
		display: flex;
		gap: 8px;
	}

	.streaming-chat__button {
		padding: 10px 16px;
		border: none;
		border-radius: 6px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
		white-space: nowrap;
	}

	.streaming-chat__button:hover:not(:disabled) {
		opacity: 0.8;
	}

	.streaming-chat__button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.streaming-chat__button--primary {
		background: #007aff;
		color: white;
	}

	.streaming-chat__button--secondary {
		background: #e0e0e0;
		color: #333;
	}

	/* Dark mode support */
	:global(.dark) .streaming-chat {
		background: #1a1a1a;
		border-color: #333;
	}

	:global(.dark) .streaming-chat__form {
		background: #222;
		border-top-color: #333;
	}

	:global(.dark) .streaming-chat__input {
		background: #2a2a2a;
		border-color: #444;
		color: #e0e0e0;
	}

	:global(.dark) .streaming-chat__input:disabled {
		background: #1a1a1a;
	}

	:global(.dark) .streaming-chat__button--secondary {
		background: #333;
		color: #e0e0e0;
	}

	:global(.dark) .streaming-chat__empty {
		color: #666;
	}
</style>
