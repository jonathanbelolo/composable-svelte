/**
 * Streaming Chat Reducer
 *
 * Pure reducer for streaming chat state management.
 * Transport-agnostic - works with any streaming implementation.
 */

import type { EffectType } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import type {
	StreamingChatState,
	StreamingChatAction,
	StreamingChatDependencies,
	Message
} from './types.js';

/**
 * Streaming chat reducer.
 *
 * Manages conversation state and coordinates with streaming transport.
 */
export function streamingChatReducer(
	state: StreamingChatState,
	action: StreamingChatAction,
	deps: StreamingChatDependencies
): [StreamingChatState, EffectType<StreamingChatAction>] {
	const generateId = deps.generateId || (() => crypto.randomUUID());
	const getTimestamp = deps.getTimestamp || (() => Date.now());

	switch (action.type) {
		case 'sendMessage': {
			// Add user message to conversation
			const userMessage: Message = {
				id: generateId(),
				role: 'user',
				content: action.message,
				timestamp: getTimestamp()
			};

			return [
				{
					...state,
					messages: [...state.messages, userMessage],
					currentStreaming: { content: '', isComplete: false },
					isWaitingForResponse: true,
					error: null
				},
				Effect.run(async (dispatch) => {
					// Call user's streaming implementation
					const abortController = deps.streamMessage(
						action.message,
						(chunk) => dispatch({ type: 'chunkReceived', chunk }),
						() => dispatch({ type: 'streamComplete' }),
						(error) => dispatch({ type: 'streamError', error })
					);

					// Store abort controller if returned
					if (abortController) {
						dispatch({ type: '_internal_setAbortController', abortController });
					}
				})
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
						isComplete: false
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
			if (messageIndex === -1 || state.messages[messageIndex].role !== 'assistant') {
				return [state, Effect.none()];
			}

			// Find preceding user message
			let userMessageIndex = messageIndex - 1;
			while (userMessageIndex >= 0 && state.messages[userMessageIndex].role !== 'user') {
				userMessageIndex--;
			}

			if (userMessageIndex === -1) {
				return [state, Effect.none()]; // No user message found
			}

			const userMessage = state.messages[userMessageIndex];

			// Remove all messages after (and including) the assistant message being regenerated
			const newMessages = state.messages.slice(0, messageIndex);

			return [
				{
					...state,
					messages: newMessages,
					isWaitingForResponse: true,
					currentStreaming: { content: '', isComplete: false },
					error: null,
					contextMenu: null
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
				{ ...state, contextMenu: null },
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

			const message = state.messages[messageIndex];

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
					contextMenu: null
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
					contextMenu: null
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
				...state.messages[messageIndex],
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
					currentStreaming: { content: '', isComplete: false },
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

		case 'openContextMenu': {
			return [
				{
					...state,
					contextMenu: {
						isOpen: true,
						messageId: action.messageId,
						position: action.position
					}
				},
				Effect.none()
			];
		}

		case 'closeContextMenu': {
			return [
				{
					...state,
					contextMenu: null
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
			return [
				{
					...state,
					pendingAttachments: state.pendingAttachments.filter(
						(attachment) => attachment.id !== action.attachmentId
					)
				},
				Effect.none()
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
					contextMenu: null
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
