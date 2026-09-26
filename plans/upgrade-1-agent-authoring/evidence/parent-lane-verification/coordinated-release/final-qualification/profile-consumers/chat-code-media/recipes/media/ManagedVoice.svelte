<script lang="ts">
  import { Effect, type PresentationAction, type Reducer } from '@composable-svelte/core';
  import {
    ApplicationRoot, ApplicationHost, FeatureViews, FeatureOutlet,
    ManagedIntegrationBuilder, optionalSlot, defineApplication, defineViews,
    type FeatureViewProps
  } from '@composable-svelte/core/application';
  import {
    VoiceInput,
    voiceInputReducer,
    createInitialVoiceInputState,
    type VoiceInputAction,
    type VoiceInputDependencies,
    type VoiceInputState
  } from '@composable-svelte/media';

  // The same dependencies as the standalone example above.
  let { dependencies }: { dependencies: VoiceInputDependencies } = $props();

  type Composer = { voice: VoiceInputState | null; drafts: string[] };
  type ComposerAction =
    | { type: 'voice'; action: PresentationAction<VoiceInputAction> }
    | { type: 'dictate' }
    | { type: 'stopDictating' };

  // Children reduce first, so the parent sees each accepted transcript once, as
  // the child's own `transcriptionCompleted`, and keeps it as business state.
  const composer: Reducer<Composer, ComposerAction, VoiceInputDependencies> = (state, action) => {
    switch (action.type) {
      case 'dictate':
        return [{ ...state, voice: state.voice ?? createInitialVoiceInputState() }, Effect.none()];
      case 'stopDictating':
        // Retiring the slot releases the microphone and cancels its transcriptions.
        return [{ ...state, voice: null }, Effect.none()];
      case 'voice': {
        const child = action.action;
        if (child.type === 'presented' && child.action.type === 'transcriptionCompleted') {
          return [{ ...state, drafts: [...state.drafts, child.action.transcript] }, Effect.none()];
        }
        return [state, Effect.none()];
      }
    }
  };

  const voiceSlot = optionalSlot<Composer, ComposerAction>()('voice');
  const composition = new ManagedIntegrationBuilder(composer).with(voiceSlot, voiceInputReducer).build();
  const application = defineApplication(composition, {
    initialState: (_input: undefined): Composer => ({ voice: null, drafts: [] })
  });
  const views = defineViews(composition, { voice: { content: voiceView } });
</script>

{#snippet voiceView({ store }: FeatureViewProps<VoiceInputState, VoiceInputAction>)}
  <VoiceInput {store} defaultMode="push-to-talk" />
{/snippet}

<ApplicationRoot definition={application} options={{ dependencies, initial: { input: undefined } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <FeatureViews store={app.store} definition={views}>
        {#snippet children(outlets)}
          <FeatureOutlet view={outlets.voice} />
          {#if app.store.state.voice}
            <button onclick={() => app.store.dispatch({ type: 'stopDictating' })}>Stop dictating</button>
          {:else}
            <button onclick={() => app.store.dispatch({ type: 'dictate' })}>Dictate</button>
          {/if}
          <ul>
            {#each app.store.state.drafts as draft, index (index)}
              <li>{draft}</li>
            {/each}
          </ul>
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
