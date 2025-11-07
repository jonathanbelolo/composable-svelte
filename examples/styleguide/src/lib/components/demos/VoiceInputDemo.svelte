<script lang="ts">
	import { createStore } from '@composable-svelte/core';
	import {
		VoiceInput,
		voiceInputReducer,
		createInitialVoiceInputState,
		getAudioManager,
		type VoiceInputState
	} from '@composable-svelte/code';

	// Mock transcription function (shared by both stores)
	const mockTranscribe = async (audioBlob: Blob) => {
		// Mock transcription service (simulates a backend call)
		console.log('Transcribing audio blob:', audioBlob.size, 'bytes');

		// Simulate network delay
		await new Promise((resolve) => setTimeout(resolve, 1500));

		// Return mock transcript
		return 'This is a mock transcription of your voice message. In production, this would be actual transcribed text from Whisper or another STT service.';
	};

	// Create separate stores for push-to-talk and conversation mode demos
	const pushToTalkStore = createStore({
		initialState: createInitialVoiceInputState(),
		reducer: voiceInputReducer,
		dependencies: {
			transcribeAudio: mockTranscribe,
			getAudioManager
		}
	});

	const conversationStore = createStore({
		initialState: createInitialVoiceInputState(),
		reducer: voiceInputReducer,
		dependencies: {
			transcribeAudio: mockTranscribe,
			getAudioManager
		}
	});

	// Store transcripts
	let transcripts: string[] = $state([]);

	// Handle new transcript
	function handleTranscript(transcript: string) {
		console.log('Received transcript:', transcript);
		transcripts = [transcript, ...transcripts];
	}

	// Debug state display (show conversation store state)
	const stateDisplay = $derived(JSON.stringify($conversationStore, null, 2));
</script>

<div class="page">
	<header class="page-header">
		<h1>Voice Input Component</h1>
		<p class="subtitle">
			Standalone voice input with push-to-talk mode and backend transcription.
		</p>
	</header>

	<div class="demo-container">
		<section class="demo-section">
			<h2>Push-to-Talk Demo</h2>
			<p>Press and hold the microphone button to record. Release to send for transcription.</p>

			<div class="demo-variants">
				<div class="variant">
					<h3>Icon Variant</h3>
					<VoiceInput
						store={pushToTalkStore}
						onTranscript={handleTranscript}
						defaultMode="push-to-talk"
						variant="icon"
					/>
				</div>

				<div class="variant">
					<h3>Button Variant</h3>
					<VoiceInput
						store={pushToTalkStore}
						onTranscript={handleTranscript}
						defaultMode="push-to-talk"
						variant="button"
						label="Record Message"
					/>
				</div>

				<div class="variant">
					<h3>FAB Variant</h3>
					<VoiceInput
						store={pushToTalkStore}
						onTranscript={handleTranscript}
						defaultMode="push-to-talk"
						variant="fab"
					/>
				</div>
			</div>

			<div class="status-info">
				<p><strong>Status:</strong> {$pushToTalkStore.status}</p>
				<p><strong>Permission:</strong> {$pushToTalkStore.permission || 'not requested'}</p>
				<p><strong>Audio Level:</strong> {$pushToTalkStore.audioLevel}%</p>
			</div>
		</section>

		<section class="demo-section">
			<h2>Conversation Mode Demo</h2>
			<p>Click to toggle conversation mode on/off. Speak naturally, and audio segments are sent after 1.5 seconds of silence.</p>

			<div class="demo-variants">
				<div class="variant">
					<h3>Icon Variant</h3>
					<VoiceInput
						store={conversationStore}
						onTranscript={handleTranscript}
						variant="icon"
					/>
					<button
						class="mode-toggle"
						onclick={() => {
							const isActive = $conversationStore.mode === 'conversation';
							conversationStore.dispatch({ type: 'conversationModeToggled', enabled: !isActive });
						}}
					>
						{$conversationStore.mode === 'conversation' ? 'Stop Conversation' : 'Start Conversation'}
					</button>
				</div>

				<div class="variant">
					<h3>Button Variant</h3>
					<VoiceInput
						store={conversationStore}
						onTranscript={handleTranscript}
						variant="button"
						label="Voice Input"
					/>
					<button
						class="mode-toggle"
						onclick={() => {
							const isActive = $conversationStore.mode === 'conversation';
							conversationStore.dispatch({ type: 'conversationModeToggled', enabled: !isActive });
						}}
					>
						{$conversationStore.mode === 'conversation' ? 'Stop Conversation' : 'Start Conversation'}
					</button>
				</div>

				<div class="variant">
					<h3>FAB Variant</h3>
					<VoiceInput
						store={conversationStore}
						onTranscript={handleTranscript}
						variant="fab"
					/>
					<button
						class="mode-toggle"
						onclick={() => {
							const isActive = $conversationStore.mode === 'conversation';
							conversationStore.dispatch({ type: 'conversationModeToggled', enabled: !isActive });
						}}
					>
						{$conversationStore.mode === 'conversation' ? 'Stop' : 'Start'}
					</button>
				</div>
			</div>

			<div class="status-info">
				<p><strong>Status:</strong> {$conversationStore.status}</p>
				<p><strong>Mode:</strong> {$conversationStore.mode || 'none'}</p>
				<p><strong>VAD Status:</strong> {$conversationStore.vadState?.isSpeaking ? 'Speaking' : 'Listening'}</p>
				<p><strong>Silence:</strong> {$conversationStore.vadState?.silenceDuration || 0}ms</p>
			</div>
		</section>

		<section class="demo-section">
			<h2>Transcripts</h2>
			{#if transcripts.length === 0}
				<p class="empty-state">No transcripts yet. Record a message to see transcription results.</p>
			{:else}
				<div class="transcripts-list">
					{#each transcripts as transcript, i}
						<div class="transcript-card">
							<span class="transcript-number">#{transcripts.length - i}</span>
							<p>{transcript}</p>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<section class="demo-section debug-section">
			<h2>State Debug</h2>
			<pre class="debug-output"><code>{stateDisplay}</code></pre>
		</section>

		<section class="demo-section">
			<h2>Implementation Notes</h2>
			<div class="info-card">
				<h3>Mock Transcription</h3>
				<p>
					This demo uses a mock transcription service that simulates a backend API call. In
					production, you would replace this with a real backend endpoint that calls Whisper, OpenAI,
					or another speech-to-text service.
				</p>

				<h3>Backend Integration Example</h3>
				<pre class="code-block"><code>{`const voiceStore = createStore({
  initialState: createInitialVoiceInputState(),
  reducer: voiceInputReducer,
  dependencies: {
    transcribeAudio: async (audioBlob) => {
      const formData = new FormData();
      formData.append('audio', audioBlob);

      const res = await fetch('/api/voice/transcribe', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      const { transcript } = await res.json();
      return transcript;
    },
    getAudioManager
  }
});`}</code></pre>

				<h3>Features</h3>
				<ul>
					<li>✅ Push-to-talk recording (press & hold)</li>
					<li>✅ Real-time audio level visualization</li>
					<li>✅ Microphone permission management</li>
					<li>✅ Cancel recording with ESC key or cancel button</li>
					<li>✅ Three button variants (icon, button, FAB)</li>
					<li>⏳ Conversation mode (coming in Phase 2)</li>
				</ul>
			</div>
		</section>
	</div>
</div>

<style>
	.page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 24px;
	}

	.page-header {
		margin-bottom: 48px;
	}

	.page-header h1 {
		font-size: 32px;
		font-weight: 700;
		margin: 0 0 8px 0;
	}

	.subtitle {
		font-size: 18px;
		color: #666;
		margin: 0;
	}

	.demo-container {
		display: flex;
		flex-direction: column;
		gap: 32px;
	}

	.demo-section {
		background: white;
		border-radius: 12px;
		padding: 24px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
	}

	.demo-section h2 {
		font-size: 24px;
		font-weight: 600;
		margin: 0 0 16px 0;
	}

	.demo-section h3 {
		font-size: 16px;
		font-weight: 600;
		margin: 0 0 12px 0;
	}

	.demo-variants {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 24px;
		margin-bottom: 24px;
	}

	.variant {
		padding: 16px;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	.status-info {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
		padding: 16px;
		background: #f5f5f5;
		border-radius: 8px;
		font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Courier New', monospace;
		font-size: 14px;
	}

	.status-info p {
		margin: 0;
	}

	.transcripts-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.transcript-card {
		padding: 16px;
		background: #f9f9f9;
		border-radius: 8px;
		border-left: 4px solid #007aff;
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}

	.transcript-number {
		display: inline-block;
		background: #007aff;
		color: white;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 12px;
		font-weight: 600;
		flex-shrink: 0;
	}

	.transcript-card p {
		margin: 0;
		line-height: 1.6;
	}

	.empty-state {
		color: #999;
		font-style: italic;
		text-align: center;
		padding: 48px 0;
	}

	.debug-section {
		background: #1e1e1e;
		color: #d4d4d4;
	}

	.debug-section h2 {
		color: #d4d4d4;
	}

	.debug-output {
		margin: 0;
		padding: 16px;
		background: #252526;
		border-radius: 4px;
		overflow-x: auto;
		font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
		line-height: 1.5;
	}

	.info-card {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.info-card p {
		margin: 0;
		line-height: 1.6;
		color: #555;
	}

	.info-card ul {
		margin: 0;
		padding-left: 24px;
	}

	.info-card li {
		margin-bottom: 8px;
		line-height: 1.6;
	}

	.code-block {
		margin: 0;
		padding: 16px;
		background: #1e1e1e;
		color: #d4d4d4;
		border-radius: 8px;
		overflow-x: auto;
		font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Courier New', monospace;
		font-size: 13px;
		line-height: 1.5;
	}

	@media (prefers-color-scheme: dark) {
		.demo-section {
			background: #2a2a2a;
		}

		.demo-section h2,
		.demo-section h3 {
			color: #e0e0e0;
		}

		.variant {
			border-color: #444;
		}

		.status-info {
			background: #1e1e1e;
			color: #d4d4d4;
		}

		.transcript-card {
			background: #1e1e1e;
		}

		.info-card p {
			color: #ccc;
		}
	}
</style>
