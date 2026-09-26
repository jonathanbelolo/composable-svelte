<script lang="ts">
  import type { FeatureViewProps } from '@composable-svelte/core/application';
  import { FullStreamingChat, type StreamingChatState, type StreamingChatAction } from '@composable-svelte/chat';

  let { store, surface }: FeatureViewProps<StreamingChatState, StreamingChatAction> = $props();
</script>

<div use:surface class="chat-feature-view" data-testid="chat-feature">
  <FullStreamingChat {store} userLabel="You" assistantLabel="Support Assistant" />
</div>

<style>
  .chat-feature-view {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
</style>
