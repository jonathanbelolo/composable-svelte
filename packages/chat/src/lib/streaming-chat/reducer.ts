/**
 * Streaming Chat Reducer
 *
 * Pure reducer for streaming chat state management.
 * Transport-agnostic - works with any streaming implementation.
 */

import type { EffectType } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import { revokeFileBlobURL } from './utils.js';
import type {
	StreamingChatState,
	StreamingChatAction,
	StreamingChatDependencies,
	Message,
	MessageReaction,
	MessageAttachment
} from './types.js';

/**
 * Streaming chat reducer.
 *
 * Manages conversation state and coordinates with streaming transport.
 */
/**
 * Start the stream, handing the transport whatever attachments the message has.
 *
 * `streamMessage` used to be called with the text alone, so a file the user
 * attached reached the rendered bubble and stopped there — the backend and the
 * model never saw it.
 */
function streamNow(
	message: string,
	attachments: MessageAttachment[] | undefined,
	deps: StreamingChatDependencies
): EffectType<StreamingChatAction> {
	return Effect.run(async (dispatch) => {
		const abortController = deps.streamMessage(
			message,
			(chunk) => dispatch({ type: 'chunkReceived', chunk }),
			() => dispatch({ type: 'streamComplete' }),
			(error) => dispatch({ type: 'streamError', error }),
			attachments
		);

		if (abortController) {
			dispatch({ type: '_internal_setAbortController', abortController });
		}
	});
}

/**
 * Upload every attachment, then stream.
 *
 * One effect rather than a per-file state machine: `Promise.all` settles them
 * all and dispatches a single resolved list, so the reducer never has to work
 * out whether the last one is done.
 *
 * The file is recovered from its own URL rather than kept in state. `uploadFile`
 * needs a `File` and `MessageAttachment` holds only a URL — and putting a `File`
 * into reducer state would break the serializable-state discipline the rest of
 * the repo keeps. An already-remote URL is left alone: a restored session must
 * not re-upload what it is already pointing at.
 */
function uploadThenStream(
	messageId: string,
	message: string,
	attachments: MessageAttachment[],
	deps: StreamingChatDependencies
): EffectType<StreamingChatAction> {
	return Effect.run(async (dispatch) => {
		const resolved = await Promise.all(
			attachments.map(async (attachment) => {
				if (!/^(blob:|data:)/.test(attachment.url)) return attachment;

				try {
					const blob = await fetch(attachment.url).then((r) => r.blob());
					const file = new File([blob], attachment.filename, { type: attachment.mimeType });

					const url = await deps.uploadFile!(file, (loaded, total) => {
						dispatch({
							type: '_internal_attachmentUploadProgress',
							messageId,
							attachmentId: attachment.id,
							// The public dependency reports bytes; the state holds a
							// percentage, because that is what a progress bar announces.
							progress: total > 0 ? (loaded / total) * 100 : 0
						});
					});

					return { ...attachment, url, uploadStatus: 'success' as const, uploadProgress: 100 };
				} catch (error) {
					// Deliberately keeps the local URL. The sender can still see their
					// own file and the message still sends; only its reach is reduced.
					return {
						...attachment,
						uploadStatus: 'error' as const,
						uploadError: error instanceof Error ? error.message : 'Upload failed'
					};
				}
			})
		);

		dispatch({ type: '_internal_attachmentsResolved', messageId, message, attachments: resolved });
	});
}

export function streamingChatReducer(
	state: StreamingChatState,
	action: StreamingChatAction,
	deps: StreamingChatDependencies
): [StreamingChatState, EffectType<StreamingChatAction>] {
	const generateId = deps.generateId || (() => crypto.randomUUID());
	const getTimestamp = deps.getTimestamp || (() => Date.now());

	switch (action.type) {
		case 'sendMessage': {
			// Use attachments from action if provided, otherwise use pending attachments from state
			const attachments = action.attachments ?? (state.pendingAttachments.length > 0 ? state.pendingAttachments : undefined);

			// Add user message to conversation
			const userMessage: Message = {
				id: generateId(),
				role: 'user',
				content: action.message,
				timestamp: getTimestamp(),
				// Include attachments if any
				...(attachments !== undefined && { attachments })
			};

			return [
				{
					...state,
					messages: [...state.messages, userMessage],
					lastAppendedId: userMessage.id,
					currentStreaming: { content: '' },
					isWaitingForResponse: true,
					error: null,
					pendingAttachments: [] // Clear attachments after sending
				},
				// Uploads first, if there are any and the consumer can do them.
				// Streaming waits, because the whole point of uploading is that the
				// URL the backend receives resolves for someone other than the sender.
				attachments && attachments.length > 0 && deps.uploadFile
					? uploadThenStream(userMessage.id, action.message, attachments, deps)
					: streamNow(action.message, attachments, deps)
			];
		}

		case '_internal_attachmentUploadProgress': {
			// Clamped, and ignored unless the attachment is still uploading. A
			// callback arriving after the upload settled would otherwise rewind a
			// finished bar — the same two guards core's file-upload reducer carries.
			const progress = Math.min(100, Math.max(0, action.progress));

			return [
				{
					...state,
					messages: state.messages.map((message) =>
						message.id !== action.messageId || !message.attachments
							? message
							: {
									...message,
									attachments: message.attachments.map((a) =>
										a.id === action.attachmentId && a.uploadStatus === 'uploading'
											? { ...a, uploadProgress: progress }
											: a
									)
								}
					)
				},
				Effect.none()
			];
		}

		case '_internal_attachmentsResolved': {
			return [
				{
					...state,
					messages: state.messages.map((message) =>
						message.id === action.messageId
							? { ...message, attachments: action.attachments }
							: message
					)
				},
				streamNow(action.message, action.attachments, deps)
			];
		}

		case 'chunkReceived': {
			if (!state.currentStreaming) {
				return [state, Effect.none()];
			}

			return [
				{
					...state,
					currentStreaming: {
						...state.currentStreaming,
						content: state.currentStreaming.content + action.chunk,
					},
					isWaitingForResponse: false
				},
				Effect.none()
			];
		}

		case 'streamComplete': {
			if (!state.currentStreaming) {
				return [state, Effect.none()];
			}

			// Add assistant message to conversation
			const assistantMessage: Message = {
				id: generateId(),
				role: 'assistant',
				content: state.currentStreaming.content,
				timestamp: getTimestamp()
			};

			return [
				{
					...state,
					messages: [...state.messages, assistantMessage],
					currentStreaming: null,
					isWaitingForResponse: false
				},
				Effect.none()
			];
		}

		case 'streamError': {
			return [
				{
					...state,
					currentStreaming: null,
					isWaitingForResponse: false,
					error: action.error
				},
				Effect.none()
			];
		}

		case 'stopGeneration': {
			if (!state.currentStreaming?.abortController) {
				return [state, Effect.none()];
			}

			// Abort the stream
			state.currentStreaming.abortController.abort();

			// Save partial content as a message if there's any content
			if (state.currentStreaming.content.trim()) {
				const partialMessage: Message = {
					id: generateId(),
					role: 'assistant',
					content: state.currentStreaming.content,
					timestamp: getTimestamp()
				};

				return [
					{
						...state,
						messages: [...state.messages, partialMessage],
						currentStreaming: null,
						isWaitingForResponse: false
					},
					Effect.none()
				];
			}

			return [
				{
					...state,
					currentStreaming: null,
					isWaitingForResponse: false
				},
				Effect.none()
			];
		}

		case 'regenerateMessage': {
			const messageIndex = state.messages.findIndex((m) => m.id === action.messageId);
			if (messageIndex === -1 || state.messages[messageIndex]!.role !== 'assistant') {
				return [state, Effect.none()];
			}

			// Find preceding user message
			let userMessageIndex = messageIndex - 1;
			while (userMessageIndex >= 0 && state.messages[userMessageIndex]!.role !== 'user') {
				userMessageIndex--;
			}

			if (userMessageIndex === -1) {
				return [state, Effect.none()]; // No user message found
			}

			const userMessage = state.messages[userMessageIndex]!;

			// Remove all messages after (and including) the assistant message being regenerated
			const newMessages = state.messages.slice(0, messageIndex);

			return [
				{
					...state,
					messages: newMessages,
					isWaitingForResponse: true,
					currentStreaming: { content: '' },
					error: null,
				},
				Effect.run(async (dispatch) => {
					// Re-send the user message
					dispatch({ type: 'sendMessage', message: userMessage.content });
				})
			];
		}

		case 'copyMessage': {
			const message = state.messages.find((m) => m.id === action.messageId);
			if (!message) {
				return [state, Effect.none()];
			}

			return [
				{ ...state },
				Effect.run(async (dispatch) => {
					try {
						await navigator.clipboard.writeText(message.content);
						dispatch({ type: 'copySuccess' });
					} catch (error) {
						dispatch({
							type: 'copyError',
							error: error instanceof Error ? error.message : 'Failed to copy'
						});
					}
				})
			];
		}

		case 'copySuccess': {
			// Could show temporary success feedback in the future
			return [state, Effect.none()];
		}

		case 'copyError': {
			return [
				{
					...state,
					error: action.error
				},
				Effect.none()
			];
		}

		case 'deleteMessage': {
			const messageIndex = state.messages.findIndex((m) => m.id === action.messageId);
			if (messageIndex === -1) {
				return [state, Effect.none()];
			}

			const message = state.messages[messageIndex]!;

			let newMessages: Message[];
			if (message.role === 'user') {
				// Remove this message and all following messages
				newMessages = state.messages.slice(0, messageIndex);
			} else {
				// Remove just this message
				newMessages = [
					...state.messages.slice(0, messageIndex),
					...state.messages.slice(messageIndex + 1)
				];
			}

			return [
				{
					...state,
					messages: newMessages,
				},
				Effect.none()
			];
		}

		case 'startEditingMessage': {
			const message = state.messages.find((m) => m.id === action.messageId);
			if (!message || message.role !== 'user') {
				return [state, Effect.none()];
			}

			return [
				{
					...state,
					editingMessage: {
						id: action.messageId,
						content: message.content
					},
				},
				Effect.none()
			];
		}

		case 'updateEditingContent': {
			if (!state.editingMessage) {
				return [state, Effect.none()];
			}

			return [
				{
					...state,
					editingMessage: {
						...state.editingMessage,
						content: action.content
					}
				},
				Effect.none()
			];
		}

		case 'submitEditedMessage': {
			if (!state.editingMessage || !state.editingMessage.content.trim()) {
				return [state, Effect.none()];
			}

			const messageIndex = state.messages.findIndex((m) => m.id === state.editingMessage!.id);
			if (messageIndex === -1) {
				return [state, Effect.none()];
			}

			// Update the message content
			const updatedMessage = {
				...state.messages[messageIndex]!,
				content: state.editingMessage.content
			};

			// Remove all messages after the edited one
			const newMessages = [...state.messages.slice(0, messageIndex), updatedMessage];

			const editedContent = state.editingMessage.content;

			return [
				{
					...state,
					messages: newMessages,
					editingMessage: null,
					isWaitingForResponse: true,
					currentStreaming: { content: '' },
					error: null
				},
				Effect.run(async (dispatch) => {
					// Send the edited message
					dispatch({ type: 'sendMessage', message: editedContent });
				})
			];
		}

		case 'cancelEditing': {
			return [
				{
					...state,
					editingMessage: null
				},
				Effect.none()
			];
		}

		case '_internal_setAbortController': {
			if (!state.currentStreaming) {
				return [state, Effect.none()];
			}

			return [
				{
					...state,
					currentStreaming: {
						...state.currentStreaming,
						abortController: action.abortController
					}
				},
				Effect.none()
			];
		}

		case 'addAttachment': {
			return [
				{
					...state,
					pendingAttachments: [...state.pendingAttachments, action.attachment]
				},
				Effect.none()
			];
		}

		case 'removeAttachment': {
			const removed = state.pendingAttachments.find((a) => a.id === action.attachmentId);

			return [
				{
					...state,
					pendingAttachments: state.pendingAttachments.filter(
						(attachment) => attachment.id !== action.attachmentId
					)
				},
				// Revoking belongs here rather than in the component that happened to
				// dispatch. A blob URL is a browser resource owned by the list, and
				// the list lives in the store now — a caller who forgets leaks it.
				removed
					? Effect.fireAndForget(async () => {
							revokeFileBlobURL(removed.url);
						})
					: Effect.none()
			];
		}

		case 'clearAttachments': {
			return [
				{
					...state,
					pendingAttachments: []
				},
				Effect.none()
			];
		}

		case 'addReaction': {
			const messageIndex = state.messages.findIndex((m) => m.id === action.messageId);
			if (messageIndex === -1) {
				return [state, Effect.none()];
			}

			const message = state.messages[messageIndex]!;
			const reactions = message.reactions || [];
			const existingReactionIndex = reactions.findIndex((r) => r.emoji === action.emoji);

			let updatedReactions: MessageReaction[];
			if (existingReactionIndex !== -1) {
				// Increment count for existing reaction
				updatedReactions = reactions.map((r, i) =>
					i === existingReactionIndex ? { ...r, count: r.count + 1 } : r
				);
			} else {
				// Add new reaction
				updatedReactions = [...reactions, { emoji: action.emoji, count: 1 }];
			}

			const newMessages = [...state.messages];
			newMessages[messageIndex]! = {
				...message,
				reactions: updatedReactions
			};

			return [
				{
					...state,
					messages: newMessages
				},
				Effect.none()
			];
		}

		case 'removeReaction': {
			const messageIndex = state.messages.findIndex((m) => m.id === action.messageId);
			if (messageIndex === -1) {
				return [state, Effect.none()];
			}

			const message = state.messages[messageIndex]!;
			const reactions = message.reactions || [];
			const existingReactionIndex = reactions.findIndex((r) => r.emoji === action.emoji);

			if (existingReactionIndex === -1) {
				return [state, Effect.none()];
			}

			const existingReaction = reactions[existingReactionIndex]!;
			let updatedReactions: MessageReaction[];

			if (existingReaction.count > 1) {
				// Decrement count
				updatedReactions = reactions.map((r, i) =>
					i === existingReactionIndex ? { ...r, count: r.count - 1 } : r
				);
			} else {
				// Remove reaction entirely
				updatedReactions = reactions.filter((_, i) => i !== existingReactionIndex);
			}

			const newMessages = [...state.messages];
			if (updatedReactions.length > 0) {
				newMessages[messageIndex]! = {
					...message,
					reactions: updatedReactions
				};
			} else {
				// Remove reactions property entirely
				const { reactions: _, ...messageWithoutReactions } = message;
				newMessages[messageIndex]! = messageWithoutReactions;
			}

			return [
				{
					...state,
					messages: newMessages
				},
				Effect.none()
			];
		}

		case 'clearError': {
			return [
				{
					...state,
					error: null
				},
				Effect.none()
			];
		}

		case 'clearMessages': {
			return [
				{
					...state,
					messages: [],
					currentStreaming: null,
					isWaitingForResponse: false,
					error: null,
					editingMessage: null,
				},
				Effect.none()
			];
		}

		// === Attachment preview lifecycle === //

		case 'attachmentPreviewOpened': {
			const current = state.attachmentPreview.presentation;
			// Only a redundant open is refused. Re-opening while an exit is still in
			// flight is allowed: blocking it would make the preview ignore a click
			// for the length of the animation, and the component's (status, content)
			// guard restarts the entrance from wherever the element currently is.
			if (
				(current.status === 'presenting' || current.status === 'presented') &&
				current.content === action.attachment
			) {
				return [state, Effect.none()];
			}

			return [
				{
					...state,
					attachmentPreview: {
						presentation: { status: 'presenting', content: action.attachment },
						removeOnDismiss: false
					}
				},
				Effect.none()
			];
		}

		case 'attachmentPreviewDismissed': {
			const current = state.attachmentPreview.presentation;
			// Refused until the entrance has finished, or a dismiss would run
			// against an entry animation still in flight.
			if (current.status !== 'presented') return [state, Effect.none()];

			return [
				{
					...state,
					attachmentPreview: {
						...state.attachmentPreview,
						presentation: { status: 'dismissing', content: current.content }
					}
				},
				Effect.none()
			];
		}

		case 'attachmentPreviewRemoveRequested': {
			const current = state.attachmentPreview.presentation;
			if (current.status !== 'presented') return [state, Effect.none()];

			// Recorded, not performed. `removeAttachment` revokes the blob URL that
			// the <img> in this modal is still displaying, so doing it now would
			// leave a blank box fading out for the length of the exit animation.
			return [
				{
					...state,
					attachmentPreview: {
						presentation: { status: 'dismissing', content: current.content },
						removeOnDismiss: true
					}
				},
				Effect.none()
			];
		}

		case 'attachmentPreviewPresentation': {
			const current = state.attachmentPreview.presentation;

			if (action.event.type === 'presentationCompleted') {
				if (current.status !== 'presenting') return [state, Effect.none()];
				return [
					{
						...state,
						attachmentPreview: {
							...state.attachmentPreview,
							presentation: { status: 'presented', content: current.content }
						}
					},
					Effect.none()
				];
			}

			if (current.status !== 'dismissing') return [state, Effect.none()];

			// The deferred removal, now that the element is off screen.
			const removing = state.attachmentPreview.removeOnDismiss ? current.content.id : null;

			return [
				{
					...state,
					attachmentPreview: { presentation: { status: 'idle' }, removeOnDismiss: false }
				},
				removing
					? Effect.run(async (dispatch) => {
							dispatch({ type: 'removeAttachment', attachmentId: removing });
						})
					: Effect.none()
			];
		}

		case 'restoreMessages': {
			// Restore messages from persistence (e.g., session recovery)
			// Resets streaming state to clean slate
			return [
				{
					...state,
					messages: action.messages,
					currentStreaming: null,
					isWaitingForResponse: false,
					error: null,
					editingMessage: null,
					// Nothing restored is new. Without this, a session recovery would
					// animate every message in as though it had just arrived.
					lastAppendedId: null
				},
				Effect.none()
			];
		}

		default: {
			const _never: never = action;
			return [state, Effect.none()];
		}
	}
}
