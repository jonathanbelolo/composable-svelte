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
	import { untrack } from 'svelte';
	import type { ViewStore } from '../../internal/view-store.js';
	import type { StreamingChatState, StreamingChatAction } from '../types.js';
	import SimpleChatMessage from '../primitives/SimpleChatMessage.svelte';

	interface Props {
		/**
		 * Store managing chat state: a standalone `Store`, or the managed view a
		 * feature receives (`FeatureViewProps.store`). Once a managed owner
		 * retires, the chat renders nothing.
		 */
		store: ViewStore<StreamingChatState, StreamingChatAction>;

		/**
		 * Placeholder text for input.
		 */
		placeholder?: string | undefined;

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
		class: className = '',
		userLabel = 'You',
		assistantLabel = 'Assistant'
	}: Props = $props();

	// Input state
	let inputValue = $state('');
	let messagesContainer = $state<HTMLDivElement | undefined>();
	let shouldAutoScroll = $state(true);

	// `undefined` once a managed owner has retired.
	const chat = $derived($store);

	// A draft belongs to the conversation it was typed into. An unkeyed chat
	// whose `store` changes must not send it to the next one.
	$effect.pre(() => {
		void store;
		untrack(() => {
			inputValue = '';
			shouldAutoScroll = true;
		});
	});

	const canSendMessage = $derived(
		!!chat && !chat.isWaitingForResponse && inputValue.trim().length > 0
	);

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

		if (shouldAutoScroll && chat && (chat.currentStreaming || chat.messages.length > 0)) {
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

{#if chat}
	<div class="minimal-streaming-chat {className}">
		<!-- Messages Container -->
		<div class="minimal-streaming-chat__messages" bind:this={messagesContainer} onscroll={handleScroll}>
			{#if chat.messages.length === 0 && !chat.currentStreaming}
				<div class="minimal-streaming-chat__empty">
					<p>No messages yet. Start a conversation!</p>
				</div>
			{:else}
				{#each chat.messages as message (message.id)}
					<SimpleChatMessage
						{message}
						{userLabel}
						{assistantLabel}
						animateIn={message.id === chat.lastAppendedId}
					/>
				{/each}

				{#if chat.currentStreaming}
					<SimpleChatMessage
						message={{
							id: 'streaming',
							role: 'assistant',
							content: chat.currentStreaming.content,
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
		{#if chat.error}
			<div class="minimal-streaming-chat__error">
				<span class="minimal-streaming-chat__error-text">{chat.error}</span>
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
					disabled={chat.isWaitingForResponse}
					rows="1"
					aria-label="Chat message input"
				></textarea>
				<button
					type="submit"
					class="minimal-streaming-chat__button"
					disabled={!canSendMessage}
					aria-label="Send message"
				>
					{chat.isWaitingForResponse ? 'Sending...' : 'Send'}
				</button>
			</div>
		</form>
	</div>
{/if}

<style>
	.minimal-streaming-chat {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: hsl(var(--background, 0 0% 100%));
		border: 1px solid hsl(var(--border, 0 0% 87.8%));
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
		color: hsl(var(--muted-foreground, 0 0% 60%));
		font-size: 14px;
	}

	.minimal-streaming-chat__error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		background: #fee;
		border-top: 1px solid #fcc;
		color: hsl(var(--destructive, 0 100% 40%));
		font-size: 14px;
	}

	.minimal-streaming-chat__error-text {
		flex: 1;
	}

	.minimal-streaming-chat__error-close {
		background: none;
		border: none;
		color: hsl(var(--destructive, 0 100% 40%));
		cursor: pointer;
		font-size: 18px;
		padding: 0 8px;
	}

	.minimal-streaming-chat__error-close:hover {
		opacity: 0.7;
	}

	.minimal-streaming-chat__form {
		border-top: 1px solid hsl(var(--border, 0 0% 87.8%));
		padding: 16px;
		background: hsl(var(--muted, 0 0% 98%));
	}

	.minimal-streaming-chat__input-wrapper {
		display: flex;
		gap: 8px;
		align-items: flex-end;
	}

	.minimal-streaming-chat__input {
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

	.minimal-streaming-chat__input:focus {
		outline: none;
		border-color: hsl(var(--primary, 211.3 100% 50%));
	}

	.minimal-streaming-chat__input:disabled {
		background: hsl(var(--muted, 0 0% 96.1%));
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
		background: hsl(var(--primary, 211.3 100% 50%));
		color: hsl(var(--primary-foreground, 0 0% 100%));
	}

	.minimal-streaming-chat__button:hover:not(:disabled) {
		opacity: 0.8;
	}

	.minimal-streaming-chat__button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}</style>
