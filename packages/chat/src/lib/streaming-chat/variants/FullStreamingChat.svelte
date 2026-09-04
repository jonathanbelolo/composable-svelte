<script lang="ts">
	/**
	 * FullStreamingChat Component
	 *
	 * Complete streaming chat variant with all features enabled:
	 * - Per-message action buttons (Copy, Edit, Regenerate)
	 * - Stop button for cancelling streams
	 * - Clear button for removing all messages
	 * - Full message interaction capabilities
	 *
	 * Perfect for:
	 * - Advanced chat applications
	 * - Power user interfaces
	 * - Full-featured AI assistants
	 */

	import { createScrollFollower, prefersReducedMotion } from '@composable-svelte/core/animation';
	import type { ScrollFollower } from '@composable-svelte/core/animation';
	import { onDestroy } from 'svelte';
	import type { Store } from '@composable-svelte/core';
	import type { StreamingChatState, StreamingChatAction, MessageAttachment } from '../types.js';
	import ChatMessageWithActions from '../primitives/ChatMessageWithActions.svelte';
	import PendingAttachmentPreview from '../attachment-components/PendingAttachmentPreview.svelte';
	import AttachmentPreviewModal from '../attachment-components/AttachmentPreviewModal.svelte';
	import {
		createAttachmentFromFile,
		revokeFileBlobURL,
		validateFileSize,
		validateFileType,
		formatFileSize
	} from '../utils.js';

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
		 * Maximum file size in MB (default: 10MB).
		 */
		maxFileSizeMB?: number | undefined;

		/**
		 * Accepted file types (e.g., ["image/*", ".pdf"]).
		 * Empty array allows all types (default).
		 */
		acceptedFileTypes?: string[] | undefined;

		/**
		 * Value to prefill the input with.
		 * When changed, sets the input value. Parent should manage when to clear.
		 */
		prefillValue?: string | undefined;

		/**
		 * Callback when prefill has been applied and input is ready for user.
		 * Call this to acknowledge the prefill was consumed.
		 */
		onPrefillApplied?: (() => void) | undefined;

		/**
		 * Custom label for user messages (default: "You").
		 */
		userLabel?: string | undefined;

		/**
		 * Custom label for assistant messages (default: "Assistant").
		 */
		assistantLabel?: string | undefined;

		/**
		 * Avatar URL for user messages.
		 */
		userAvatarUrl?: string | undefined;

		/**
		 * Avatar URL for assistant messages.
		 */
		assistantAvatarUrl?: string | undefined;
	}

	const {
		store,
		placeholder = 'Type your message...',
		showClearButton = true,
		class: className = '',
		maxFileSizeMB = 10,
		acceptedFileTypes = [],
		prefillValue = '',
		onPrefillApplied,
		userLabel = 'You',
		assistantLabel = 'Assistant',
		userAvatarUrl,
		assistantAvatarUrl
	}: Props = $props();

	// Input state
	let inputValue = $state('');
	let messagesContainer: HTMLDivElement;
	let shouldAutoScroll = $state(true);
	let fileInputRef: HTMLInputElement;
	// The store is the single source of truth. This used to be a component-local
	// `$state` array, which meant `state.pendingAttachments` was permanently `[]`
	// — its three reducer actions had no dispatcher, its exhaustive tests covered
	// a path nothing took, and attachments could not survive a session restore.
	const pendingAttachments = $derived($store.pendingAttachments);
	// The preview lifecycle lives in the store, like `pendingAttachments` before
	// it. A component-local boolean could not hold the element on screen for its
	// exit animation, nor defer the removal until that exit finished.
	const previewPresentation = $derived($store.attachmentPreview.presentation);
	const previewingAttachment = $derived(
		previewPresentation.status === 'idle' ? null : previewPresentation.content
	);
	const previewOpen = $derived(
		previewPresentation.status === 'presenting' || previewPresentation.status === 'presented'
	);
	let inputRef: HTMLTextAreaElement;

	// Handle prefill value changes
	$effect(() => {
		if (prefillValue) {
			inputValue = prefillValue;
			// Focus the input after prefill
			if (inputRef) {
				inputRef.focus();
				// Move cursor to end
				inputRef.setSelectionRange(prefillValue.length, prefillValue.length);
			}
			// Notify parent that prefill was applied
			onPrefillApplied?.();
		}
	});

	// Use $store auto-subscription
	const canSendMessage = $derived(
		!$store.isWaitingForResponse &&
			(inputValue.trim().length > 0 || pendingAttachments.length > 0)
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

		// No `attachments` field: the reducer reads `state.pendingAttachments` and
		// clears it. Passing them here is what made that branch unreachable.
		store.dispatch({
			type: 'sendMessage',
			message: message || '(Attachments)'
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

			for (const attachment of newAttachments) {
				store.dispatch({ type: 'addAttachment', attachment });
			}
		} catch (error) {
			store.dispatch({
				type: 'streamError',
				error: `Failed to process files: ${error instanceof Error ? error.message : 'Unknown error'}`
			});
		}

		// Reset input so same file can be selected again
		input.value = '';
	}

	// By id, not by index. The reducer removes by id, this removed by array index
	// and the preview modal resolved by object *reference* — three identities for
	// one list, of which only the reducer's survives the move into the store.
	// Revoking the blob URL is the reducer's job now, in an effect.
	function removeAttachment(attachmentId: string) {
		store.dispatch({ type: 'removeAttachment', attachmentId });
	}

	// Unmount still revokes: the store outlives this component, and the URLs
	// belong to the browser rather than to either of them.
	onDestroy(() => {
		$store.pendingAttachments.forEach((attachment) => {
			revokeFileBlobURL(attachment.url);
		});
	});
</script>

<div class="full-streaming-chat {className}">
	<!-- Messages Container -->
	<div class="full-streaming-chat__messages" bind:this={messagesContainer} onscroll={handleScroll}>
		{#if $store.messages.length === 0 && !$store.currentStreaming}
			<div class="full-streaming-chat__empty">
				<p>No messages yet. Start a conversation!</p>
			</div>
		{:else}
			{#each $store.messages as message (message.id)}
				<ChatMessageWithActions
					{message}
					{store}
					{userLabel}
					{assistantLabel}
					{userAvatarUrl}
					{assistantAvatarUrl}
					animateIn={message.id === $store.lastAppendedId}
				/>
			{/each}

			{#if $store.currentStreaming}
				<ChatMessageWithActions
					message={{
						id: 'streaming',
						role: 'assistant',
						content: $store.currentStreaming.content,
						timestamp: Date.now()
					}}
					{store}
					{userLabel}
					{assistantLabel}
					{userAvatarUrl}
					{assistantAvatarUrl}
					isStreaming={true}
				/>
			{/if}
		{/if}
	</div>

	<!-- Error Display -->
	{#if $store.error}
		<div class="full-streaming-chat__error">
			<span class="full-streaming-chat__error-text">{$store.error}</span>
			<button
				class="full-streaming-chat__error-close"
				onclick={() => store.dispatch({ type: 'clearError' })}
				aria-label="Dismiss error"
			>
				✕
			</button>
		</div>
	{/if}

	<!-- Input Form -->
	<form class="full-streaming-chat__form" onsubmit={handleSubmit}>
		<!-- Pending Attachments Preview -->
		{#if pendingAttachments.length > 0}
			<div class="full-streaming-chat__attachments-preview">
				{#each pendingAttachments as attachment (attachment.id)}
					<PendingAttachmentPreview
						{attachment}
						onclick={() => store.dispatch({ type: 'attachmentPreviewOpened', attachment })}
						onremove={() => removeAttachment(attachment.id)}
					/>
				{/each}
			</div>
		{/if}

		<div class="full-streaming-chat__input-wrapper">
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
				class="full-streaming-chat__attach-btn"
				onclick={handleAttachFiles}
				disabled={$store.isWaitingForResponse}
				aria-label="Attach files"
				title="Attach files"
			>
				📎
			</button>

			<textarea
				class="full-streaming-chat__input"
				bind:this={inputRef}
				bind:value={inputValue}
				onkeydown={handleKeyDown}
				{placeholder}
				disabled={$store.isWaitingForResponse}
				rows="1"
				aria-label="Chat message input"
			></textarea>
			<div class="full-streaming-chat__actions">
				{#if showClearButton && $store.messages.length > 0}
					<button
						type="button"
						class="full-streaming-chat__button full-streaming-chat__button--secondary"
						onclick={handleClear}
						aria-label="Clear messages"
					>
						Clear
					</button>
				{/if}
				{#if $store.currentStreaming}
					<button
						type="button"
						class="full-streaming-chat__button full-streaming-chat__button--stop"
						onclick={() => store.dispatch({ type: 'stopGeneration' })}
						aria-label="Stop generation"
					>
						■ Stop
					</button>
				{:else}
					<button
						type="submit"
						class="full-streaming-chat__button full-streaming-chat__button--primary"
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

<!-- Attachment Preview Modal -->
<AttachmentPreviewModal
	attachment={previewingAttachment}
	open={previewOpen}
	presentation={previewPresentation}
	onclose={() => store.dispatch({ type: 'attachmentPreviewDismissed' })}
	onremove={() => store.dispatch({ type: 'attachmentPreviewRemoveRequested' })}
	onPresentationComplete={() =>
		store.dispatch({
			type: 'attachmentPreviewPresentation',
			event: { type: 'presentationCompleted' }
		})}
	onDismissalComplete={() =>
		store.dispatch({
			type: 'attachmentPreviewPresentation',
			event: { type: 'dismissalCompleted' }
		})}
/>

<style>
	.full-streaming-chat {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: hsl(var(--background, 0 0% 100%));
		border: 1px solid hsl(var(--border, 0 0% 87.8%));
		border-radius: 8px;
		overflow: hidden;
	}

	.full-streaming-chat__messages {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
	}

	.full-streaming-chat__empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: hsl(var(--muted-foreground, 0 0% 60%));
		font-size: 14px;
	}

	.full-streaming-chat__error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		background: #fee;
		border-top: 1px solid #fcc;
		color: hsl(var(--destructive, 0 100% 40%));
		font-size: 14px;
	}

	.full-streaming-chat__error-text {
		flex: 1;
	}

	.full-streaming-chat__error-close {
		background: none;
		border: none;
		color: hsl(var(--destructive, 0 100% 40%));
		cursor: pointer;
		font-size: 18px;
		padding: 0 8px;
	}

	.full-streaming-chat__error-close:hover {
		opacity: 0.7;
	}

	.full-streaming-chat__form {
		border-top: 1px solid hsl(var(--border, 0 0% 87.8%));
		padding: 16px;
		background: hsl(var(--muted, 0 0% 98%));
	}

	.full-streaming-chat__attachments-preview {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 12px;
	}

	.full-streaming-chat__input-wrapper {
		display: flex;
		gap: 8px;
		align-items: flex-end;
	}

	.full-streaming-chat__attach-btn {
		padding: 10px;
		background: hsl(var(--background, 0 0% 100%));
		border: 1px solid hsl(var(--border, 0 0% 81.6%));
		border-radius: 6px;
		font-size: 20px;
		cursor: pointer;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
	}

	.full-streaming-chat__attach-btn:hover:not(:disabled) {
		background: hsl(var(--muted, 0 0% 96.1%));
		border-color: hsl(var(--primary, 211.3 100% 50%));
	}

	.full-streaming-chat__attach-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.full-streaming-chat__input {
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

	.full-streaming-chat__input:focus {
		outline: none;
		border-color: hsl(var(--primary, 211.3 100% 50%));
	}

	.full-streaming-chat__input:disabled {
		background: hsl(var(--muted, 0 0% 96.1%));
		cursor: not-allowed;
	}

	.full-streaming-chat__actions {
		display: flex;
		gap: 8px;
	}

	.full-streaming-chat__button {
		padding: 10px 16px;
		border: none;
		border-radius: 6px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}

	.full-streaming-chat__button:hover:not(:disabled) {
		opacity: 0.8;
	}

	.full-streaming-chat__button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.full-streaming-chat__button--primary {
		background: hsl(var(--primary, 211.3 100% 50%));
		color: hsl(var(--primary-foreground, 0 0% 100%));
	}

	.full-streaming-chat__button--secondary {
		background: hsl(var(--muted, 0 0% 87.8%));
		color: hsl(var(--foreground, 0 0% 20%));
	}

	.full-streaming-chat__button--stop {
		background: hsl(var(--destructive, 0 72.2% 50.6%));
		color: hsl(var(--destructive-foreground, 0 0% 100%));
	}</style>
