<script lang="ts">
	/**
	 * MinimalStreamingChat Component
	 *
	 * Simplest streaming chat variant with just messages and input.
	 * No action buttons, no clear button - just core chat functionality.
	 *
	 * Perfect for:
	 * - Simple chat UIs
	 * - Embedded chats with limited space
	 * - Read-only-ish experiences where users just ask questions
	 */

	import { createScrollFollower, prefersReducedMotion } from '@composable-svelte/core/animation';
	import type { ScrollFollower } from '@composable-svelte/core/animation';
	import type { Store } from '@composable-svelte/core';
	import type { StreamingChatState, StreamingChatAction } from '../types.js';
	import SimpleChatMessage from '../primitives/SimpleChatMessage.svelte';

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
		 * Custom CSS class.
		 */
		class?: string;

		/**
		 * Custom label for user messages (default: "You").
		 */
		userLabel?: string;

		/**
		 * Custom label for assistant messages (default: "Assistant").
		 */
		assistantLabel?: string;
	}

	const {
		store,
		placeholder = 'Type your message...',
		class: className = '',
		userLabel = 'You',
		assistantLabel = 'Assistant'
	}: Props = $props();

	// Input state
	let inputValue = $state('');
	let messagesContainer: HTMLDivElement;
	let shouldAutoScroll = $state(true);

	// Use $store auto-subscription
	const canSendMessage = $derived(!$store.isWaitingForResponse && inputValue.trim().length > 0);

	// The follower owns the smooth scroll, because the browser must not.
	//
	// `scroll-behavior: smooth` used to do this, and it was quietly breaking the
	// gate below: `handleScroll` listens to the same `scroll` event and cannot
	// tell a programmatic scroll from a user's, so the browser's intermediate
	// animation frames — each more than 50px short of the bottom — kept setting
	// `shouldAutoScroll = false` and latching auto-scroll off mid-response.
	let follower: ScrollFollower | null = null;

	$effect(() => {
		if (!messagesContainer) return;
		follower = createScrollFollower(messagesContainer, {
			reducedMotion: prefersReducedMotion()
		});
		return () => {
			follower?.stop();
			follower = null;
		};
	});

	// Re-runs per streamed chunk, which is the point: `follow()` is idempotent and
	// the running loop re-reads the target, so a chunk retargets the animation in
	// flight rather than starting a competing one.
	$effect(() => {
		if (!messagesContainer) return;

		if (shouldAutoScroll && ($store.currentStreaming || $store.messages.length > 0)) {
			follower?.follow();
		} else {
			// Stopping matters as much as starting. `follow()` runs until it reaches
			// the bottom, so gating only the *call* would let a loop already in
			// flight drag the user back down the moment they scrolled away.
			follower?.stop();
		}
	});

	// Detect if user has scrolled up
	function handleScroll() {
		if (!messagesContainer) return;
		// Our own frames are not the user leaving.
		if (follower?.isSelfScroll()) return;

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
</script>

<div class="minimal-streaming-chat {className}">
	<!-- Messages Container -->
	<div class="minimal-streaming-chat__messages" bind:this={messagesContainer} onscroll={handleScroll}>
		{#if $store.messages.length === 0 && !$store.currentStreaming}
			<div class="minimal-streaming-chat__empty">
				<p>No messages yet. Start a conversation!</p>
			</div>
		{:else}
			{#each $store.messages as message (message.id)}
				<SimpleChatMessage
					{message}
					{userLabel}
					{assistantLabel}
					animateIn={message.id === $store.lastAppendedId}
				/>
			{/each}

			{#if $store.currentStreaming}
				<SimpleChatMessage
					message={{
						id: 'streaming',
						role: 'assistant',
						content: $store.currentStreaming.content,
						timestamp: Date.now()
					}}
					isStreaming={true}
					{userLabel}
					{assistantLabel}
				/>
			{/if}
		{/if}
	</div>

	<!-- Error Display -->
	{#if $store.error}
		<div class="minimal-streaming-chat__error">
			<span class="minimal-streaming-chat__error-text">{$store.error}</span>
			<button
				class="minimal-streaming-chat__error-close"
				onclick={() => store.dispatch({ type: 'clearError' })}
				aria-label="Dismiss error"
			>
				✕
			</button>
		</div>
	{/if}

	<!-- Input Form -->
	<form class="minimal-streaming-chat__form" onsubmit={handleSubmit}>
		<div class="minimal-streaming-chat__input-wrapper">
			<textarea
				class="minimal-streaming-chat__input"
				bind:value={inputValue}
				onkeydown={handleKeyDown}
				{placeholder}
				disabled={$store.isWaitingForResponse}
				rows="1"
				aria-label="Chat message input"
			></textarea>
			<button
				type="submit"
				class="minimal-streaming-chat__button"
				disabled={!canSendMessage}
				aria-label="Send message"
			>
				{$store.isWaitingForResponse ? 'Sending...' : 'Send'}
			</button>
		</div>
	</form>
</div>

<style>
	.minimal-streaming-chat {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #ffffff;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		overflow: hidden;
	}

	.minimal-streaming-chat__messages {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
	}

	.minimal-streaming-chat__empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #999;
		font-size: 14px;
	}

	.minimal-streaming-chat__error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		background: #fee;
		border-top: 1px solid #fcc;
		color: #c00;
		font-size: 14px;
	}

	.minimal-streaming-chat__error-text {
		flex: 1;
	}

	.minimal-streaming-chat__error-close {
		background: none;
		border: none;
		color: #c00;
		cursor: pointer;
		font-size: 18px;
		padding: 0 8px;
	}

	.minimal-streaming-chat__error-close:hover {
		opacity: 0.7;
	}

	.minimal-streaming-chat__form {
		border-top: 1px solid #e0e0e0;
		padding: 16px;
		background: #fafafa;
	}

	.minimal-streaming-chat__input-wrapper {
		display: flex;
		gap: 8px;
		align-items: flex-end;
	}

	.minimal-streaming-chat__input {
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

	.minimal-streaming-chat__input:focus {
		outline: none;
		border-color: #007aff;
	}

	.minimal-streaming-chat__input:disabled {
		background: #f5f5f5;
		cursor: not-allowed;
	}

	.minimal-streaming-chat__button {
		padding: 10px 16px;
		border: none;
		border-radius: 6px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		background: #007aff;
		color: white;
	}

	.minimal-streaming-chat__button:hover:not(:disabled) {
		opacity: 0.8;
	}

	.minimal-streaming-chat__button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Dark mode support */
	:global(.dark) .minimal-streaming-chat {
		background: #1a1a1a;
		border-color: #333;
	}

	:global(.dark) .minimal-streaming-chat__form {
		background: #222;
		border-top-color: #333;
	}

	:global(.dark) .minimal-streaming-chat__input {
		background: #2a2a2a;
		border-color: #444;
		color: #e0e0e0;
	}

	:global(.dark) .minimal-streaming-chat__input:disabled {
		background: #1a1a1a;
	}

	:global(.dark) .minimal-streaming-chat__empty {
		color: #666;
	}
</style>
