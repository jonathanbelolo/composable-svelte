<script lang="ts">
	import type { Message } from '../types.js';
	import type { Snippet } from 'svelte';
	import { renderMarkdown, attachCopyButtons, extractImagesFromMarkdown, extractVideosFromMarkdown } from '../markdown.js';
	import { ImageGallery } from '@composable-svelte/core/components/image-gallery';
	import { VideoEmbed } from '@composable-svelte/media';
	import AttachmentGallery from '../attachment-components/AttachmentGallery.svelte';
	import MessageReactions from './MessageReactions.svelte';

	/**
	 * Minimal chat message bubble primitive (no action buttons).
	 *
	 * Use this as a building block for custom chat implementations.
	 */
	interface Props {
		message: Message;
		isStreaming?: boolean;
		headerActions?: Snippet;
		/** Optional reaction click handler */
		onReactionClick?: (emoji: string) => void;
		/** Optional add reaction handler */
		onAddReaction?: () => void;
		/** Custom label for user messages (default: "You") */
		userLabel?: string;
		/** Custom label for assistant messages (default: "Assistant") */
		assistantLabel?: string;
		/** Avatar URL for user messages */
		userAvatarUrl?: string;
		/** Avatar URL for assistant messages */
		assistantAvatarUrl?: string;
	}

	const { message, isStreaming = false, headerActions, onReactionClick, onAddReaction, userLabel = 'You', assistantLabel = 'Assistant', userAvatarUrl, assistantAvatarUrl }: Props = $props();

	// Get the appropriate avatar URL based on message role
	const avatarUrl = $derived(message.role === 'user' ? userAvatarUrl : assistantAvatarUrl);
	const avatarLabel = $derived(message.role === 'user' ? userLabel : assistantLabel);

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
		<div class="chat-message__header-left">
			{#if avatarUrl}
				<img src={avatarUrl} alt={avatarLabel} class="chat-message__avatar" />
			{:else}
				<div class="chat-message__avatar-placeholder" data-role={message.role}>
					{avatarLabel.charAt(0).toUpperCase()}
				</div>
			{/if}
			<span class="chat-message__role">
				{message.role === 'user' ? userLabel : assistantLabel}
			</span>
			<span class="chat-message__time">{timeString()}</span>
		</div>

		<!-- Optional header actions (e.g., action buttons) -->
		{#if headerActions}
			<div class="chat-message__header-right">
				{@render headerActions()}
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

			<!-- Message attachments -->
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

			<!-- Message attachments for user messages -->
			{#if message.attachments && message.attachments.length > 0}
				<div class="chat-message__attachments">
					<AttachmentGallery attachments={message.attachments} layout="list" />
				</div>
			{/if}
		{/if}
	</div>

	<!-- Message reactions -->
	{#if message.reactions && message.reactions.length > 0 && !isStreaming}
		<MessageReactions reactions={message.reactions} onclick={onReactionClick} />
	{/if}

	<!-- Add reaction footer button -->
	{#if onAddReaction && !isStreaming}
		<button type="button" class="chat-message__add-reaction" onclick={onAddReaction}>
			<span class="chat-message__add-reaction-icon">😊</span>
			<span>Add Reaction</span>
		</button>
	{/if}
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
		opacity: 0.85;
	}

	.chat-message__header-left {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.chat-message__header-right {
		display: flex;
		align-items: center;
	}

	.chat-message__avatar {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}

	.chat-message__avatar-placeholder {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		font-weight: 600;
		flex-shrink: 0;
	}

	.chat-message__avatar-placeholder[data-role='user'] {
		background: rgba(255, 255, 255, 0.25);
		color: white;
	}

	.chat-message__avatar-placeholder[data-role='assistant'] {
		background: rgba(0, 0, 0, 0.1);
		color: rgba(0, 0, 0, 0.6);
	}

	.chat-message__role {
		font-weight: 600;
	}

	.chat-message__time {
		font-size: 11px;
		opacity: 0.7;
	}

	.chat-message__content {
		font-size: 14px;
		line-height: 1.6;
		word-wrap: break-word;
		/* Ensure emoji render properly alongside text */
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue',
			Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',
			'Noto Color Emoji';
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
		padding: 40px 12px 25px 12px;
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
		right: 44px;
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

	/* Message Attachments */
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

	/* Add Reaction Footer Button */
	.chat-message__add-reaction {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 8px;
		padding: 6px 12px;
		background: rgba(0, 0, 0, 0.05);
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 16px;
		font-size: 13px;
		font-weight: 500;
		color: rgba(0, 0, 0, 0.7);
		cursor: pointer;
		transition: background 0.2s, border-color 0.2s, transform 0.1s;
	}

	.chat-message__add-reaction:hover {
		background: rgba(0, 122, 255, 0.1);
		border-color: rgba(0, 122, 255, 0.3);
		color: rgba(0, 122, 255, 0.9);
		transform: scale(1.02);
	}

	.chat-message__add-reaction:active {
		transform: scale(0.98);
	}

	.chat-message__add-reaction-icon {
		font-size: 16px;
		line-height: 1;
		font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji',
			sans-serif;
	}

	/* Dark mode support */
	:global(.dark) .chat-message__avatar-placeholder[data-role='assistant'] {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.6);
	}

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

	:global(.dark) .chat-message__add-reaction {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
	}

	:global(.dark) .chat-message__add-reaction:hover {
		background: rgba(0, 102, 204, 0.2);
		border-color: rgba(0, 102, 204, 0.4);
		color: rgba(0, 122, 255, 1);
	}
</style>
