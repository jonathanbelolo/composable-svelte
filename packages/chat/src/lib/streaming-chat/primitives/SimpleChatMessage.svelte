<script lang="ts">
	import type { Message } from '../types.js';
	import { renderSimpleMarkdown, attachSimpleCopyButtons } from '../simple-markdown.js';

	/**
	 * Simple chat message bubble primitive.
	 *
	 * Lightweight version without media dependencies (no images, videos, attachments).
	 * Use this for minimal chat implementations that only need text + markdown.
	 */
	interface Props {
		message: Message;
		isStreaming?: boolean;
	}

	const { message, isStreaming = false }: Props = $props();

	let contentElement: HTMLDivElement | undefined = $state();

	// Format timestamp
	const timeString = $derived(() => {
		const date = new Date(message.timestamp);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	});

	// Render markdown for assistant messages
	const renderedContent = $derived(() => {
		if (message.role === 'assistant') {
			return renderSimpleMarkdown(message.content, isStreaming);
		}
		return message.content;
	});

	// Attach copy buttons to code blocks after content is rendered
	$effect(() => {
		if (contentElement && message.role === 'assistant' && !isStreaming) {
			const cleanup = attachSimpleCopyButtons(contentElement);
			return cleanup;
		}
	});
</script>

<div class="chat-message" data-role={message.role} data-streaming={isStreaming}>
	<div class="chat-message__header">
		<span class="chat-message__role">
			{message.role === 'user' ? 'You' : 'Assistant'}
		</span>
		<span class="chat-message__time">{timeString()}</span>
	</div>
	<div class="chat-message__content" bind:this={contentElement}>
		{#if message.role === 'assistant'}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html renderedContent()}
			{#if isStreaming}
				<span class="chat-message__cursor">▊</span>
			{/if}
		{:else}
			{message.content}
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
		line-height: 1.6;
		word-wrap: break-word;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial,
			sans-serif;
	}

	/* Markdown Typography */
	.chat-message__content :global(h1),
	.chat-message__content :global(h2),
	.chat-message__content :global(h3),
	.chat-message__content :global(h4),
	.chat-message__content :global(h5),
	.chat-message__content :global(h6) {
		margin: 16px 0 8px 0;
		font-weight: 600;
		line-height: 1.3;
	}

	.chat-message__content :global(h1) {
		font-size: 1.8em;
	}
	.chat-message__content :global(h2) {
		font-size: 1.5em;
	}
	.chat-message__content :global(h3) {
		font-size: 1.3em;
	}
	.chat-message__content :global(h4) {
		font-size: 1.1em;
	}
	.chat-message__content :global(h5) {
		font-size: 1em;
	}
	.chat-message__content :global(h6) {
		font-size: 0.9em;
	}

	.chat-message__content :global(p) {
		margin: 8px 0;
	}

	.chat-message__content :global(ul),
	.chat-message__content :global(ol) {
		margin: 8px 0;
		padding-left: 24px;
	}

	.chat-message__content :global(li) {
		margin: 4px 0;
	}

	.chat-message__content :global(blockquote) {
		margin: 12px 0;
		padding: 8px 16px;
		border-left: 3px solid rgba(0, 0, 0, 0.2);
		background: rgba(0, 0, 0, 0.05);
		font-style: italic;
	}

	.chat-message__content :global(a) {
		color: inherit;
		text-decoration: underline;
		opacity: 0.9;
	}

	.chat-message__content :global(a:hover) {
		opacity: 1;
	}

	.chat-message__content :global(strong) {
		font-weight: 600;
	}

	.chat-message__content :global(em) {
		font-style: italic;
	}

	/* Inline Code */
	.chat-message__content :global(.inline-code) {
		background: rgba(0, 0, 0, 0.1);
		padding: 2px 6px;
		border-radius: 3px;
		font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New',
			monospace;
		font-size: 0.9em;
	}

	/* Code Block Wrapper */
	.chat-message__content :global(.code-block-wrapper) {
		position: relative;
		margin: 12px 0;
	}

	/* Code Blocks */
	.chat-message__content :global(.code-block-wrapper pre) {
		margin: 0;
		padding: 40px 12px 25px 12px;
		background: #1e1e1e;
		color: #d4d4d4;
		border-radius: 6px;
		overflow-x: auto;
		font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New',
			monospace;
		font-size: 13px;
		line-height: 1.5;
	}

	.chat-message__content :global(.code-block-wrapper pre code) {
		background: none;
		padding: 0;
		font-size: inherit;
		color: inherit;
	}

	/* Language Badge */
	.chat-message__content :global(.language-badge) {
		position: absolute;
		top: 8px;
		right: 44px;
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
		padding: 2px 8px;
		border-radius: 3px;
		font-size: 11px;
		font-weight: 500;
		text-transform: uppercase;
		font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New',
			monospace;
		pointer-events: none;
		user-select: none;
	}

	/* Copy Button */
	.chat-message__content :global(.copy-button) {
		position: absolute;
		top: 8px;
		right: 8px;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		padding: 6px;
		cursor: pointer;
		opacity: 0;
		transition:
			opacity 0.2s ease,
			background 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.7);
	}

	.chat-message__content :global(.code-block-wrapper:hover .copy-button) {
		opacity: 1;
	}

	.chat-message__content :global(.copy-button:hover) {
		background: rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.9);
	}

	.chat-message__content :global(.copy-button:active) {
		transform: scale(0.95);
	}

	/* Copy Button Icons */
	.chat-message__content :global(.copy-button .copy-icon) {
		display: block;
	}

	.chat-message__content :global(.copy-button .check-icon) {
		display: none;
	}

	.chat-message__content :global(.copy-button.copied .copy-icon) {
		display: none;
	}

	.chat-message__content :global(.copy-button.copied .check-icon) {
		display: block;
		color: #4ade80;
	}

	/* Tables */
	.chat-message__content :global(table) {
		border-collapse: collapse;
		width: 100%;
		margin: 12px 0;
	}

	.chat-message__content :global(th),
	.chat-message__content :global(td) {
		border: 1px solid rgba(0, 0, 0, 0.2);
		padding: 8px 12px;
		text-align: left;
	}

	.chat-message__content :global(th) {
		background: rgba(0, 0, 0, 0.05);
		font-weight: 600;
	}

	/* Horizontal Rule */
	.chat-message__content :global(hr) {
		margin: 16px 0;
		border: none;
		border-top: 1px solid rgba(0, 0, 0, 0.2);
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

	:global(.dark) .chat-message__content :global(blockquote) {
		border-left-color: rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.05);
	}

	:global(.dark) .chat-message__content :global(.inline-code) {
		background: rgba(255, 255, 255, 0.1);
	}

	:global(.dark) .chat-message__content :global(th),
	:global(.dark) .chat-message__content :global(td) {
		border-color: rgba(255, 255, 255, 0.2);
	}

	:global(.dark) .chat-message__content :global(th) {
		background: rgba(255, 255, 255, 0.05);
	}

	:global(.dark) .chat-message__content :global(hr) {
		border-top-color: rgba(255, 255, 255, 0.2);
	}
</style>
