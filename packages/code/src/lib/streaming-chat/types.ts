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

				// Check for image gallery trigger keywords
				const lowerMessage = message.toLowerCase();
				const imageKeywords = ['image', 'images', 'photo', 'photos', 'picture', 'pictures', 'gallery'];
				const shouldShowImages = imageKeywords.some(keyword => lowerMessage.includes(keyword));

				// Generate a mock response with markdown
				const responses = [
					`Great question about "${message}"! Here's what I can tell you:\n\n## Key Points\n\n1. This is a **markdown-formatted** response\n2. It supports *italic* and **bold** text\n3. You can include \`inline code\` too\n\n### Code Example\n\nHere's a simple TypeScript example:\n\n\`\`\`typescript\nfunction greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet("World"));\n\`\`\`\n\nPretty cool, right?`,

					`I'd be happy to explain "${message}". Let me break it down:\n\n**Benefits:**\n- Easy to read and write\n- Supports syntax highlighting\n- Works great for technical content\n\n\`\`\`javascript\nconst message = "${message}";\nconsole.log("Processing:", message);\n\`\`\`\n\nHope this helps!`,

					`Regarding "${message}", here's a comprehensive answer:\n\n> This is a blockquote with important information.\n\nYou can create lists:\n\n1. First item\n2. Second item with **bold**\n3. Third item with *italics*\n\nAnd unordered lists:\n\n- Feature A\n- Feature B\n- Feature C\n\n---\n\nCheck out this Python code:\n\n\`\`\`python\ndef hello(name):\n    return f"Hello, {name}!"\n\nprint(hello("${message}"))\n\`\`\``,

					`Let me explain "${message}" step by step:\n\n### Step 1: Understanding\n\nFirst, you need to understand the basics. The \`concept\` involves several key components.\n\n### Step 2: Implementation\n\nHere's a simple implementation:\n\n\`\`\`typescript\ninterface Config {\n  name: string;\n  value: number;\n}\n\nconst config: Config = {\n  name: "${message}",\n  value: 42\n};\n\`\`\`\n\n### Step 3: Testing\n\nAlways test your code! Use **unit tests** and *integration tests* for best results.`,

					`Here are some example images related to "${message}":\n\n## Image Gallery Demo\n\nClick on any image to view it in the lightbox with full navigation support!\n\n![Mountain Landscape](https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop "Beautiful mountain view with snow-capped peaks")\n\n![Ocean Sunset](https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop "Stunning sunset over the ocean with vibrant colors")\n\n![Forest Path](https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&h=600&fit=crop "Peaceful forest path surrounded by tall trees")\n\n![City Skyline](https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=800&h=600&fit=crop "Modern city skyline at night with illuminated buildings")\n\n---\n\nThe image gallery supports:\n- **Touch gestures** - Swipe left/right to navigate\n- **Keyboard navigation** - Use arrow keys, Home, End, Esc\n- **Accessibility** - Full ARIA labels and focus management\n- **Animations** - Smooth transitions with reduced motion support`
				];

				// If message contains image-related keywords, always show the image gallery response
				const response = shouldShowImages
					? responses[4]  // The image gallery response is at index 4
					: responses[Math.floor(Math.random() * responses.length)];
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
