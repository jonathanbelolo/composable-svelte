<script lang="ts">
	import type { Store } from '@composable-svelte/core';
	import type { Message, StreamingChatState, StreamingChatAction } from '../types.js';
	import ChatMessage from './ChatMessage.svelte';
	import ContextMenu from './ContextMenu.svelte';
	import ReactionPicker from './ReactionPicker.svelte';

	/**
	 * Chat message with context menu and edit mode.
	 *
	 * Composes ChatMessage + ContextMenu primitives.
	 * Handles inline editing for user messages.
	 * Includes all message actions: Copy, Edit, Regenerate, Delete, Reactions.
	 */
	interface Props {
		message: Message;
		store: Store<StreamingChatState, StreamingChatAction>;
		isStreaming?: boolean;
	}

	const { message, store, isStreaming = false }: Props = $props();

	// Check if this message is being edited
	const isEditing = $derived($store.editingMessage?.id === message.id);
	const editContent = $derived($store.editingMessage?.content ?? '');

	// Reaction picker state
	let showReactionPicker = $state(false);

	// Handle reaction click (toggle or add/remove)
	function handleReactionClick(emoji: string) {
		store.dispatch({ type: 'addReaction', messageId: message.id, emoji });
	}

	// Handle adding reaction from picker
	function handleAddReaction(emoji: string) {
		store.dispatch({ type: 'addReaction', messageId: message.id, emoji });
	}
</script>

{#if isEditing && message.role === 'user'}
	<!-- Edit mode for user messages -->
	<div class="chat-message chat-message--editing" data-role="user">
		<div class="chat-message__header">
			<span class="chat-message__role">You (editing)</span>
		</div>
		<div class="chat-message__edit-form">
			<textarea
				class="chat-message__edit-textarea"
				value={editContent}
				oninput={(e) => store.dispatch({
					type: 'updateEditingContent',
					content: (e.target as HTMLTextAreaElement).value
				})}
				rows="3"
				autofocus
			/>
			<div class="chat-message__edit-actions">
				<button
					type="button"
					class="chat-message__edit-button chat-message__edit-button--cancel"
					onclick={() => store.dispatch({ type: 'cancelEditing' })}
				>
					Cancel
				</button>
				<button
					type="button"
					class="chat-message__edit-button chat-message__edit-button--save"
					onclick={() => store.dispatch({ type: 'submitEditedMessage' })}
					disabled={!editContent.trim()}
				>
					Save & Resend
				</button>
			</div>
		</div>
	</div>
{:else}
	<!-- Normal display mode -->
	<div class="chat-message-with-actions">
		<ChatMessage
			{message}
			{isStreaming}
			onReactionClick={handleReactionClick}
			onAddReaction={() => (showReactionPicker = true)}
		>
			{#snippet headerActions()}
				{#if !isStreaming}
					<ContextMenu {message} {store} onAddReaction={() => (showReactionPicker = true)} />
				{/if}
			{/snippet}
		</ChatMessage>

		<!-- Reaction Picker -->
		<ReactionPicker
			open={showReactionPicker}
			onselect={handleAddReaction}
			onclose={() => (showReactionPicker = false)}
		/>
	</div>
{/if}

<style>
	.chat-message-with-actions {
		position: relative;
	}

	.chat-message--editing {
		padding: 12px 16px;
		margin: 8px 0;
		border-radius: 8px;
		max-width: 85%;
		background: #007aff;
		color: white;
		margin-left: auto;
		align-self: flex-end;
	}

	.chat-message__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
		font-size: 12px;
		opacity: 0.9;
	}

	.chat-message__role {
		font-weight: 600;
	}

	.chat-message__edit-form {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.chat-message__edit-textarea {
		width: 100%;
		padding: 8px;
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 4px;
		font-size: 14px;
		font-family: inherit;
		background: rgba(255, 255, 255, 0.95);
		color: #1a1a1a;
		resize: vertical;
		min-height: 60px;
	}

	.chat-message__edit-textarea:focus {
		outline: none;
		border-color: rgba(255, 255, 255, 0.6);
		background: white;
	}

	.chat-message__edit-actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}

	.chat-message__edit-button {
		padding: 6px 12px;
		border: none;
		border-radius: 4px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.chat-message__edit-button:hover:not(:disabled) {
		opacity: 0.8;
	}

	.chat-message__edit-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.chat-message__edit-button--cancel {
		background: rgba(255, 255, 255, 0.2);
		color: white;
	}

	.chat-message__edit-button--save {
		background: white;
		color: #007aff;
	}

	/* Dark mode support */
	:global(.dark) .chat-message--editing {
		background: #0066cc;
	}
</style>
