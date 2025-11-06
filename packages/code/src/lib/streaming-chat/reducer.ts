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
					deps.streamMessage(
						action.message,
						(chunk) => dispatch({ type: 'chunkReceived', chunk }),
						() => dispatch({ type: 'streamComplete' }),
						(error) => dispatch({ type: 'streamError', error })
					);
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
					error: null
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
