<script lang="ts">
	/**
	 * StandardStreamingChat Component
	 *
	 * Standard streaming chat variant with messages, input, Stop button, and Clear button.
	 * No per-message action buttons - keeps the UI clean while adding essential controls.
	 *
	 * Perfect for:
	 * - Most chat applications
	 * - Customer support chats
	 * - AI assistants where you need to stop long responses
	 */

	import { createScrollFollower, prefersReducedMotion } from '@composable-svelte/core/animation';
	import type { ScrollFollower } from '@composable-svelte/core/animation';
	import type { Store } from '@composable-svelte/core';
	import type { StreamingChatState, StreamingChatAction } from '../types.js';
	import ChatMessage from '../primitives/ChatMessage.svelte';

	interface Props {
		/**
		 * Store managing chat state.
		 */
		store: Store<StreamingChatState, StreamingChatAction>;

		/**
		 * Placeholder text for input.
		 */
		placeholder?: string | undefined;

		/**
		 * Show clear button.
		 */
		showClearButton?: boolean | undefined;

		/**
		 * Custom CSS class.
		 */
		class?: string | undefined;

		/**
		 * Custom label for user messages (default: "You").
		 */
		userLabel?: string | undefined;

		/**
		 * Custom label for assistant messages (default: "Assistant").
		 */
		assistantLabel?: string | undefined;
	}

	const {
		store,
		placeholder = 'Type your message...',
		showClearButton = true,
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

	function handleClear() {
		if (confirm('Clear all messages?')) {
			store.dispatch({ type: 'clearMessages' });
		}
	}
</script>

<div class="standard-streaming-chat {className}">
	<!-- Messages Container -->
	<div class="standard-streaming-chat__messages" bind:this={messagesContainer} onscroll={handleScroll}>
		{#if $store.messages.length === 0 && !$store.currentStreaming}
			<div class="standard-streaming-chat__empty">
				<p>No messages yet. Start a conversation!</p>
			</div>
		{:else}
			{#each $store.messages as message (message.id)}
				<ChatMessage
					{message}
					{userLabel}
					{assistantLabel}
					animateIn={message.id === $store.lastAppendedId}
				/>
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
					{userLabel}
					{assistantLabel}
				/>
			{/if}
		{/if}
	</div>

	<!-- Error Display -->
	{#if $store.error}
		<div class="standard-streaming-chat__error">
			<span class="standard-streaming-chat__error-text">{$store.error}</span>
			<button
				class="standard-streaming-chat__error-close"
				onclick={() => store.dispatch({ type: 'clearError' })}
				aria-label="Dismiss error"
			>
				✕
			</button>
		</div>
	{/if}

	<!-- Input Form -->
	<form class="standard-streaming-chat__form" onsubmit={handleSubmit}>
		<div class="standard-streaming-chat__input-wrapper">
			<textarea
				class="standard-streaming-chat__input"
				bind:value={inputValue}
				onkeydown={handleKeyDown}
				{placeholder}
				disabled={$store.isWaitingForResponse}
				rows="1"
				aria-label="Chat message input"
			></textarea>
			<div class="standard-streaming-chat__actions">
				{#if showClearButton && $store.messages.length > 0}
					<button
						type="button"
						class="standard-streaming-chat__button standard-streaming-chat__button--secondary"
						onclick={handleClear}
						aria-label="Clear messages"
					>
						Clear
					</button>
				{/if}
				{#if $store.currentStreaming}
					<button
						type="button"
						class="standard-streaming-chat__button standard-streaming-chat__button--stop"
						onclick={() => store.dispatch({ type: 'stopGeneration' })}
						aria-label="Stop generation"
					>
						■ Stop
					</button>
				{:else}
					<button
						type="submit"
						class="standard-streaming-chat__button standard-streaming-chat__button--primary"
						disabled={!canSendMessage}
						aria-label="Send message"
					>
						{$store.isWaitingForResponse ? 'Sending...' : 'Send'}
					</button>
				{/if}
			</div>
		</div>
	</form>
</div>

<style>
	.standard-streaming-chat {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: hsl(var(--background, 0 0% 100%));
		border: 1px solid hsl(var(--border, 0 0% 87.8%));
		border-radius: 8px;
		overflow: hidden;
	}

	.standard-streaming-chat__messages {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
	}

	.standard-streaming-chat__empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: hsl(var(--muted-foreground, 0 0% 60%));
		font-size: 14px;
	}

	.standard-streaming-chat__error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		background: #fee;
		border-top: 1px solid #fcc;
		color: hsl(var(--destructive, 0 100% 40%));
		font-size: 14px;
	}

	.standard-streaming-chat__error-text {
		flex: 1;
	}

	.standard-streaming-chat__error-close {
		background: none;
		border: none;
		color: hsl(var(--destructive, 0 100% 40%));
		cursor: pointer;
		font-size: 18px;
		padding: 0 8px;
	}

	.standard-streaming-chat__error-close:hover {
		opacity: 0.7;
	}

	.standard-streaming-chat__form {
		border-top: 1px solid hsl(var(--border, 0 0% 87.8%));
		padding: 16px;
		background: hsl(var(--muted, 0 0% 98%));
	}

	.standard-streaming-chat__input-wrapper {
		display: flex;
		gap: 8px;
		align-items: flex-end;
	}

	.standard-streaming-chat__input {
		flex: 1;
		padding: 12px;
		border: 1px solid hsl(var(--border, 0 0% 81.6%));
		border-radius: 6px;
		font-size: 14px;
		font-family: inherit;
		resize: none;
		max-height: 120px;
		min-height: 44px;
		background: hsl(var(--background, 0 0% 100%));
	}

	.standard-streaming-chat__input:focus {
		outline: none;
		border-color: hsl(var(--primary, 211.3 100% 50%));
	}

	.standard-streaming-chat__input:disabled {
		background: hsl(var(--muted, 0 0% 96.1%));
		cursor: not-allowed;
	}

	.standard-streaming-chat__actions {
		display: flex;
		gap: 8px;
	}

	.standard-streaming-chat__button {
		padding: 10px 16px;
		border: none;
		border-radius: 6px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}

	.standard-streaming-chat__button:hover:not(:disabled) {
		opacity: 0.8;
	}

	.standard-streaming-chat__button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.standard-streaming-chat__button--primary {
		background: hsl(var(--primary, 211.3 100% 50%));
		color: hsl(var(--primary-foreground, 0 0% 100%));
	}

	.standard-streaming-chat__button--secondary {
		background: hsl(var(--muted, 0 0% 87.8%));
		color: hsl(var(--foreground, 0 0% 20%));
	}

	.standard-streaming-chat__button--stop {
		background: hsl(var(--destructive, 0 72.2% 50.6%));
		color: hsl(var(--destructive-foreground, 0 0% 100%));
	}</style>
