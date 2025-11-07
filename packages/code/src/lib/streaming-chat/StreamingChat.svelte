<script lang="ts">
	/**
	 * StreamingChat Component
	 *
	 * Transport-agnostic streaming chat interface.
	 * Users provide their own streaming implementation via dependencies.
	 */

	import { onMount, onDestroy } from 'svelte';
	import type { Store } from '@composable-svelte/core';
	import type { StreamingChatState, StreamingChatAction, MessageAttachment } from './types.js';
	import ChatMessage from './ChatMessage.svelte';
	import {
		createAttachmentFromFile,
		getFileTypeIcon,
		revokeFileBlobURL,
		validateFileSize,
		validateFileType,
		formatFileSize
	} from './utils.js';

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

		/**
		 * Maximum file size in MB (default: 10MB).
		 */
		maxFileSizeMB?: number;

		/**
		 * Accepted file types (e.g., ["image/*", ".pdf"]).
		 * Empty array allows all types (default).
		 */
		acceptedFileTypes?: string[];
	}

	const {
		store,
		placeholder = 'Type your message...',
		showClearButton = true,
		class: className = '',
		maxFileSizeMB = 10,
		acceptedFileTypes = []
	}: Props = $props();

	// Input state
	let inputValue = $state('');
	let messagesContainer: HTMLDivElement;
	let shouldAutoScroll = $state(true);
	let fileInputRef: HTMLInputElement;
	let pendingAttachments = $state<MessageAttachment[]>([]);

	// Use $store auto-subscription
	const canSendMessage = $derived(
		!$store.isWaitingForResponse &&
			(inputValue.trim().length > 0 || pendingAttachments.length > 0)
	);

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
		const attachments = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;

		inputValue = '';
		pendingAttachments = [];

		store.dispatch({
			type: 'sendMessage',
			message: message || '(Attachments)',
			attachments
		});
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

	function handleAttachFiles() {
		fileInputRef?.click();
	}

	async function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files;

		if (!files || files.length === 0) return;

		// Validate and process files
		const validFiles: File[] = [];
		const errors: string[] = [];

		for (const file of Array.from(files)) {
			// Validate file size
			if (!validateFileSize(file, maxFileSizeMB)) {
				errors.push(
					`"${file.name}" is too large (${formatFileSize(file.size)}). Maximum size is ${maxFileSizeMB}MB.`
				);
				continue;
			}

			// Validate file type
			if (acceptedFileTypes.length > 0 && !validateFileType(file, acceptedFileTypes)) {
				errors.push(`"${file.name}" is not an accepted file type.`);
				continue;
			}

			validFiles.push(file);
		}

		// Show errors if any
		if (errors.length > 0) {
			store.dispatch({
				type: 'streamError',
				error: errors.join(' ')
			});
		}

		// Convert valid files to attachments
		try {
			const newAttachments = await Promise.all(
				validFiles.map((file) => createAttachmentFromFile(file))
			);

			pendingAttachments = [...pendingAttachments, ...newAttachments];
		} catch (error) {
			store.dispatch({
				type: 'streamError',
				error: `Failed to process files: ${error instanceof Error ? error.message : 'Unknown error'}`
			});
		}

		// Reset input so same file can be selected again
		input.value = '';
	}

	function removeAttachment(index: number) {
		// Revoke blob URL to prevent memory leak
		const attachment = pendingAttachments[index];
		if (attachment) {
			revokeFileBlobURL(attachment.url);
		}
		pendingAttachments = pendingAttachments.filter((_, i) => i !== index);
	}

	// Cleanup blob URLs on unmount to prevent memory leaks
	onDestroy(() => {
		pendingAttachments.forEach((attachment) => {
			revokeFileBlobURL(attachment.url);
		});
	});
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
				<ChatMessage {message} {store} />
			{/each}

			{#if $store.currentStreaming}
				<ChatMessage
					message={{
						id: 'streaming',
						role: 'assistant',
						content: $store.currentStreaming.content,
						timestamp: Date.now()
					}}
					{store}
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
		<!-- Pending Attachments Preview -->
		{#if pendingAttachments.length > 0}
			<div class="streaming-chat__attachments-preview">
				{#each pendingAttachments as attachment, index}
					<div class="attachment-preview-item">
						<span class="attachment-preview-icon">
							{getFileTypeIcon(attachment.type)}
						</span>
						<span class="attachment-preview-name">{attachment.filename}</span>
						<button
							type="button"
							class="attachment-preview-remove"
							onclick={() => removeAttachment(index)}
							aria-label="Remove attachment"
						>
							✕
						</button>
					</div>
				{/each}
			</div>
		{/if}

		<div class="streaming-chat__input-wrapper">
			<!-- Hidden file input -->
			<input
				type="file"
				bind:this={fileInputRef}
				onchange={handleFileSelect}
				multiple
				accept={acceptedFileTypes.length > 0
					? acceptedFileTypes.join(',')
					: 'image/*,video/*,audio/*,application/pdf,.pdf,.doc,.docx,.txt,.zip,.tar,.gz'}
				style="display: none;"
			/>

			<!-- Attach button -->
			<button
				type="button"
				class="streaming-chat__attach-btn"
				onclick={handleAttachFiles}
				disabled={$store.isWaitingForResponse}
				aria-label="Attach files"
				title="Attach files"
			>
				📎
			</button>

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
				{#if $store.currentStreaming}
					<button
						type="button"
						class="streaming-chat__button streaming-chat__button--stop"
						onclick={() => store.dispatch({ type: 'stopGeneration' })}
						aria-label="Stop generation"
					>
						■ Stop
					</button>
				{:else}
					<button
						type="submit"
						class="streaming-chat__button streaming-chat__button--primary"
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

	.streaming-chat__attachments-preview {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 12px;
		padding: 12px;
		background: #f5f5f5;
		border-radius: 6px;
	}

	.attachment-preview-item {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		background: white;
		border: 1px solid #d0d0d0;
		border-radius: 4px;
		font-size: 13px;
	}

	.attachment-preview-icon {
		font-size: 16px;
		flex-shrink: 0;
	}

	.attachment-preview-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 150px;
	}

	.attachment-preview-remove {
		background: none;
		border: none;
		color: #999;
		cursor: pointer;
		padding: 0;
		font-size: 14px;
		flex-shrink: 0;
	}

	.attachment-preview-remove:hover {
		color: #c00;
	}

	.streaming-chat__input-wrapper {
		display: flex;
		gap: 8px;
		align-items: flex-end;
	}

	.streaming-chat__attach-btn {
		padding: 10px;
		background: white;
		border: 1px solid #d0d0d0;
		border-radius: 6px;
		font-size: 20px;
		cursor: pointer;
		transition: background 0.2s, border-color 0.2s;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
	}

	.streaming-chat__attach-btn:hover:not(:disabled) {
		background: #f5f5f5;
		border-color: #007aff;
	}

	.streaming-chat__attach-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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

	.streaming-chat__button--stop {
		background: #dc2626;
		color: white;
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

	/* Dark mode: Attachments Preview */
	:global(.dark) .streaming-chat__attachments-preview {
		background: #1a1a1a;
	}

	:global(.dark) .attachment-preview-item {
		background: #2a2a2a;
		border-color: #444;
		color: #e0e0e0;
	}

	:global(.dark) .attachment-preview-remove {
		color: #999;
	}

	:global(.dark) .attachment-preview-remove:hover {
		color: #f66;
	}

	:global(.dark) .streaming-chat__attach-btn {
		background: #2a2a2a;
		border-color: #444;
		color: #e0e0e0;
	}

	:global(.dark) .streaming-chat__attach-btn:hover:not(:disabled) {
		background: #333;
		border-color: #0066cc;
	}
</style>
