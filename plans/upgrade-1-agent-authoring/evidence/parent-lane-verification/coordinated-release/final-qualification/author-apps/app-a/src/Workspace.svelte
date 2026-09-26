<script lang="ts">
  import { useApplication, FeatureViews, FeatureOutlet } from '@composable-svelte/core/application';
  import { VideoEmbed } from '@composable-svelte/media';
  import { application, type WorkspaceAction, type ConversationRecord } from './model';
  import { workspaceViews } from './views';

  const app = useApplication(application);
  const state = $derived(app.store.state);
  const activeId = $derived(state.activeConversationId);
  const activeConv = $derived<ConversationRecord | undefined>(
    activeId ? state.conversations[activeId] : undefined
  );

  function openConv(id: string) {
    app.store.dispatch({ type: 'openConversation', id });
  }

  function closeConv() {
    app.store.dispatch({ type: 'closeConversation' });
  }

  function replaceConv(id: string) {
    app.store.dispatch({ type: 'replaceConversation', id });
  }

  function sendDraftToChat() {
    app.store.dispatch({ type: 'sendDraftToChat' });
  }

  // Live editor commands sent to the live CodeMirror instance via observeChildActions
  function insertSnippet() {
    app.store.dispatch({
      type: 'editor',
      action: {
        type: 'presented',
        action: {
          type: 'insertText',
          text: '\n// Injected live snippet\nexport const helper = () => true;\n'
        }
      }
    });
  }

  function undoEditor() {
    app.store.dispatch({
      type: 'editor',
      action: {
        type: 'presented',
        action: {
          type: 'undo'
        }
      }
    });
  }

  function redoEditor() {
    app.store.dispatch({
      type: 'editor',
      action: {
        type: 'presented',
        action: {
          type: 'redo'
        }
      }
    });
  }

  function selectAllEditor() {
    app.store.dispatch({
      type: 'editor',
      action: {
        type: 'presented',
        action: {
          type: 'selectAll'
        }
      }
    });
  }
</script>

<div class="workspace-root" data-testid="workspace-root">
  <header class="workspace-header">
    <div class="header-titles">
      <h1>Support Conversation Workspace</h1>
      <span class="subtitle">Chat + Code + Media Managed Composition</span>
    </div>

    <!-- Conversation Switcher / Replacement Controls -->
    <nav class="conversation-nav" aria-label="Conversation selector">
      {#each Object.values(state.conversations) as conv (conv.id)}
        <button
          type="button"
          class="conv-btn"
          class:active={activeId === conv.id}
          onclick={() => openConv(conv.id)}
          data-testid={`conv-btn-${conv.id}`}
        >
          {conv.title}
          {#if conv.completedResponses.length > 0}
            <span class="count-badge" title="Completed replies">💬 {conv.completedResponses.length}</span>
          {/if}
          {#if conv.transcripts.length > 0}
            <span class="count-badge" title="Transcripts">🎙️ {conv.transcripts.length}</span>
          {/if}
        </button>
      {/each}

      {#if activeId}
        <button
          type="button"
          class="action-btn close-btn"
          onclick={closeConv}
          data-testid="close-conversation-btn"
        >
          Close Conversation
        </button>
        {#if activeId === 'conv-1'}
          <button
            type="button"
            class="action-btn switch-btn"
            onclick={() => replaceConv('conv-2')}
            data-testid="switch-to-conv-2-btn"
          >
            Replace with Issue #102
          </button>
        {:else}
          <button
            type="button"
            class="action-btn switch-btn"
            onclick={() => replaceConv('conv-1')}
            data-testid="switch-to-conv-1-btn"
          >
            Replace with Issue #101
          </button>
        {/if}
      {:else}
        <button
          type="button"
          class="action-btn open-btn"
          onclick={() => openConv('conv-1')}
          data-testid="reopen-conv-1-btn"
        >
          Open Issue #101
        </button>
      {/if}
    </nav>
  </header>

  {#if activeId && activeConv}
    <div class="conversation-banner">
      <h2>{activeConv.title} (ID: <span data-testid="active-id">{activeId}</span>)</h2>
      <div class="banner-stats">
        <span>Archived Replies: <strong data-testid="archived-count">{activeConv.completedResponses.length}</strong></span>
        <span>Transcripts: <strong data-testid="transcripts-count">{activeConv.transcripts.length}</strong></span>
      </div>
    </div>

    <!-- Managed Feature Views and Outlets -->
    <FeatureViews store={app.store} definition={workspaceViews}>
      {#snippet children(outlets)}
        <main class="workspace-grid">
          <!-- Panel 1: Chat -->
          <section class="panel chat-section" aria-labelledby="chat-heading">
            <div class="panel-header">
              <h3 id="chat-heading">Conversation Chat</h3>
            </div>
            <div class="outlet-wrapper chat-outlet">
              <FeatureOutlet view={outlets.chat} />
            </div>

            <!-- Durable assistant replies recorded by parent reducer -->
            <div class="archived-section" data-testid="archived-responses-container">
              <h4>Durable Recorded Responses ({activeConv.completedResponses.length})</h4>
              {#if activeConv.completedResponses.length === 0}
                <p class="empty-note">No completed assistant replies recorded yet.</p>
              {:else}
                <ul class="archived-list">
                  {#each activeConv.completedResponses as resp, idx (resp.messageId)}
                    <li class="archived-item" data-testid="archived-reply-item">
                      <span class="reply-num">#{idx + 1}</span>
                      <span class="reply-text">{resp.content}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </section>

          <!-- Panel 2: Draft Code Editor -->
          <section class="panel editor-section" aria-labelledby="editor-heading">
            <div class="panel-header">
              <h3 id="editor-heading">Support Draft Editor</h3>
              <!-- Editor commands affecting live editor -->
              <div class="editor-toolbar" role="toolbar" aria-label="Editor commands">
                <button
                  type="button"
                  class="tool-btn"
                  onclick={insertSnippet}
                  data-testid="editor-insert-snippet-btn"
                  title="Insert code snippet via editor command"
                >
                  + Snippet
                </button>
                <button
                  type="button"
                  class="tool-btn"
                  onclick={undoEditor}
                  data-testid="editor-undo-btn"
                  title="Undo last edit command"
                >
                  Undo
                </button>
                <button
                  type="button"
                  class="tool-btn"
                  onclick={redoEditor}
                  data-testid="editor-redo-btn"
                  title="Redo edit command"
                >
                  Redo
                </button>
                <button
                  type="button"
                  class="tool-btn"
                  onclick={selectAllEditor}
                  data-testid="editor-select-all-btn"
                  title="Select all text"
                >
                  Select All
                </button>
                <button
                  type="button"
                  class="tool-btn primary-tool-btn"
                  onclick={sendDraftToChat}
                  data-testid="editor-send-to-chat-btn"
                  title="Send drafted code into chat"
                >
                  Send Draft to Chat
                </button>
              </div>
            </div>
            <div class="outlet-wrapper editor-outlet">
              <FeatureOutlet view={outlets.editor} />
            </div>
          </section>

          <!-- Panel 3: Voice Input & Media -->
          <section class="panel media-section" aria-labelledby="media-heading">
            <div class="panel-header">
              <h3 id="media-heading">Voice & Media Tools</h3>
            </div>

            <!-- Qualification Boundary Notice -->
            <div class="qualification-box" data-testid="qualification-notice">
              <span class="badge">Deterministic Simulation</span>
              <p>
                Automated tests use fake audio devices & deterministic streaming.
                Real microphone qualification requires physical device permissions.
              </p>
            </div>

            <!-- Voice Input Feature Outlet -->
            <div class="voice-box">
              <h4>Dictate Voice Note</h4>
              <div class="outlet-wrapper voice-outlet">
                <FeatureOutlet view={outlets.voice} />
              </div>
            </div>

            <!-- Voice transcripts belonging to this conversation -->
            <div class="transcripts-box" data-testid="transcripts-container">
              <h4>Conversation Transcripts ({activeConv.transcripts.length})</h4>
              {#if activeConv.transcripts.length === 0}
                <p class="empty-note">No voice transcripts recorded for this conversation.</p>
              {:else}
                <ul class="transcripts-list">
                  {#each activeConv.transcripts as transcript, idx (idx)}
                    <li class="transcript-item" data-testid="transcript-item">
                      <span class="badge-mini">V{idx + 1}</span>
                      <span>{transcript}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>

            <!-- Media Embed display -->
            {#if activeConv.mediaUrl}
              <div class="media-box" data-testid="media-box">
                <h4>Support Video Reference</h4>
                <VideoEmbed url={activeConv.mediaUrl} aspectRatio="16:9" />
              </div>
            {/if}
          </section>
        </main>
      {/snippet}
    </FeatureViews>
  {:else}
    <div class="empty-workspace" data-testid="empty-workspace">
      <h3>No Active Conversation</h3>
      <p>Select a conversation from the header or click below to begin.</p>
      <button
        type="button"
        class="action-btn open-btn"
        onclick={() => openConv('conv-1')}
        data-testid="empty-open-conv-1-btn"
      >
        Open Issue #101
      </button>
    </div>
  {/if}
</div>

<style>
  .workspace-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #1e293b;
    background: #f8fafc;
    overflow: hidden;
  }

  .workspace-header {
    background: #0f172a;
    color: #f8fafc;
    padding: 0.75rem 1.25rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #334155;
    flex-shrink: 0;
  }

  .header-titles h1 {
    font-size: 1.15rem;
    margin: 0;
    font-weight: 600;
  }

  .subtitle {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .conversation-nav {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .conv-btn {
    background: #1e293b;
    border: 1px solid #475569;
    color: #cbd5e1;
    padding: 0.4rem 0.75rem;
    border-radius: 4px;
    font-size: 0.85rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .conv-btn.active {
    background: #2563eb;
    border-color: #3b82f6;
    color: #ffffff;
    font-weight: 500;
  }

  .count-badge {
    background: rgba(0, 0, 0, 0.25);
    padding: 0.1rem 0.3rem;
    border-radius: 999px;
    font-size: 0.7rem;
  }

  .action-btn {
    padding: 0.4rem 0.75rem;
    border-radius: 4px;
    font-size: 0.85rem;
    cursor: pointer;
    font-weight: 500;
    border: 1px solid transparent;
  }

  .close-btn {
    background: #ef4444;
    color: white;
  }

  .switch-btn {
    background: #0284c7;
    color: white;
  }

  .open-btn {
    background: #10b981;
    color: white;
  }

  .conversation-banner {
    background: #f1f5f9;
    padding: 0.5rem 1.25rem;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }

  .conversation-banner h2 {
    font-size: 0.95rem;
    margin: 0;
    color: #334155;
  }

  .banner-stats {
    display: flex;
    gap: 1rem;
    font-size: 0.85rem;
    color: #64748b;
  }

  .workspace-grid {
    display: grid;
    grid-template-columns: 1fr 1.2fr 1fr;
    gap: 1rem;
    padding: 1rem;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .panel {
    background: white;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header {
    background: #f8fafc;
    padding: 0.6rem 0.9rem;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: #334155;
  }

  .editor-toolbar {
    display: flex;
    gap: 0.35rem;
  }

  .tool-btn {
    background: white;
    border: 1px solid #cbd5e1;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .primary-tool-btn {
    background: #2563eb;
    color: white;
    border-color: #1d4ed8;
  }

  .outlet-wrapper {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }

  .chat-outlet {
    height: 55%;
  }

  .editor-outlet {
    height: 100%;
  }

  .archived-section {
    border-top: 1px solid #e2e8f0;
    padding: 0.75rem;
    background: #f8fafc;
    max-height: 45%;
    overflow-y: auto;
  }

  .archived-section h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.8rem;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .archived-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .archived-item {
    font-size: 0.8rem;
    background: white;
    padding: 0.4rem 0.6rem;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
    display: flex;
    gap: 0.5rem;
  }

  .reply-num {
    color: #2563eb;
    font-weight: 600;
  }

  .empty-note {
    font-size: 0.8rem;
    color: #94a3b8;
    margin: 0;
    font-style: italic;
  }

  .qualification-box {
    background: #fef3c7;
    border: 1px solid #fde68a;
    padding: 0.5rem 0.75rem;
    margin: 0.75rem;
    border-radius: 4px;
    font-size: 0.75rem;
    color: #92400e;
  }

  .qualification-box p {
    margin: 0.25rem 0 0 0;
  }

  .badge {
    background: #d97706;
    color: white;
    font-size: 0.65rem;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    font-weight: 600;
  }

  .voice-box {
    padding: 0 0.75rem 0.75rem 0.75rem;
    border-bottom: 1px solid #e2e8f0;
  }

  .voice-box h4 {
    margin: 0 0 0.4rem 0;
    font-size: 0.8rem;
    color: #475569;
  }

  .transcripts-box {
    padding: 0.75rem;
    border-bottom: 1px solid #e2e8f0;
    max-height: 180px;
    overflow-y: auto;
  }

  .transcripts-box h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.8rem;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .transcripts-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .transcript-item {
    font-size: 0.8rem;
    background: #f8fafc;
    padding: 0.35rem 0.5rem;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
    display: flex;
    gap: 0.4rem;
  }

  .badge-mini {
    background: #0284c7;
    color: white;
    font-size: 0.65rem;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
  }

  .media-box {
    padding: 0.75rem;
    flex: 1;
    overflow-y: auto;
  }

  .media-box h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.8rem;
    color: #475569;
  }

  .empty-workspace {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #64748b;
    gap: 0.75rem;
  }
</style>
