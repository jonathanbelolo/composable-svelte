<script lang="ts">
	import { createStore } from '@composable-svelte/core';
	import {
		MinimalStreamingChat,
		StandardStreamingChat,
		FullStreamingChat,
		streamingChatReducer,
		createInitialStreamingChatState,
		createMockStreamingChat
	} from '@composable-svelte/code';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent
	} from '@composable-svelte/core/components/ui/card/index.js';

	// Create separate stores for each variant demo
	const minimalStore = createStore({
		initialState: createInitialStreamingChatState(),
		reducer: streamingChatReducer,
		dependencies: createMockStreamingChat()
	});

	const standardStore = createStore({
		initialState: createInitialStreamingChatState(),
		reducer: streamingChatReducer,
		dependencies: createMockStreamingChat()
	});

	const fullStore = createStore({
		initialState: createInitialStreamingChatState(),
		reducer: streamingChatReducer,
		dependencies: createMockStreamingChat()
	});
</script>

<div class="space-y-12">
	<!-- Introduction -->
	<section class="space-y-4">
		<div>
			<h2 class="text-2xl font-bold mb-2">StreamingChat Component</h2>
			<p class="text-muted-foreground">
				Transport-agnostic streaming chat interface for LLM interactions
			</p>
		</div>
		<div
			class="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4"
		>
			<h4 class="font-semibold text-purple-900 dark:text-purple-100 mb-2">Key Features</h4>
			<ul class="text-sm text-purple-800 dark:text-purple-200 space-y-1">
				<li>✓ Three specialized variants (Minimal, Standard, Full)</li>
				<li>✓ Transport-agnostic (SSE, WebSocket, or custom)</li>
				<li>✓ Real-time streaming text display</li>
				<li>✓ Multi-modal attachments (images, PDFs, audio, video, files)</li>
				<li>✓ Stop generation mid-stream with AbortController</li>
				<li>✓ Message actions (Copy, Edit, Regenerate)</li>
				<li>✓ Markdown rendering with syntax highlighting</li>
				<li>✓ Interactive code blocks with copy buttons</li>
				<li>✓ Auto-scroll with smart pause detection</li>
				<li>✓ Pure reducer pattern (fully testable)</li>
				<li>✓ Built with Composable Architecture</li>
				<li>✓ Dark mode support</li>
			</ul>
		</div>
	</section>

	<!-- Chat Variants -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Chat Variants</h3>
			<p class="text-muted-foreground text-sm">
				Three specialized variants for different use cases
			</p>
		</div>

		<!-- MinimalStreamingChat -->
		<Card>
			<CardHeader>
				<CardTitle>MinimalStreamingChat</CardTitle>
				<CardDescription>
					Simplest variant - just messages and input. Perfect for embedded chats or simple UIs.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="border rounded-lg overflow-hidden" style="height: 600px;">
					<MinimalStreamingChat store={minimalStore} placeholder="Type a message..." />
				</div>
				<div class="mt-3 text-sm text-muted-foreground space-y-1">
					<p><strong>Features:</strong></p>
					<ul class="list-disc list-inside space-y-1 text-xs">
						<li>Messages and input only</li>
						<li>No action buttons, no clear button, no stop button</li>
						<li>Minimal UI footprint</li>
						<li>Best for: Read-only experiences, simple Q&A</li>
					</ul>
				</div>
			</CardContent>
		</Card>

		<!-- StandardStreamingChat -->
		<Card>
			<CardHeader>
				<CardTitle>StandardStreamingChat</CardTitle>
				<CardDescription>
					Standard variant with Stop and Clear buttons. Most common use case for chat applications.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="border rounded-lg overflow-hidden" style="height: 600px;">
					<StandardStreamingChat store={standardStore} placeholder="Ask me anything..." />
				</div>
				<div class="mt-3 text-sm text-muted-foreground space-y-1">
					<p><strong>Features:</strong></p>
					<ul class="list-disc list-inside space-y-1 text-xs">
						<li>Messages and input</li>
						<li>Stop button (appears during streaming)</li>
						<li>Clear button (removes all messages)</li>
						<li>No per-message action buttons</li>
						<li>Best for: Most chat applications, customer support</li>
					</ul>
				</div>
			</CardContent>
		</Card>

		<!-- FullStreamingChat -->
		<Card>
			<CardHeader>
				<CardTitle>FullStreamingChat</CardTitle>
				<CardDescription>
					Complete variant with all features - action buttons, stop, and clear. Power user interface.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="border rounded-lg overflow-hidden" style="height: 600px;">
					<FullStreamingChat store={fullStore} placeholder="Ask me anything..." />
				</div>
				<div class="mt-3 text-sm text-muted-foreground space-y-1">
					<p><strong>Features:</strong></p>
					<ul class="list-disc list-inside space-y-1 text-xs">
						<li>Per-message action buttons (Copy, Edit, Regenerate)</li>
						<li>Stop button (cancel streaming mid-flight)</li>
						<li>Clear button (remove all messages)</li>
						<li>Full message interaction capabilities</li>
						<li>Best for: Advanced chat UIs, AI assistants, power users</li>
					</ul>
				</div>
			</CardContent>
		</Card>
	</section>

	<!-- Transport Implementations -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Transport Implementations</h3>
			<p class="text-muted-foreground text-sm">Component works with any streaming transport</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Server-Sent Events</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Standard HTTP streaming using fetch() with ReadableStream - most common for LLM APIs
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">WebSocket</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Bi-directional real-time communication - useful when backend needs to push updates
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Custom Transport</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Implement any streaming mechanism - polling, long-polling, or proprietary protocols
				</CardContent>
			</Card>
		</div>
	</section>

	<!-- Architecture -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Architecture</h3>
			<p class="text-muted-foreground text-sm">
				Built on Composable Architecture principles
			</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
			<Card>
				<CardHeader>
					<CardTitle class="text-sm">State Management</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					<ul class="space-y-2">
						<li>• <strong>messages</strong> - All conversation messages</li>
						<li>• <strong>currentStreaming</strong> - Active streaming text</li>
						<li>• <strong>isWaitingForResponse</strong> - Loading state</li>
						<li>• <strong>error</strong> - Error messages</li>
					</ul>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Actions</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					<ul class="space-y-2">
						<li>• <strong>sendMessage</strong> - User sends a message</li>
						<li>• <strong>chunkReceived</strong> - Streaming chunk arrives</li>
						<li>• <strong>streamComplete</strong> - Stream finished</li>
						<li>• <strong>streamError</strong> - Error occurred</li>
					</ul>
				</CardContent>
			</Card>
		</div>
	</section>

	<!-- Usage Example -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Usage Example</h3>
			<p class="text-muted-foreground text-sm">How to use StreamingChat in your app</p>
		</div>

		<Card>
			<CardContent class="pt-6">
				<pre
					class="text-sm bg-slate-950 text-slate-50 p-4 rounded-lg overflow-x-auto">{`import { createStore } from '@composable-svelte/core';
import {
  StreamingChat,
  streamingChatReducer,
  createInitialStreamingChatState
} from '@composable-svelte/code';

// Implement your streaming transport
const myStreamingTransport = {
  streamMessage: (message, onChunk, onComplete, onError) => {
    fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message })
    })
      .then(response => response.body.getReader())
      .then(reader => {
        const decoder = new TextDecoder();
        const read = () => {
          reader.read().then(({ done, value }) => {
            if (done) {
              onComplete();
              return;
            }
            onChunk(decoder.decode(value));
            read();
          });
        };
        read();
      })
      .catch(error => onError(error.message));
  }
};

const store = createStore({
  initialState: createInitialStreamingChatState(),
  reducer: streamingChatReducer,
  dependencies: myStreamingTransport
});`}</pre>
			</CardContent>
		</Card>
	</section>

	<!-- Real-World Integration -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Real-World Integration</h3>
			<p class="text-muted-foreground text-sm">Works with OpenAI, Anthropic, and other LLM APIs</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
			<Card>
				<CardHeader>
					<CardTitle class="text-sm">OpenAI GPT-4</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Backend proxies to OpenAI API with streaming enabled, forwards chunks to browser via SSE
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Anthropic Claude</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Backend handles Claude API streaming, component displays responses in real-time
				</CardContent>
			</Card>
		</div>
	</section>

	<!-- Implemented Features -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Implemented Features</h3>
			<p class="text-muted-foreground text-sm">Rich content rendering capabilities</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Markdown Rendering</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground space-y-2">
					<p>Full markdown support with Prism.js syntax highlighting for code blocks</p>
					<ul class="list-disc list-inside space-y-1 text-xs">
						<li>Headers, lists, tables, blockquotes</li>
						<li>Bold, italic, inline code</li>
						<li>Syntax highlighting for 20+ languages</li>
						<li>Handles streaming/partial markdown</li>
					</ul>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Code Block Actions</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground space-y-2">
					<p>Interactive code blocks with copy functionality</p>
					<ul class="list-disc list-inside space-y-1 text-xs">
						<li>Copy button (appears on hover)</li>
						<li>Language indicators/badges</li>
						<li>Visual feedback on copy success</li>
						<li>Clipboard API integration</li>
					</ul>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Multi-modal Attachments</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground space-y-2">
					<p>Rich attachment preview components for various file types</p>
					<ul class="list-disc list-inside space-y-1 text-xs">
						<li>Images (JPEG, PNG, GIF, WebP, SVG)</li>
						<li>PDFs with page navigation and zoom</li>
						<li>Audio with custom playback controls</li>
						<li>Video with fullscreen and PIP</li>
						<li>Generic files with download</li>
						<li>Gallery view for multiple attachments</li>
					</ul>
				</CardContent>
			</Card>
		</div>
	</section>

	<!-- Implemented Features -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Implemented Message Interactions</h3>
			<p class="text-muted-foreground text-sm">Interactive features in FullStreamingChat variant</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Stop Generation</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Cancel streaming mid-flight using AbortController. Saves partial content as message.
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Copy Message</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Copy any message content to clipboard with visual feedback
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Edit Message</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Edit user messages and re-send. Automatically removes following messages for clean branching.
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Regenerate Response</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Re-generate assistant responses. Finds preceding user message and re-sends it.
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Clear Messages</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Remove all messages with confirmation dialog
				</CardContent>
			</Card>
		</div>
	</section>

	<!-- Future Enhancements -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Future Enhancements</h3>
			<p class="text-muted-foreground text-sm">Planned features for upcoming releases</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Token Usage</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Display token count and cost estimation per message
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Thinking Blocks</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Claude-style expandable reasoning and thought process display
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Code Execution</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Run code blocks directly in sandboxed environment with output display
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Message Branching UI</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Visual indicator for conversation branches when messages are edited or regenerated
				</CardContent>
			</Card>
		</div>
	</section>
</div>
