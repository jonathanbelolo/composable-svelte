/**
 * Streaming Chat Types
 *
 * Transport-agnostic types for streaming chat interface.
 * Users provide their own streaming implementation (SSE, WebSocket, etc.).
 */

/**
 * Attachment metadata for images and videos
 */
export interface AttachmentMetadata {
	/** Width in pixels (for images/videos) */
	width?: number;
	/** Height in pixels (for images/videos) */
	height?: number;
	/** Duration in seconds (for videos/audio) */
	duration?: number;
	/** Number of pages (for PDFs/documents) */
	pageCount?: number;
	/** Thumbnail URL (optional preview) */
	thumbnail?: string;
}

/**
 * File attachment for a message.
 */
export interface MessageAttachment {
	/** Unique identifier for the attachment */
	id: string;
	/** Type of attachment */
	type: 'image' | 'video' | 'pdf' | 'document' | 'audio' | 'file';
	/** Original filename */
	filename: string;
	/** URL to the file (uploaded URL, data URL, or blob URL) */
	url: string;
	/** File size in bytes */
	size: number;
	/** MIME type */
	mimeType: string;
	/** Optional metadata */
	metadata?: AttachmentMetadata;
}

/**
 * Emoji reaction to a message.
 */
export interface MessageReaction {
	/** Emoji character (e.g., "👍", "❤️") */
	emoji: string;
	/** Number of times this emoji was reacted */
	count: number;
}

/**
 * Default set of quick reaction emojis.
 */
export const DEFAULT_REACTIONS = ['👍', '❤️', '😂', '🎉', '🤔', '👎', '✅', '❌'] as const;

/**
 * Individual chat message.
 */
export interface Message {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
	/** Optional file attachments */
	attachments?: MessageAttachment[];
	/** Optional emoji reactions */
	reactions?: MessageReaction[];
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
		/** Controller for cancelling the stream */
		abortController?: AbortController;
	} | null;

	/** Waiting for response to start */
	isWaitingForResponse: boolean;

	/** Error message (if any) */
	error: string | null;

	/** Message being edited (if any) */
	editingMessage: {
		id: string;
		content: string;
	} | null;

	/** Context menu state */
	contextMenu: {
		isOpen: boolean;
		messageId: string | null;
		position: { x: number; y: number };
	} | null;

	/** Pending file attachments (before sending message) */
	pendingAttachments: MessageAttachment[];
}

/**
 * Actions for streaming chat.
 */
export type StreamingChatAction =
	// Message sending and streaming
	| { type: 'sendMessage'; message: string; attachments?: MessageAttachment[] }
	| { type: 'chunkReceived'; chunk: string }
	| { type: 'streamComplete' }
	| { type: 'streamError'; error: string }
	| { type: 'stopGeneration' }
	// Message operations
	| { type: 'regenerateMessage'; messageId: string }
	| { type: 'copyMessage'; messageId: string }
	| { type: 'copySuccess' }
	| { type: 'copyError'; error: string }
	| { type: 'deleteMessage'; messageId: string }
	// Message editing
	| { type: 'startEditingMessage'; messageId: string }
	| { type: 'updateEditingContent'; content: string }
	| { type: 'submitEditedMessage' }
	| { type: 'cancelEditing' }
	// Context menu
	| { type: 'openContextMenu'; messageId: string; position: { x: number; y: number } }
	| { type: 'closeContextMenu' }
	// File attachments
	| { type: 'addAttachment'; attachment: MessageAttachment }
	| { type: 'removeAttachment'; attachmentId: string }
	| { type: 'clearAttachments' }
	// Message reactions
	| { type: 'addReaction'; messageId: string; emoji: string }
	| { type: 'removeReaction'; messageId: string; emoji: string }
	// Utility
	| { type: 'clearError' }
	| { type: 'clearMessages' }
	// Session restore (for persistence/recovery)
	| { type: 'restoreMessages'; messages: Message[] }
	// Internal actions
	| { type: '_internal_setAbortController'; abortController: AbortController };

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

	/**
	 * Upload a file and return its URL.
	 * Optional - if not provided, files will use blob URLs.
	 *
	 * @param file - File to upload
	 * @param onProgress - Progress callback (loaded, total)
	 * @returns Promise resolving to file URL
	 */
	uploadFile?: (
		file: File,
		onProgress?: (loaded: number, total: number) => void
	) => Promise<string>;
}

/**
 * Create initial state for streaming chat.
 */
export function createInitialStreamingChatState(): StreamingChatState {
	return {
		messages: [],
		currentStreaming: null,
		isWaitingForResponse: false,
		error: null,
		editingMessage: null,
		contextMenu: null,
		pendingAttachments: []
	};
}

/**
 * Create mock streaming chat dependencies for testing/demo.
 *
 * Simulates streaming by breaking response into words with delays.
 */
export function createMockStreamingChat(): StreamingChatDependencies {
	return {
		streamMessage: (message, onChunk, onComplete, onError) => {
			const abortController = new AbortController();

			(async () => {
				try {
					// Simulate some delay before starting
					await new Promise((resolve) => setTimeout(resolve, 300));

					// Check if aborted
					if (abortController.signal.aborted) {
						return;
					}

					// Check for image and video trigger keywords
					const lowerMessage = message.toLowerCase();
					const imageKeywords = ['image', 'images', 'photo', 'photos', 'picture', 'pictures', 'gallery'];
					const videoKeywords = ['video', 'videos', 'watch', 'youtube', 'vimeo', 'twitch'];
					const shouldShowImages = imageKeywords.some(keyword => lowerMessage.includes(keyword));
					const shouldShowVideos = videoKeywords.some(keyword => lowerMessage.includes(keyword));

					// Generate a mock response with markdown
					const responses = [
						`Great question about "${message}"! Here's what I can tell you:\n\n## Key Points\n\n1. This is a **markdown-formatted** response\n2. It supports *italic* and **bold** text\n3. You can include \`inline code\` too\n\n### Code Example\n\nHere's a simple TypeScript example:\n\n\`\`\`typescript\nfunction greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet("World"));\n\`\`\`\n\nPretty cool, right?`,

						`I'd be happy to explain "${message}". Let me break it down:\n\n**Benefits:**\n- Easy to read and write\n- Supports syntax highlighting\n- Works great for technical content\n\n\`\`\`javascript\nconst message = "${message}";\nconsole.log("Processing:", message);\n\`\`\`\n\nHope this helps!`,

						`Regarding "${message}", here's a comprehensive answer:\n\n> This is a blockquote with important information.\n\nYou can create lists:\n\n1. First item\n2. Second item with **bold**\n3. Third item with *italics*\n\nAnd unordered lists:\n\n- Feature A\n- Feature B\n- Feature C\n\n---\n\nCheck out this Python code:\n\n\`\`\`python\ndef hello(name):\n    return f"Hello, {name}!"\n\nprint(hello("${message}"))\n\`\`\``,

						`Let me explain "${message}" step by step:\n\n### Step 1: Understanding\n\nFirst, you need to understand the basics. The \`concept\` involves several key components.\n\n### Step 2: Implementation\n\nHere's a simple implementation:\n\n\`\`\`typescript\ninterface Config {\n  name: string;\n  value: number;\n}\n\nconst config: Config = {\n  name: "${message}",\n  value: 42\n};\n\`\`\`\n\n### Step 3: Testing\n\nAlways test your code! Use **unit tests** and *integration tests* for best results.`,

						`Here are some example images related to "${message}":\n\n## Image Gallery Demo\n\nClick on any image to view it in the lightbox with full navigation support!\n\n![Mountain Landscape](https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop "Beautiful mountain view with snow-capped peaks")\n\n![Ocean Sunset](https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop "Stunning sunset over the ocean with vibrant colors")\n\n![Forest Path](https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&h=600&fit=crop "Peaceful forest path surrounded by tall trees")\n\n![City Skyline](https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=800&h=600&fit=crop "Modern city skyline at night with illuminated buildings")\n\n---\n\nThe image gallery supports:\n- **Touch gestures** - Swipe left/right to navigate\n- **Keyboard navigation** - Use arrow keys, Home, End, Esc\n- **Accessibility** - Full ARIA labels and focus management\n- **Animations** - Smooth transitions with reduced motion support`,

						`Here are some great video tutorials on "${message}":\n\n## Video Resources\n\nCheck out these helpful videos to learn more!\n\n**Watchtower of Turkey - Beautiful Timelapse:**\nhttps://vimeo.com/148751763\n\nAn amazing visual journey showcasing stunning cinematography and beautiful landscapes.\n\n---\n\n**The Mountain - Epic Time-lapse:**\nhttps://vimeo.com/76979871\n\nWatch this breathtaking time-lapse of mountain landscapes with stunning night skies.\n\n---\n\n**Life in a Day:**\nhttps://vimeo.com/336812660\n\nA creative exploration of everyday moments captured beautifully on film.\n\n---\n\n💡 **Tip**: All videos are embedded directly in the chat for easy viewing! Vimeo videos work great on localhost for testing.`
					];

					// If message contains keywords, show relevant response
					let response: string;
					if (shouldShowVideos) {
						response = responses[5]!;  // The video response is at index 5
					} else if (shouldShowImages) {
						response = responses[4]!;  // The image gallery response is at index 4
					} else {
						response = responses[Math.floor(Math.random() * 4)]!;  // Random from first 4
					}

					const words = response.split(' ');

					// Stream word by word
					for (const word of words) {
						// Check abort before each chunk
						if (abortController.signal.aborted) {
							return;
						}

						await new Promise((resolve) => setTimeout(resolve, 50));
						onChunk(word + ' ');
					}

					// Only call onComplete if not aborted
					if (!abortController.signal.aborted) {
						onComplete();
					}
				} catch (error) {
					if (!abortController.signal.aborted) {
						onError(error instanceof Error ? error.message : 'Unknown error');
					}
				}
			})();

			return abortController;
		},

		generateId: () => crypto.randomUUID(),

		getTimestamp: () => Date.now()
	};
}
