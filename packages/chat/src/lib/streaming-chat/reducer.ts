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
const STREAM_EFFECT_ID = 'streaming-chat/stream';
function streamNow(streamId: string | undefined, message: string, attachments: MessageAttachment[] | undefined, deps: StreamingChatDependencies): EffectType<StreamingChatAction> {
	return Effect.subscription(STREAM_EFFECT_ID, (dispatch) => {
		let live = true;
		let settled = false;
		const origin = streamId === undefined ? {} : { streamId };
		let controller: AbortController | void;
		const terminal = (action: StreamingChatAction) => {
			if (!live)
				return;
			live = false;
			settled = true;
			dispatch(action);
		};
		try {
			controller = deps.streamMessage(message, chunk => { if (live)
				dispatch({ type: 'chunkReceived', chunk, ...origin }); }, () => terminal({ type: 'streamComplete', ...origin }), error => terminal({ type: 'streamError', error, ...origin }), attachments);
		}
		catch (error) {
			terminal({ type: 'streamError', error: error instanceof Error ? error.message : 'Stream failed', ...origin });
		}
		let cleaned = false;
		const cleanup = () => { if (cleaned)
			return; cleaned = true; live = false; if (!settled)
			controller?.abort(); };
		if (!live)
			cleanup();
		return cleanup;
	});
}
/** Compatibility for consumers that explicitly supplied the legacy controller action. */
function cancelStream(state: StreamingChatState): EffectType<StreamingChatAction> {
	const controller = state.currentStreaming?.abortController;
	return Effect.batch(Effect.cancel(STREAM_EFFECT_ID), controller
		? Effect.fireAndForget(() => controller.abort()) : Effect.none());
}
/** Replacement is observable; applications decide whether to render or retry it. */
function notifySuperseded(state: StreamingChatState): EffectType<StreamingChatAction> {
	const streamId = state.activeStreamId;
	const messageId = state.activeStreamMessageId;
	return streamId != null && messageId != null
		? Effect.run((dispatch) => { dispatch({ type: 'streamSuperseded', streamId, messageId }); })
		: Effect.none();
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
/**
 * The cancellation id for one message's uploads.
 *
 * Uploads are per message; only the latest requested reply owns currentStreaming.
 * Superseded uploads still settle metadata, but never begin a stale reply.
 * A single shared id made the upload a singleton:
 * sending a second message with an attachment aborted the first one's upload
 * mid-flight, and because the store gates a cancelled effect's dispatch, the
 * first message's upload never settled and kept an attachment
 * frozen at `uploadStatus: 'uploading'` — which now renders a progress bar that
 * can never move. Any attachment-free send did the same to an upload in flight.
 */
const uploadIdFor = (messageId: string) => `streaming-chat/upload/${messageId}`;

/**
 * Cancel the uploads belonging to messages that are about to disappear.
 *
 * An upload outlives the message it was started for — it is an async effect —
 * and when it lands it dispatches a resolution that streams a reply. Deleting,
 * clearing or restoring over that message otherwise produced a reply to a
 * conversation that no longer contains the question.
 */
function cancelUploadsFor(messages: Message[]): EffectType<StreamingChatAction> {
	if (messages.length === 0) return Effect.none();
	return Effect.batch<StreamingChatAction>(
		...messages.map((message) => Effect.cancel<StreamingChatAction>(uploadIdFor(message.id)))
	);
}

/**
 * Start a reply for `message`, uploading anything that still needs it first.
 *
 * The single entry point for `sendMessage`, `submitEditedMessage` and
 * `regenerateMessage`. The last two used to dispatch `sendMessage` — which
 * appended a duplicate — and then, when that was fixed, skipped uploads
 * entirely, so a failed upload could never be retried.
 *
 * `Effect.cancel` on the streaming path is the other half. Editing a message
 * while its upload was in flight left that upload to land afterwards and start a
 * *second* stream, carrying the pre-edit text. Cancelling by id stops the
 * resolution being dispatched at all — the store gates dispatch on the abort
 * signal — and re-registering the same id supersedes an earlier upload for free.
 */
function streamFor(
	streamId: string,
	messageId: string,
	message: string,
	attachments: MessageAttachment[] | undefined,
	deps: StreamingChatDependencies
): EffectType<StreamingChatAction> {
	const outstanding = attachments?.some((a) => /^(blob:|data:)/.test(a.url)) ?? false;

	return deps.uploadFile && attachments && outstanding
		? uploadThenStream(streamId, messageId, message, attachments, deps)
		// Cancel only *this* message's upload: re-sending it supersedes whatever
		// was in flight for it, and nothing else's upload is any of its business.
		: Effect.batch(Effect.cancel(uploadIdFor(messageId)), streamNow(streamId, message, attachments, deps));
}

/**
 * Mark what `streamFor` is actually going to upload.
 *
 * `_internal_attachmentUploadProgress` writes only to an attachment already in
 * `'uploading'`, so anything not marked here reports progress into a guard that
 * drops it. `sendMessage` did this inline and the two retry paths did not, which
 * meant the defect its comment describes as fixed was fixed in one arm of three:
 * a retried upload showed a bar frozen at whatever it was before.
 *
 * The predicate is `streamFor`'s, deliberately — whatever decides to upload
 * decides what to mark, or the two drift apart again.
 */
function markUploading(
	attachments: MessageAttachment[] | undefined,
	deps: StreamingChatDependencies
): MessageAttachment[] | undefined {
	if (!deps.uploadFile || !attachments) return attachments;

	return attachments.map((attachment) =>
		/^(blob:|data:)/.test(attachment.url)
			? { ...attachment, uploadStatus: 'uploading' as const, uploadProgress: 0 }
			: attachment
	);
}

function uploadThenStream(
	streamId: string,
	messageId: string,
	message: string,
	attachments: MessageAttachment[],
	deps: StreamingChatDependencies
): EffectType<StreamingChatAction> {
	return Effect.cancellable(uploadIdFor(messageId), async (dispatch) => {
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

		dispatch({ type: '_internal_attachmentsResolved', streamId, messageId, message, attachments: resolved });
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
			const streamGeneration = (state.streamGeneration ?? 0) + 1;
			const streamId = String(streamGeneration);
			// Use attachments from action if provided, otherwise use pending attachments from state
			const attachments = action.attachments ?? (state.pendingAttachments.length > 0 ? state.pendingAttachments : undefined);

			// Anything about to be uploaded is marked before the message is
			// appended. `_internal_attachmentUploadProgress` only writes to an
			// attachment already in `'uploading'`, and nothing ever put one there —
			// so every progress report a consumer's `onProgress` produced was
			// dispatched, clamped and discarded. The predicate is the same one
			// `uploadThenStream` uses to decide what to upload; anything else keeps
			// no upload status at all, because no upload happens to it.
			const trackedAttachments = markUploading(attachments, deps);

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
					streamGeneration, activeStreamId: streamId, activeStreamMessageId: userMessage.id,
					isWaitingForResponse: true,
					error: null,
					pendingAttachments: [] // Clear attachments after sending
				},
				// Uploads first, if there are any and the consumer can do them.
				// Streaming waits, because the whole point of uploading is that the
				// URL the backend receives resolves for someone other than the sender.
				Effect.batch(
					cancelStream(state),
					streamFor(streamId, userMessage.id, action.message, trackedAttachments, deps),
					notifySuperseded(state)
				)
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
			let messagesChanged = false;
			const messages = state.messages.map((message) => {
				if (message.id !== action.messageId) return message;
				if (action.streamId === undefined) {
					if (message.attachments === action.attachments) return message;
					messagesChanged = true;
					return { ...message, attachments: action.attachments };
				}
				if (!message.attachments || message.attachments.length === 0) return message;

				let attachmentsChanged = false;
				const updatedAttachments = message.attachments.map((attachment) => {
					if (attachment.uploadStatus !== 'uploading') return attachment;
					const resolved = action.attachments.find((r) => r.id === attachment.id);
					if (!resolved || resolved === attachment) return attachment;
					attachmentsChanged = true;
					return resolved;
				});

				if (!attachmentsChanged) return message;
				messagesChanged = true;
				return { ...message, attachments: updatedAttachments };
			});

			const shouldStream =
				action.streamId !== undefined
					? action.streamId === state.activeStreamId
					: state.activeStreamId == null;

			return [
				messagesChanged ? { ...state, messages } : state,
				shouldStream
					? streamNow(action.streamId, action.message, action.attachments, deps)
					: Effect.none()
			];
		}

		case 'streamSuperseded':
			return [state, Effect.none()];

		case 'chunkReceived': {
			if (action.streamId !== undefined && action.streamId !== state.activeStreamId) return [state, Effect.none()];
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
			if (action.streamId !== undefined && action.streamId !== state.activeStreamId) return [state, Effect.none()];
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
					currentStreaming: null, activeStreamId: null, activeStreamMessageId: null,
					isWaitingForResponse: false
				},
				Effect.cancel(STREAM_EFFECT_ID)
			];
		}

		case 'streamError': {
			if (action.streamId !== undefined && action.streamId !== state.activeStreamId) return [state, Effect.none()];
			return [
				{
					...state,
					currentStreaming: null, activeStreamId: null, activeStreamMessageId: null,
					isWaitingForResponse: false,
					error: action.error
				},
				Effect.cancel(STREAM_EFFECT_ID)
			];
		}

		case 'stopGeneration': {
			// Current operations own one message. Legacy states without ownership retain
			// their historical global-upload Stop behavior.
			const uploading = state.messages.filter(message => (state.activeStreamMessageId == null || message.id === state.activeStreamMessageId) &&
				message.attachments?.some(attachment => attachment.uploadStatus === 'uploading'));
			if (!state.currentStreaming && uploading.length === 0)
				return [state, Effect.none()];
			const uploadingSet = new Set(uploading);
			let messages =
				uploading.length === 0
					? state.messages
					: state.messages.map((message) =>
							!uploadingSet.has(message)
								? message
								: {
										...message,
										attachments: message.attachments?.map((attachment) =>
											attachment.uploadStatus === 'uploading'
												? { ...attachment, uploadStatus: 'error' as const, uploadError: 'Upload cancelled' }
												: attachment
										)
									}
						);
			if (state.currentStreaming?.content.trim())
				messages = [...messages, { id: generateId(), role: 'assistant', content: state.currentStreaming.content, timestamp: getTimestamp() }];
			return [{ ...state, messages, currentStreaming: null, activeStreamId: null, activeStreamMessageId: null, isWaitingForResponse: false }, Effect.batch(cancelStream(state), cancelUploadsFor(uploading))];
		}

		case 'regenerateMessage': {
			const streamGeneration = (state.streamGeneration ?? 0) + 1;
			const streamId = String(streamGeneration);
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

			// Marked before the slice, for the same reason `sendMessage` marks before
			// appending: whatever is about to be uploaded needs somewhere for its
			// progress to land.
			const userMessage = {
				...state.messages[userMessageIndex]!,
				attachments: markUploading(state.messages[userMessageIndex]!.attachments, deps)
			};

			// Remove all messages after (and including) the assistant message being regenerated
			const newMessages = state.messages
				.slice(0, messageIndex)
				.map((message) => (message.id === userMessage.id ? userMessage : message));

			return [
				{
					...state,
					messages: newMessages,
					reactionPicker: pickerAfterMessages(state.reactionPicker, newMessages),
					isWaitingForResponse: true,
					currentStreaming: { content: '' },
					streamGeneration, activeStreamId: streamId, activeStreamMessageId: userMessage.id,
					error: null,
				},
				// For the same reasons as `submitEditedMessage`: the user message is
				// still in `newMessages`, so `sendMessage` would append a second
				// copy of it beneath the regenerated reply — and a failed upload
				// gets another attempt rather than being resent as a local URL.
				Effect.batch(
					cancelStream(state),
					cancelUploadsFor(state.messages.slice(messageIndex)),
					streamFor(streamId, userMessage.id, userMessage.content, userMessage.attachments, deps),
					notifySuperseded(state)
				)
			];
		}

		case 'copyMessage': {
			const message = state.messages.find((m) => m.id === action.messageId);
			if (!message) {
				return [state, Effect.none()];
			}

			// `state`, not `{ ...state }`: a fresh object with identical contents
			// notifies every subscriber that nothing changed.
			return [
				state,
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
			// Changes no state on purpose: the copy already happened, in the effect
			// above. It exists so a consumer can hear it through
			// `subscribeToActions` and show their own confirmation — the exhaustive
			// switch below is why it needs a case at all rather than falling
			// through. The previous comment here ("could show temporary success
			// feedback in the future") read as unfinished work; it is a decision.
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

			const removed = state.messages.filter(
				(m) => !newMessages.some((kept) => kept.id === m.id)
			);

			const removesActive = state.activeStreamMessageId != null && removed.some(m => m.id === state.activeStreamMessageId);
			return [
				{
					...state,
					messages: newMessages,
					...(removesActive ? { currentStreaming: null, activeStreamId: null, activeStreamMessageId: null, isWaitingForResponse: false } : {}),
					reactionPicker: pickerAfterMessages(state.reactionPicker, newMessages)
				},
				// Otherwise the deleted message's upload lands afterwards and streams
				// a reply into a conversation that no longer contains the question —
				// measured: deleting the only message left an orphan assistant reply.
				Effect.batch(cancelUploadsFor(removed), removesActive ? cancelStream(state) : Effect.none())
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
			const streamGeneration = (state.streamGeneration ?? 0) + 1;
			const streamId = String(streamGeneration);
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
				content: state.editingMessage.content,
				attachments: markUploading(state.messages[messageIndex]!.attachments, deps)
			};

			// Remove all messages after the edited one
			const newMessages = [...state.messages.slice(0, messageIndex), updatedMessage];

			const editedContent = state.editingMessage.content;

			return [
				{
					...state,
					messages: newMessages,
					reactionPicker: pickerAfterMessages(state.reactionPicker, newMessages),
					editingMessage: null,
					isWaitingForResponse: true,
					currentStreaming: { content: '' },
					streamGeneration, activeStreamId: streamId, activeStreamMessageId: updatedMessage.id,
					error: null
				},
				// The tail is being dropped, so its uploads must not land later and
			// stream a reply into a conversation that no longer holds the question.
			// Not `sendMessage`, which appends a user message unconditionally —
				// editing used to leave two copies of it. The edited message is
				// already in `newMessages` above; only the reply is missing.
				//
				// Through `streamFor` rather than straight to `streamNow`, so an
				// attachment whose upload failed the first time gets another
				// attempt. Editing was otherwise the one action that could resend a
				// message and silently keep a URL only the sender can open.
				Effect.batch(
					cancelStream(state),
					cancelUploadsFor(state.messages.slice(messageIndex + 1)),
					streamFor(streamId, updatedMessage.id, editedContent, updatedMessage.attachments, deps),
					notifySuperseded(state)
				)
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
					currentStreaming: null, activeStreamId: null, activeStreamMessageId: null,
					isWaitingForResponse: false,
					error: null,
					editingMessage: null,
					reactionPicker: { status: 'idle' }
				},
				// Every message is going, so every upload in flight for one is too.
				Effect.batch(cancelStream(state), cancelUploadsFor(state.messages))
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
			// An upload from a previous session is not in flight. Left alone, a
			// message restored mid-upload renders a progress bar frozen at whatever
			// percentage it had reached, forever. Only reachable since attachments
			// started being marked `'uploading'` at all.
			const restored: Message[] = action.messages.map((message) => {
				if (!message.attachments?.some((a) => a.uploadStatus === 'uploading')) return message;

				return {
					...message,
					attachments: message.attachments.map((attachment) => {
						if (attachment.uploadStatus !== 'uploading') return attachment;
						const { uploadStatus, uploadProgress, ...rest } = attachment;
						void uploadStatus;
						void uploadProgress;
						return rest;
					})
				};
			});
			// Restore messages from persistence (e.g., session recovery)
			// Resets streaming state to clean slate
			return [
				{
					...state,
					messages: restored,
					currentStreaming: null, activeStreamId: null, activeStreamMessageId: null,
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
				// The session being replaced may have had uploads in flight. Their
				// resolutions would land against messages that are no longer here.
				Effect.batch(cancelStream(state), cancelUploadsFor(state.messages))
			];
		}

		default: {
			const _never: never = action;
			return [state, Effect.none()];
		}
	}
}
