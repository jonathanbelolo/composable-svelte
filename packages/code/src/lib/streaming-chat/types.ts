/**
 * Streaming Chat Types
 *
 * Transport-agnostic types for streaming chat interface.
 * Users provide their own streaming implementation (SSE, WebSocket, etc.).
 */

/**
 * Individual chat message.
 */
export interface Message {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
}

/**
 * State for streaming chat.
 */
export interface StreamingChatState {
	/** All messages in the conversation */
	messages: Message[];

	/** Currently streaming message (if any) */
	currentStreaming: {
		content: string;
		isComplete: boolean;
	} | null;

	/** Waiting for response to start */
	isWaitingForResponse: boolean;

	/** Error message (if any) */
	error: string | null;
}

/**
 * Actions for streaming chat.
 */
export type StreamingChatAction =
	| { type: 'sendMessage'; message: string }
	| { type: 'chunkReceived'; chunk: string }
	| { type: 'streamComplete' }
	| { type: 'streamError'; error: string }
	| { type: 'clearError' }
	| { type: 'clearMessages' };

/**
 * Streaming chat dependencies.
 *
 * Users implement this interface to provide their own streaming transport.
 * Can be SSE, WebSocket, polling, or any other mechanism.
 */
export interface StreamingChatDependencies {
	/**
	 * Stream a message to the backend and receive chunks.
	 *
	 * @param message - The user's message
	 * @param onChunk - Called for each chunk of the response
	 * @param onComplete - Called when streaming is complete
	 * @param onError - Called if an error occurs
	 * @returns AbortController for cancellation (optional)
	 */
	streamMessage: (
		message: string,
		onChunk: (chunk: string) => void,
		onComplete: () => void,
		onError: (error: string) => void
	) => AbortController | void;

	/**
	 * Generate unique ID for messages.
	 * @default crypto.randomUUID()
	 */
	generateId?: () => string;

	/**
	 * Get current timestamp.
	 * @default Date.now()
	 */
	getTimestamp?: () => number;
}

/**
 * Create initial state for streaming chat.
 */
export function createInitialStreamingChatState(): StreamingChatState {
	return {
		messages: [],
		currentStreaming: null,
		isWaitingForResponse: false,
		error: null
	};
}

/**
 * Create mock streaming chat dependencies for testing/demo.
 *
 * Simulates streaming by breaking response into words with delays.
 */
export function createMockStreamingChat(): StreamingChatDependencies {
	return {
		streamMessage: async (message, onChunk, onComplete, onError) => {
			try {
				// Simulate some delay before starting
				await new Promise((resolve) => setTimeout(resolve, 300));

				// Generate a mock response
				const responses = [
					`That's an interesting question about "${message}". Let me think about that.`,
					`I understand you're asking about "${message}". Here's what I can tell you.`,
					`Great question! Regarding "${message}", I'd say the following.`,
					`Thanks for asking about "${message}". Let me explain.`
				];

				const response = responses[Math.floor(Math.random() * responses.length)];
				const words = response.split(' ');

				// Stream word by word
				for (const word of words) {
					await new Promise((resolve) => setTimeout(resolve, 50));
					onChunk(word + ' ');
				}

				onComplete();
			} catch (error) {
				onError(error instanceof Error ? error.message : 'Unknown error');
			}
		},

		generateId: () => crypto.randomUUID(),

		getTimestamp: () => Date.now()
	};
}
