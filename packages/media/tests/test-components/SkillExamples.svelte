<script lang="ts">
	/**
	 * The component examples from `.claude/skills/composable-svelte-media/SKILL.md`,
	 * verbatim.
	 *
	 * `doc-typecheck` compiles the `<script>` body of a svelte fence and says so —
	 * markup expressions are out of its scope. This file is the markup half, and
	 * it is typechecked because `svelte-check` reads every `.svelte` under `tests`.
	 * `packages/core/tests/repo/skill-examples.test.ts` asserts the skill's fences
	 * are still quoted here, so a markup example cannot drift from the file that
	 * verifies it.
	 *
	 * The markup is copied as written, defects included: where the skill uses a
	 * prop, field or component shape this package does not have, the fixture
	 * declares the *skill's* shape under a `Skill…` name so the copy still
	 * compiles, rather than quietly correcting the example. Each such stand-in is
	 * a documentation defect, and is listed at the type that stands in for it.
	 */
	import type { Component } from 'svelte';
	import type { Store } from '@composable-svelte/core';
	import { FullAudioPlayer, VideoEmbed, extractVideosFromMarkdown } from '../../src/lib/index.js';
	import type { AudioPlayerAction, AudioPlayerState } from '../../src/lib/audio-player/types.js';

	/**
	 * The `VoiceInputState` the skill documents, not the package's.
	 *
	 * The real state has `errorMessage`, `permission` and `status`; the skill's
	 * markup reads `error`, `permissionDenied` and `transcript`, none of which
	 * exist. Its `mode` is also non-nullable here, where the package's is
	 * `… | null`. Only the fields the markup reads are declared.
	 */
	type SkillVoiceInputState = {
		mode: 'push-to-talk' | 'conversation';
		transcript: string | null;
		error: string | null;
		permissionDenied: boolean;
	};

	/** Enough of a store for `$voiceStore` to typecheck against the shape above. */
	type SkillVoiceStore = {
		subscribe(listener: (state: SkillVoiceInputState) => void): () => void;
	};

	/**
	 * The props the skill's "Complete Example" passes to `<FullAudioPlayer>`.
	 *
	 * The real component takes `store`, `showExpandButton` and
	 * `showPlaylistInfo`; `playerStore`, `showVisualizer` and `showPlaylist` are
	 * not props. The Quick Start fence, which passes `store={playerStore}`, is
	 * checked against the real component below; only the Complete Example fence
	 * is rendered through this stand-in.
	 */
	type SkillFullAudioPlayerProps = {
		playerStore: Store<AudioPlayerState, AudioPlayerAction>;
		showVisualizer: boolean;
		showPlaylist: boolean;
	};

	/**
	 * The props the skill's two `<VoiceInput>` fences pass.
	 *
	 * Neither compiles against the real component: `onTranscript` is required and
	 * neither fence passes it; the Complete Example also passes `voiceStore`,
	 * `showWaveform` and `showTimer`, none of which exist (the store prop is
	 * `store`). So `VoiceInput` is a prop of this fixture, not an import.
	 */
	type SkillVoiceInputProps =
		| { store: SkillVoiceStore }
		| { voiceStore: SkillVoiceStore; showWaveform: boolean; showTimer: boolean };

	let {
		playerStore,
		voiceStore,
		videoUrl,
		toggleMode,
		VoiceInput
	}: {
		playerStore: Store<AudioPlayerState, AudioPlayerAction>;
		voiceStore: SkillVoiceStore;
		videoUrl: string;
		toggleMode: () => void;
		VoiceInput: Component<SkillVoiceInputProps>;
	} = $props();

	const markdown = `
# My Post

Check out this video:
https://www.youtube.com/watch?v=dQw4w9WgXcQ

And this Vimeo:
https://vimeo.com/123456789
`;

	const videos = extractVideosFromMarkdown(markdown);
</script>

<!-- AUDIO PLAYER / Quick Start -->
<FullAudioPlayer store={playerStore} />

<!--
	AUDIO PLAYER / Complete Example.

	Inside this snippet `FullAudioPlayer` is the snippet parameter, typed as the
	skill's stand-in, not the import above: the fence passes props the real
	component does not have. Remove the snippet once the skill is corrected.
-->
{#snippet completeExample(FullAudioPlayer: Component<SkillFullAudioPlayerProps>)}
<div class="music-app">
  <FullAudioPlayer
    {playerStore}
    showVisualizer={true}
    showPlaylist={true}
  />

  <!-- Status display -->
  {#if $playerStore.error}
    <div class="error-message">{$playerStore.error}</div>
  {/if}
</div>
{/snippet}

<!--
	VIDEO EMBED / Quick Start.

	The skill's fence has its `import` line outside any `<script>`, so the guard
	treats that line as markup and it must be quoted here too. It renders as text.
-->
import { VideoEmbed } from '@composable-svelte/media';

<!-- YouTube video -->
<VideoEmbed
  url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  aspectRatio="16:9"
/>

<!-- Vimeo video -->
<VideoEmbed
  url="https://vimeo.com/123456789"
  autoplay={false}
/>

<!-- Auto-detect platform -->
<VideoEmbed url={videoUrl} />

<!-- VIDEO EMBED / Examples -->
<!-- Basic YouTube embed -->
<VideoEmbed url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />

<!-- Vimeo with custom aspect ratio -->
<VideoEmbed
  url="https://vimeo.com/123456789"
  aspectRatio="4:3"
/>

<!-- Twitch clip. The detected URL form is twitch.tv/<channel>/clip/<slug>;
     a clips.twitch.tv/<slug> share link is not matched. -->
<VideoEmbed
  url="https://www.twitch.tv/somestreamer/clip/BraveHilariousOtterPeteZaroll"
  autoplay={true}
  muted={true}
/>

<!-- Twitch VOD -->
<VideoEmbed url="https://www.twitch.tv/videos/123456789" />

<!-- VIDEO EMBED / Markdown Integration -->
<!-- Render all detected videos -->
{#each videos as video}
  <VideoEmbed url={video.url} />
{/each}

<!-- VOICE INPUT / Quick Start -->
<VoiceInput store={voiceStore} />

<!-- VOICE INPUT / Complete Example -->
<div class="voice-container">
  <VoiceInput
    {voiceStore}
    showWaveform={true}
    showTimer={true}
  />

  <!-- Mode toggle -->
  <button onclick={toggleMode}>
    Mode: {$voiceStore.mode}
  </button>

  <!-- Display transcript -->
  {#if $voiceStore.transcript}
    <div class="transcript">
      <strong>Transcript:</strong>
      <p>{$voiceStore.transcript}</p>
    </div>
  {/if}

  <!-- Error display -->
  {#if $voiceStore.error}
    <div class="error">{$voiceStore.error}</div>
  {/if}

  {#if $voiceStore.permissionDenied}
    <div class="warning">Microphone access denied</div>
  {/if}
</div>
