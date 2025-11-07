<script lang="ts">
	import type { Store } from '@composable-svelte/core';
	import type { Message, StreamingChatState, StreamingChatAction } from './types.js';
	import { renderMarkdown, attachCopyButtons, extractImagesFromMarkdown, extractVideosFromMarkdown } from './markdown.js';
	import { ImageGallery } from '@composable-svelte/core/components/image-gallery';
	import { VideoEmbed } from '../video-embed/index.js';
	import AttachmentGallery from './attachment-components/AttachmentGallery.svelte';

	/**
	 * Individual chat message bubble.
	 */
	interface Props {
		message: Message;
		store: Store<StreamingChatState, StreamingChatAction>;
		isStreaming?: boolean;
	}

	const { message, store, isStreaming = false }: Props = $props();

	let contentElement: HTMLDivElement | undefined = $state();

	// Format timestamp
	const timeString = $derived(() => {
		const date = new Date(message.timestamp);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	});

	// Render markdown for assistant messages
	const renderedContent = $derived(() => {
		if (message.role === 'assistant') {
			return renderMarkdown(message.content, isStreaming);
		}
		return message.content;
	});

	// Extract images from markdown (only for completed assistant messages)
	const images = $derived(() => {
		if (message.role === 'assistant' && !isStreaming) {
			return extractImagesFromMarkdown(message.content);
		}
		return [];
	});

	// Extract videos from markdown (only for completed assistant messages)
	const videos = $derived(() => {
		if (message.role === 'assistant' && !isStreaming) {
			return extractVideosFromMarkdown(message.content);
		}
		return [];
	});

	// Attach copy buttons to code blocks after content is rendered
	$effect(() => {
		if (contentElement && message.role === 'assistant' && !isStreaming) {
			const cleanup = attachCopyButtons(contentElement);
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

		<!-- Action buttons (hover) -->
		{#if !isStreaming}
			<div class="chat-message__actions">
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
		{/if}
	</div>
	<div class="chat-message__content" bind:this={contentElement}>
		{#if message.role === 'assistant'}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html renderedContent()}
			{#if isStreaming}
				<span class="chat-message__cursor">▊</span>
			{/if}

			<!-- Attachments -->
			{#if message.attachments && message.attachments.length > 0}
				<div class="chat-message__attachments">
					<AttachmentGallery attachments={message.attachments} layout="list" />
				</div>
			{/if}

			<!-- Image gallery for detected images -->
			{#if images().length > 0}
				<div class="chat-message__gallery">
					<ImageGallery
						images={images()}
						columns={images().length === 1 ? 1 : 2}
						gap={12}
						aspectRatio="16:9"
					/>
				</div>
			{/if}

			<!-- Video embeds for detected videos -->
			{#if videos().length > 0}
				<div class="chat-message__videos">
					{#each videos() as video (video.url)}
						<VideoEmbed {video} />
					{/each}
				</div>
			{/if}
		{:else}
			{message.content}

			<!-- Attachments for user messages -->
			{#if message.attachments && message.attachments.length > 0}
				<div class="chat-message__attachments">
					<AttachmentGallery attachments={message.attachments} layout="list" />
				</div>
			{/if}
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

	.chat-message__actions {
		display: flex;
		gap: 4px;
		margin-left: auto;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.chat-message:hover .chat-message__actions {
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

	.chat-message[data-role='user'] .action-button {
		background: rgba(255, 255, 255, 0.2);
	}

	.chat-message[data-role='user'] .action-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.3);
	}

	.chat-message__content {
		font-size: 14px;
		line-height: 1.6;
		word-wrap: break-word;
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

	.chat-message__content :global(h1) { font-size: 1.8em; }
	.chat-message__content :global(h2) { font-size: 1.5em; }
	.chat-message__content :global(h3) { font-size: 1.3em; }
	.chat-message__content :global(h4) { font-size: 1.1em; }
	.chat-message__content :global(h5) { font-size: 1em; }
	.chat-message__content :global(h6) { font-size: 0.9em; }

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
		font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
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
		padding: 40px 12px 25px 12px; /* Extra top padding for badge and copy button, bottom for balance */
		background: #1e1e1e;
		color: #d4d4d4;
		border-radius: 6px;
		overflow-x: auto;
		font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
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
		right: 44px; /* Position to left of copy button */
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
		padding: 2px 8px;
		border-radius: 3px;
		font-size: 11px;
		font-weight: 500;
		text-transform: uppercase;
		font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
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
		transition: opacity 0.2s ease, background 0.2s ease;
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

	/* Prism Token Syntax Highlighting */
	.chat-message__content :global(.token.comment),
	.chat-message__content :global(.token.prolog),
	.chat-message__content :global(.token.doctype),
	.chat-message__content :global(.token.cdata) {
		color: #6a9955;
	}

	.chat-message__content :global(.token.punctuation) {
		color: #d4d4d4;
	}

	.chat-message__content :global(.token.property),
	.chat-message__content :global(.token.tag),
	.chat-message__content :global(.token.boolean),
	.chat-message__content :global(.token.number),
	.chat-message__content :global(.token.constant),
	.chat-message__content :global(.token.symbol),
	.chat-message__content :global(.token.deleted) {
		color: #b5cea8;
	}

	.chat-message__content :global(.token.selector),
	.chat-message__content :global(.token.attr-name),
	.chat-message__content :global(.token.string),
	.chat-message__content :global(.token.char),
	.chat-message__content :global(.token.builtin),
	.chat-message__content :global(.token.inserted) {
		color: #ce9178;
	}

	.chat-message__content :global(.token.operator),
	.chat-message__content :global(.token.entity),
	.chat-message__content :global(.token.url) {
		color: #d4d4d4;
	}

	.chat-message__content :global(.token.atrule),
	.chat-message__content :global(.token.attr-value),
	.chat-message__content :global(.token.keyword) {
		color: #c586c0;
	}

	.chat-message__content :global(.token.function),
	.chat-message__content :global(.token.class-name) {
		color: #dcdcaa;
	}

	.chat-message__content :global(.token.regex),
	.chat-message__content :global(.token.important),
	.chat-message__content :global(.token.variable) {
		color: #d16969;
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

	/* Attachments */
	.chat-message__attachments {
		margin-top: 12px;
	}

	/* Image Gallery */
	.chat-message__gallery {
		margin-top: 16px;
	}

	/* Video Embeds */
	.chat-message__videos {
		margin-top: 16px;
		display: flex;
		flex-direction: column;
		gap: 16px;
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

	/* Dark mode markdown styles */
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

	:global(.dark) .chat-message[data-role='assistant'] .action-button {
		background: rgba(255, 255, 255, 0.1);
	}

	:global(.dark) .chat-message[data-role='assistant'] .action-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
	}
</style>
