<script lang="ts">
  import type { FeatureViewProps } from '@composable-svelte/core/application';
  import { VoiceInput, type VoiceInputState, type VoiceInputAction } from '@composable-svelte/media';

  let { store, surface }: FeatureViewProps<VoiceInputState, VoiceInputAction> = $props();
</script>

<div use:surface class="voice-feature-view" data-testid="voice-feature">
  <VoiceInput {store} defaultMode="push-to-talk" />
</div>

<style>
  .voice-feature-view {
    padding: 0.5rem 0;
  }
</style>
