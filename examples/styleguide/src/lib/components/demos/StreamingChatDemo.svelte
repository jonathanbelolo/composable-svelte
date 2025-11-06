<script lang="ts">
	import { createStore } from '@composable-svelte/core';
	import {
		StreamingChat,
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

	// Create store with mock streaming implementation
	const chatStore = createStore({
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
				<li>✓ Transport-agnostic (SSE, WebSocket, or custom)</li>
				<li>✓ Real-time streaming text display</li>
				<li>✓ Markdown rendering with syntax highlighting</li>
				<li>✓ Interactive code blocks with copy buttons</li>
				<li>✓ Auto-scroll with smart pause detection</li>
				<li>✓ Pure reducer pattern (fully testable)</li>
				<li>✓ Built with Composable Architecture</li>
				<li>✓ Dark mode support</li>
			</ul>
		</div>
	</section>

	<!-- Interactive Demo -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
			<p class="text-muted-foreground text-sm">
				Try the chat interface with a mock streaming backend
			</p>
		</div>

		<Card>
			<CardHeader>
				<div class="flex items-center justify-between">
					<div>
						<CardTitle>AI Assistant Chat</CardTitle>
						<CardDescription>
							Ask questions and see streaming responses in real-time
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<div class="border rounded-lg overflow-hidden" style="height: 500px;">
					<StreamingChat store={chatStore} placeholder="Ask me anything..." />
				</div>
				<p class="text-xs text-muted-foreground mt-2">
					Using mock streaming backend that simulates word-by-word responses
				</p>
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

		<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
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
		</div>
	</section>

	<!-- Future Enhancements -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Future Enhancements</h3>
			<p class="text-muted-foreground text-sm">Planned features for upcoming releases</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Multi-modal Support</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Support for images, files, and other media types in conversations
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Message Actions</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Regenerate, edit, copy, and delete individual messages
				</CardContent>
			</Card>

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
		</div>
	</section>
</div>
