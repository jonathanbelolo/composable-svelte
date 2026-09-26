<script lang="ts">
  import { Effect, type PresentationAction, type Reducer } from '@composable-svelte/core';
  import {
    ApplicationRoot, ApplicationHost, FeatureViews, FeatureOutlet,
    ManagedIntegrationBuilder, optionalSlot, defineApplication, defineViews,
    type FeatureViewProps
  } from '@composable-svelte/core/application';
  import {
    MinimalAudioPlayer,
    audioPlayerReducer,
    createInitialAudioPlayerState,
    type AudioPlayerAction,
    type AudioPlayerDependencies,
    type AudioPlayerState,
    type AudioTrack
  } from '@composable-svelte/media';

  type Episode = { player: AudioPlayerState | null };
  type EpisodeAction =
    | { type: 'player'; action: PresentationAction<AudioPlayerAction> }
    | { type: 'listen'; track: AudioTrack }
    | { type: 'close' };

  const episode: Reducer<Episode, EpisodeAction, AudioPlayerDependencies> = (state, action) => {
    switch (action.type) {
      case 'listen': {
        const player = createInitialAudioPlayerState({ volume: 0.8 });
        return [
          { player: { ...player, playlist: [action.track], currentTrack: action.track, currentTrackIndex: 0 } },
          Effect.none()
        ];
      }
      case 'close':
        // Retiring the slot pauses and releases the player's audio element.
        return [{ player: null }, Effect.none()];
      default:
        return [state, Effect.none()];
    }
  };

  const playerSlot = optionalSlot<Episode, EpisodeAction>()('player');
  const composition = new ManagedIntegrationBuilder(episode).with(playerSlot, audioPlayerReducer).build();
  const application = defineApplication(composition, {
    initialState: (_input: undefined): Episode => ({ player: null })
  });
  const views = defineViews(composition, { player: { content: playerView } });
  const track: AudioTrack = { id: '1', title: 'Episode One', url: '/audio/episode1.mp3' };
</script>

{#snippet playerView({ store }: FeatureViewProps<AudioPlayerState, AudioPlayerAction>)}
  <MinimalAudioPlayer {store} />
{/snippet}

<ApplicationRoot definition={application} options={{ dependencies: {}, initial: { input: undefined } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <FeatureViews store={app.store} definition={views}>
        {#snippet children(outlets)}
          <FeatureOutlet view={outlets.player} />
          {#if app.store.state.player}
            <button onclick={() => app.store.dispatch({ type: 'close' })}>Close player</button>
          {:else}
            <button onclick={() => app.store.dispatch({ type: 'listen', track })}>Listen</button>
          {/if}
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
