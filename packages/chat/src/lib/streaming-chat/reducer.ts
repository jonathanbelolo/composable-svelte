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
import type { PresentationState } from '@composable-svelte/core';

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

/**
 * Close the reaction picker if the message it belongs to has gone.
 *
 * Its element unmounts with the message, and Motion One's promise for an
 * unmounted element never settles — so the completion never arrives and the
 * lifecycle sticks at `presenting` forever, after which the reducer's own
 * `status !== 'presented'` guard refuses every later dismiss.
 *
 * Keyed on presence in the surviving list rather than on the deleted id, because
 * deleting a *user* message truncates every message after it: a picker several
 * messages below dies without ever being named.
 */
function pickerAfterMessages(
	picker: PresentationState<string>,
	messages: Message[]
): PresentationState<string> {
	if (picker.status === 'idle') return picker;
	return messages.some((m) => m.id === picker.content) ? picker : { status: 'idle' };
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

			// Anything about to be uploaded is marked before the message is
			// appended. `_internal_attachmentUploadProgress` only writes to an
			// attachment already in `'uploading'`, and nothing ever put one there —
			// so every progress report a consumer's `onProgress` produced was
			// dispatched, clamped and discarded. The predicate is the same one
			// `uploadThenStream` uses to decide what to upload; anything else keeps
			// no upload status at all, because no upload happens to it.
			const willUpload = deps.uploadFile !== undefined;
			const trackedAttachments = attachments?.map((attachment) =>
				willUpload && /^(blob:|data:)/.test(attachment.url)
					? { ...attachment, uploadStatus: 'uploading' as const, uploadProgress: 0 }
					: attachment
			);

			// Add user message to conversation
			const userMessage: Message = {
				id: generateId(),
				role: 'user',
				content: action.message,
				timestamp: getTimestamp(),
				// Include attachments if any
				...(trackedAttachments !== undefined && { attachments: trackedAttachments })
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
				trackedAttachments && trackedAttachments.length > 0 && deps.uploadFile
					? uploadThenStream(userMessage.id, action.message, trackedAttachments, deps)
					: streamNow(action.message, trackedAttachments, deps)
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
				// Directly, for the same reason as `submitEditedMessage`: the user
				// message is still in `newMessages`, and `sendMessage` would append
				// a second copy of it beneath the regenerated reply.
				streamNow(userMessage.content, userMessage.attachments, deps)
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
					reactionPicker: pickerAfterMessages(state.reactionPicker, newMessages)
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
					// The picker lives in the display branch, so editing unmounts it.
					reactionPicker: { status: 'idle' }
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
				// Stream directly rather than dispatching `sendMessage`, which
				// appends a user message unconditionally — so editing a message
				// used to leave two copies of it in the conversation. The edited
				// one is already in `newMessages` above; only the reply is missing.
				// Its attachments go with it: they are the same files, already
				// uploaded, so there is nothing to redo.
				streamNow(editedContent, updatedMessage.attachments, deps)
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
				const existing = reactions[existingReactionIndex]!;
				// Idempotent. This used to increment unconditionally, so clicking your
				// own reaction ten times reported ten people.
				if (existing.reactedByMe) return [state, Effect.none()];

				updatedReactions = reactions.map((r, i) =>
					i === existingReactionIndex ? { ...r, count: r.count + 1, reactedByMe: true } : r
				);
			} else {
				updatedReactions = [...reactions, { emoji: action.emoji, count: 1, reactedByMe: true }];
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

			// Only your own reaction is yours to remove. Without this the button
			// would decrement a count made up of other people.
			if (!existingReaction.reactedByMe) return [state, Effect.none()];

			let updatedReactions: MessageReaction[];

			if (existingReaction.count > 1) {
				updatedReactions = reactions.map((r, i) =>
					i === existingReactionIndex ? { ...r, count: r.count - 1, reactedByMe: false } : r
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
					reactionPicker: { status: 'idle' }
				},
				Effect.none()
			];
		}

		// === Reaction picker lifecycle === //

		case 'reactionPickerOpened': {
			const current = state.reactionPicker;
			if (
				(current.status === 'presenting' || current.status === 'presented') &&
				current.content === action.messageId
			) {
				return [state, Effect.none()];
			}

			// One slot: opening on another message moves it rather than stacking.
			return [
				{ ...state, reactionPicker: { status: 'presenting', content: action.messageId } },
				Effect.none()
			];
		}

		case 'reactionPickerDismissed': {
			const current = state.reactionPicker;
			if (current.status !== 'presented') return [state, Effect.none()];

			return [
				{ ...state, reactionPicker: { status: 'dismissing', content: current.content } },
				Effect.none()
			];
		}

		case 'reactionPickerPresentation': {
			const current = state.reactionPicker;

			if (action.event.type === 'presentationCompleted') {
				if (current.status !== 'presenting') return [state, Effect.none()];
				return [
					{ ...state, reactionPicker: { status: 'presented', content: current.content } },
					Effect.none()
				];
			}

			if (current.status !== 'dismissing') return [state, Effect.none()];
			return [{ ...state, reactionPicker: { status: 'idle' } }, Effect.none()];
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
					lastAppendedId: null,
					// Both overlays belonged to the session being replaced. Leaving the
					// preview standing was a gap in the commit that introduced it: a
					// restore left it pointing at an attachment that no longer exists.
					reactionPicker: { status: 'idle' },
					attachmentPreview: { presentation: { status: 'idle' }, removeOnDismiss: false }
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
