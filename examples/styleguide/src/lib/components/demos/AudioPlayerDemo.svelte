<script lang="ts">
	/**
	 * Audio Player Demo
	 *
	 * Demonstrates all audio player features:
	 * - MinimalAudioPlayer (compact, embeddable)
	 * - FullAudioPlayer (with all controls)
	 * - PlaylistView (drag-to-reorder)
	 * - Modal expansion
	 */

	import { createStore, createSystemClock } from '@composable-svelte/core';
	import {
		MinimalAudioPlayer,
		FullAudioPlayer,
		PlaylistView,
		audioPlayerReducer,
		createInitialAudioPlayerState,
		type AudioTrack
	} from '@composable-svelte/media';
	import { Modal } from '@composable-svelte/core/navigation-components';

	// Sample audio tracks (using free Creative Commons music)
	const sampleTracks: AudioTrack[] = [
		{
			id: '1',
			url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
			title: 'Morning Sunrise',
			artist: 'Acoustic Dreams',
			album: 'Peaceful Mornings',
			coverArt: 'https://picsum.photos/seed/track1/300/300',
			duration: 354, // 5:54
			format: 'mp3'
		},
		{
			id: '2',
			url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
			title: 'Afternoon Jazz',
			artist: 'Smooth Quartet',
			album: 'Jazz Collection',
			coverArt: 'https://picsum.photos/seed/track2/300/300',
			duration: 289, // 4:49
			format: 'mp3'
		},
		{
			id: '3',
			url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
			title: 'Evening Meditation',
			artist: 'Zen Ensemble',
			album: 'Mindful Moments',
			coverArt: 'https://picsum.photos/seed/track3/300/300',
			duration: 412, // 6:52
			format: 'mp3'
		},
		{
			id: '4',
			url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
			title: 'Night Dreams',
			artist: 'Ambient Collective',
			album: 'Sleep Soundscapes',
			coverArt: 'https://picsum.photos/seed/track4/300/300',
			duration: 325, // 5:25
			format: 'mp3'
		},
		{
			id: '5',
			url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
			title: 'Urban Beats',
			artist: 'Electronic Vibes',
			album: 'City Sounds',
			coverArt: 'https://picsum.photos/seed/track5/300/300',
			duration: 267, // 4:27
			format: 'mp3'
		}
	];

	// Create store for minimal player (single track)
	const minimalStore = createStore({
		initialState: {
			...createInitialAudioPlayerState(),
			playlist: [sampleTracks[0]],
			currentTrack: sampleTracks[0],
			currentTrackIndex: 0,
			duration: sampleTracks[0].duration!
		},
		reducer: audioPlayerReducer,
		dependencies: {
			useMockPlayback: true,
			clock: createSystemClock(),
			saveVolume: (volume) => {
				localStorage.setItem('audioPlayerVolume', volume.toString());
			},
			loadVolume: () => {
				const saved = localStorage.getItem('audioPlayerVolume');
				return saved ? parseFloat(saved) : 1;
			},
			saveSpeed: (speed) => {
				localStorage.setItem('audioPlayerSpeed', speed.toString());
			},
			loadSpeed: () => {
				const saved = localStorage.getItem('audioPlayerSpeed');
				return saved ? parseFloat(saved) : 1;
			}
		}
	});

	// Create store for full player (playlist)
	const fullStore = createStore({
		initialState: {
			...createInitialAudioPlayerState(),
			playlist: sampleTracks,
			currentTrack: sampleTracks[0],
			currentTrackIndex: 0,
			duration: sampleTracks[0].duration!
		},
		reducer: audioPlayerReducer,
		dependencies: {
			useMockPlayback: true,
			clock: createSystemClock(),
			saveVolume: (volume) => {
				localStorage.setItem('fullPlayerVolume', volume.toString());
			},
			loadVolume: () => {
				const saved = localStorage.getItem('fullPlayerVolume');
				return saved ? parseFloat(saved) : 1;
			},
			saveSpeed: (speed) => {
				localStorage.setItem('fullPlayerSpeed', speed.toString());
			},
			loadSpeed: () => {
				const saved = localStorage.getItem('fullPlayerSpeed');
				return saved ? parseFloat(saved) : 1;
			},
			trackPlayback: (track) => {
				console.log('📊 Track played:', track.title);
			},
			trackSkip: (track) => {
				console.log('⏭️ Track skipped:', track.title);
			}
		}
	});

	// Derived state for modal
	const isExpanded = $derived($fullStore.isExpanded);

	// Demo controls
	let activeTab = $state<'minimal' | 'full' | 'playlist'>('minimal');

	function addRandomTrack() {
		const randomTrack: AudioTrack = {
			id: `track-${Date.now()}`,
			url: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${Math.floor(Math.random() * 16) + 1}.mp3`,
			title: `Random Track ${$fullStore.playlist.length + 1}`,
			artist: 'Random Artist',
			album: 'Random Album',
			coverArt: `https://picsum.photos/seed/random${Date.now()}/300/300`,
			duration: Math.floor(Math.random() * 300) + 180,
			format: 'mp3'
		};

		fullStore.dispatch({ type: 'trackAdded', track: randomTrack });
	}

	function clearPlaylist() {
		fullStore.dispatch({ type: 'playlistCleared' });
	}

	function resetPlaylist() {
		fullStore.dispatch({ type: 'loadPlaylist', tracks: sampleTracks, startIndex: 0 });
	}
</script>

<div class="demo-container">
	<h2>Audio Player</h2>
	<p class="description">
		Embeddable audio player with support for playlists, advanced controls, and modal expansion.
	</p>

	<!-- Tab navigation -->
	<div class="tabs">
		<button class="tab {activeTab === 'minimal' ? 'active' : ''}" onclick={() => (activeTab = 'minimal')}>
			Minimal Player
		</button>
		<button class="tab {activeTab === 'full' ? 'active' : ''}" onclick={() => (activeTab = 'full')}>
			Full Player
		</button>
		<button class="tab {activeTab === 'playlist' ? 'active' : ''}" onclick={() => (activeTab = 'playlist')}>
			Playlist View
		</button>
	</div>

	<!-- Tab content -->
	<div class="tab-content">
		{#if activeTab === 'minimal'}
			<div class="demo-section">
				<h3>Minimal Audio Player</h3>
				<p>Compact player perfect for embedding in chat messages or small spaces.</p>

				<div class="player-container">
					<MinimalAudioPlayer store={minimalStore} id="minimal-demo" />
				</div>

				<div class="features-list">
					<h4>Features:</h4>
					<ul>
						<li>✅ Play/pause control</li>
						<li>✅ Progress bar with seeking</li>
						<li>✅ Time display (current / duration)</li>
						<li>✅ Volume control with mute</li>
						<li>✅ Track information display</li>
						<li>✅ Cover art support</li>
					</ul>
				</div>

				<details class="code-example">
					<summary>Show code example</summary>
					<pre><code>{`import { createStore } from '@composable-svelte/core';
import {
  MinimalAudioPlayer,
  audioPlayerReducer,
  createInitialAudioPlayerState
} from '@composable-svelte/code';

const store = createStore({
  initialState: {
    ...createInitialAudioPlayerState(),
    playlist: [track],
    currentTrack: track,
    currentTrackIndex: 0
  },
  reducer: audioPlayerReducer,
  dependencies: {}
});

<MinimalAudioPlayer store={store} />`}</code></pre>
				</details>
			</div>
		{:else if activeTab === 'full'}
			<div class="demo-section">
				<h3>Full Audio Player</h3>
				<p>Complete player with all advanced features and controls.</p>

				<div class="player-container">
					<FullAudioPlayer store={fullStore} id="full-demo" />
				</div>

				<div class="features-list">
					<h4>Features:</h4>
					<ul>
						<li>✅ All minimal player features</li>
						<li>✅ Previous/Next track navigation</li>
						<li>✅ Skip forward/backward (10s)</li>
						<li>✅ Playback speed control (0.25x - 2x)</li>
						<li>✅ Loop modes (none, one, all)</li>
						<li>✅ Shuffle mode</li>
						<li>✅ Buffering progress indicator</li>
						<li>✅ Keyboard shortcuts (Space, K, J, L, arrows, etc.)</li>
						<li>✅ Expand to modal view</li>
					</ul>
				</div>

				<div class="keyboard-shortcuts">
					<h4>Keyboard Shortcuts:</h4>
					<div class="shortcuts-grid">
						<div class="shortcut">
							<kbd>Space</kbd> or <kbd>K</kbd>
							<span>Play/Pause</span>
						</div>
						<div class="shortcut">
							<kbd>←</kbd> / <kbd>→</kbd>
							<span>Skip 5s</span>
						</div>
						<div class="shortcut">
							<kbd>J</kbd> / <kbd>L</kbd>
							<span>Skip 10s</span>
						</div>
						<div class="shortcut">
							<kbd>↑</kbd> / <kbd>↓</kbd>
							<span>Volume</span>
						</div>
						<div class="shortcut">
							<kbd>M</kbd>
							<span>Mute</span>
						</div>
						<div class="shortcut">
							<kbd>&lt;</kbd> / <kbd>&gt;</kbd>
							<span>Speed</span>
						</div>
					</div>
				</div>

				<details class="code-example">
					<summary>Show code example</summary>
					<pre><code>{`import { createStore } from '@composable-svelte/core';
import {
  FullAudioPlayer,
  audioPlayerReducer,
  createInitialAudioPlayerState
} from '@composable-svelte/code';

const store = createStore({
  initialState: {
    ...createInitialAudioPlayerState(),
    playlist: tracks,
    currentTrack: tracks[0],
    currentTrackIndex: 0
  },
  reducer: audioPlayerReducer,
  dependencies: {
    saveVolume: (vol) => localStorage.setItem('volume', String(vol)),
    loadVolume: () => Number(localStorage.getItem('volume') || 1)
  }
});

<FullAudioPlayer store={store} />`}</code></pre>
				</details>
			</div>
		{:else}
			<div class="demo-section">
				<h3>Playlist View</h3>
				<p>Manage and reorder tracks in your playlist.</p>

				<div class="playlist-controls">
					<button onclick={addRandomTrack} class="control-button">
						➕ Add Random Track
					</button>
					<button onclick={resetPlaylist} class="control-button">
						🔄 Reset Playlist
					</button>
					<button onclick={clearPlaylist} class="control-button danger">
						🗑️ Clear Playlist
					</button>
				</div>

				<div class="playlist-container">
					<PlaylistView store={fullStore} />
				</div>

				<div class="features-list">
					<h4>Features:</h4>
					<ul>
						<li>✅ Track list with metadata</li>
						<li>✅ Current track highlight</li>
						<li>✅ Click to select track</li>
						<li>✅ Drag-to-reorder (HTML5 drag & drop)</li>
						<li>✅ Remove track button</li>
						<li>✅ Track numbers</li>
						<li>✅ Duration display</li>
						<li>✅ Playing indicator</li>
					</ul>
				</div>

				<details class="code-example">
					<summary>Show code example</summary>
					<pre><code>{`import { PlaylistView } from '@composable-svelte/code';

<PlaylistView
  store={store}
  showTrackNumbers={true}
  showDuration={true}
  enableReorder={true}
  enableRemove={true}
/>`}</code></pre>
				</details>
			</div>
		{/if}
	</div>

	<!-- State inspector -->
	<details class="state-inspector">
		<summary>🔍 Inspect Player State</summary>
		<pre>{JSON.stringify(
				{
					currentTrack: $fullStore.currentTrack?.title,
					isPlaying: $fullStore.isPlaying,
					currentTime: Math.floor($fullStore.currentTime),
					duration: Math.floor($fullStore.duration),
					volume: $fullStore.volume.toFixed(2),
					playbackSpeed: $fullStore.playbackSpeed,
					loopMode: $fullStore.loopMode,
					isShuffled: $fullStore.isShuffled,
					playlistLength: $fullStore.playlist.length,
					currentTrackIndex: $fullStore.currentTrackIndex,
					isExpanded: $fullStore.isExpanded
				},
				null,
				2
			)}</pre>
	</details>
</div>

<!-- Modal for expanded view -->
{#if isExpanded}
	<Modal
		isOpen={true}
		onClose={() => fullStore.dispatch({ type: 'setExpanded', expanded: false })}
		title="Audio Player"
	>
		<FullAudioPlayer store={fullStore} id="full-modal" showExpandButton={false} />
		<div style="margin-top: 1rem;">
			<PlaylistView store={fullStore} />
		</div>
	</Modal>
{/if}

<style>
	.demo-container {
		padding: 2rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	h2 {
		font-size: 2rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
		color: #212529;
	}

	.description {
		color: #6c757d;
		margin-bottom: 2rem;
		font-size: 1.1rem;
	}

	.tabs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 2rem;
		border-bottom: 2px solid #e9ecef;
	}

	.tab {
		padding: 0.75rem 1.5rem;
		background: none;
		border: none;
		border-bottom: 3px solid transparent;
		cursor: pointer;
		font-size: 1rem;
		font-weight: 600;
		color: #6c757d;
		transition: all 0.2s;
	}

	.tab:hover {
		color: #495057;
		background: #f8f9fa;
	}

	.tab.active {
		color: #007bff;
		border-bottom-color: #007bff;
	}

	.tab-content {
		min-height: 500px;
	}

	.demo-section {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	h3 {
		font-size: 1.5rem;
		font-weight: 600;
		color: #212529;
	}

	.player-container {
		display: flex;
		justify-content: center;
		padding: 2rem;
		background: #f8f9fa;
		border-radius: 12px;
	}

	.playlist-controls {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.control-button {
		padding: 0.75rem 1.5rem;
		background: #007bff;
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}

	.control-button:hover {
		background: #0056b3;
	}

	.control-button.danger {
		background: #dc3545;
	}

	.control-button.danger:hover {
		background: #c82333;
	}

	.playlist-container {
		max-width: 600px;
	}

	.features-list {
		background: white;
		padding: 1.5rem;
		border-radius: 8px;
		border: 1px solid #e9ecef;
	}

	.features-list h4 {
		margin-top: 0;
		margin-bottom: 1rem;
		font-size: 1.1rem;
		color: #495057;
	}

	.features-list ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 0.5rem;
	}

	.features-list li {
		color: #212529;
		font-size: 0.9rem;
	}

	.keyboard-shortcuts {
		background: white;
		padding: 1.5rem;
		border-radius: 8px;
		border: 1px solid #e9ecef;
	}

	.keyboard-shortcuts h4 {
		margin-top: 0;
		margin-bottom: 1rem;
		font-size: 1.1rem;
		color: #495057;
	}

	.shortcuts-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
	}

	.shortcut {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	kbd {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		background: #f8f9fa;
		border: 1px solid #dee2e6;
		border-radius: 4px;
		font-family: monospace;
		font-size: 0.85rem;
		color: #495057;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}

	.shortcut span {
		color: #6c757d;
		font-size: 0.85rem;
	}

	.code-example {
		background: #f8f9fa;
		border: 1px solid #e9ecef;
		border-radius: 8px;
		padding: 1rem;
	}

	.code-example summary {
		cursor: pointer;
		font-weight: 600;
		color: #495057;
		user-select: none;
	}

	.code-example summary:hover {
		color: #212529;
	}

	.code-example pre {
		margin-top: 1rem;
		margin-bottom: 0;
		padding: 1rem;
		background: #282c34;
		border-radius: 6px;
		overflow-x: auto;
	}

	.code-example code {
		color: #abb2bf;
		font-family: 'Fira Code', 'Monaco', 'Courier New', monospace;
		font-size: 0.85rem;
		line-height: 1.6;
	}

	.state-inspector {
		margin-top: 3rem;
		background: white;
		border: 1px solid #e9ecef;
		border-radius: 8px;
		padding: 1rem;
	}

	.state-inspector summary {
		cursor: pointer;
		font-weight: 600;
		color: #495057;
		user-select: none;
	}

	.state-inspector summary:hover {
		color: #212529;
	}

	.state-inspector pre {
		margin-top: 1rem;
		margin-bottom: 0;
		padding: 1rem;
		background: #f8f9fa;
		border-radius: 6px;
		overflow-x: auto;
		font-family: 'Fira Code', 'Monaco', 'Courier New', monospace;
		font-size: 0.85rem;
		color: #495057;
	}
</style>
