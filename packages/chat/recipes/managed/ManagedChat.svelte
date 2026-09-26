<script lang="ts">
  import { Effect, type PresentationAction, type Reducer } from '@composable-svelte/core';
  import {
    ApplicationRoot, ApplicationHost, FeatureViews, FeatureOutlet,
    ManagedIntegrationBuilder, optionalSlot, defineApplication, defineViews,
    type FeatureViewProps
  } from '@composable-svelte/core/application';
  import {
    FullStreamingChat,
    streamingChatReducer,
    createInitialStreamingChatState,
    type StreamingChatAction,
    type StreamingChatDependencies,
    type StreamingChatState
  } from '@composable-svelte/chat';

  // The same dependencies as the standalone Quick Start (`streamMessage`, ...).
  let { dependencies }: { dependencies: StreamingChatDependencies } = $props();

  type Support = {
    chat: StreamingChatState | null;
    replies: { messageId: string; content: string }[];
    reactions: { messageId: string; emoji: string; on: boolean }[];
  };
  type SupportAction =
    | { type: 'chat'; action: PresentationAction<StreamingChatAction> }
    | { type: 'openChat' }
    | { type: 'closeChat' };

  // The chat reduces its own actions first, then the parent sees each one once.
  // Reactions, deletes and edits only change the chat's local state: sending
  // them to a server is the parent's job, here or in an effect of its own.
  const support: Reducer<Support, SupportAction, StreamingChatDependencies> = (state, action) => {
    switch (action.type) {
      case 'openChat':
        return [{ ...state, chat: state.chat ?? createInitialStreamingChatState() }, Effect.none()];
      case 'closeChat':
        // Retiring the slot aborts the stream and cancels any upload in flight.
        return [{ ...state, chat: null }, Effect.none()];
      case 'chat': {
        if (action.action.type !== 'presented') return [state, Effect.none()];
        const child = action.action.action;
        if (child.type === 'streamComplete') {
          // The chat ignores a completion with no reply in flight, but the parent
          // still receives it: archive each reply once, by its message id.
          const reply = state.chat?.messages.at(-1);
          return reply?.role === 'assistant' && !state.replies.some((r) => r.messageId === reply.id)
            ? [{ ...state, replies: [...state.replies, { messageId: reply.id, content: reply.content }] }, Effect.none()]
            : [state, Effect.none()];
        }
        if (child.type === 'addReaction' || child.type === 'removeReaction') {
          const change = { messageId: child.messageId, emoji: child.emoji, on: child.type === 'addReaction' };
          return [{ ...state, reactions: [...state.reactions, change] }, Effect.none()];
        }
        return [state, Effect.none()];
      }
    }
  };

  const chatSlot = optionalSlot<Support, SupportAction>()('chat');
  const composition = new ManagedIntegrationBuilder(support).with(chatSlot, streamingChatReducer).build();
  const application = defineApplication(composition, {
    initialState: (_input: undefined): Support => ({ chat: null, replies: [], reactions: [] })
  });
  const views = defineViews(composition, { chat: { content: chatView } });
</script>

{#snippet chatView({ store }: FeatureViewProps<StreamingChatState, StreamingChatAction>)}
  <FullStreamingChat {store} />
{/snippet}

<ApplicationRoot definition={application} options={{ dependencies, initial: { input: undefined } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <FeatureViews store={app.store} definition={views}>
        {#snippet children(outlets)}
          {#if app.store.state.chat}
            <button onclick={() => app.store.dispatch({ type: 'closeChat' })}>Close chat</button>
          {:else}
            <button onclick={() => app.store.dispatch({ type: 'openChat' })}>Open chat</button>
          {/if}
          <FeatureOutlet view={outlets.chat} />
          <p>{app.store.state.replies.length} replies archived</p>
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
