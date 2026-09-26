import { describe, it, expect, vi } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';
import {
  composition,
  createInitialWorkspaceState,
  type WorkspaceState,
  type WorkspaceAction
} from '../src/model';
import { createFakeWorkspaceDependencies } from '../src/dependencies';

describe('Support Conversation Workspace - Reducer & Managed Composition', () => {
  it('records a completed assistant response once in durable application state', async () => {
    let streamChunk!: (chunk: string) => void;
    let streamComplete!: () => void;

    const dependencies = createFakeWorkspaceDependencies();
    dependencies.streamMessage = (_msg, onChunk, onComplete) => {
      streamChunk = onChunk;
      streamComplete = onComplete;
      return new AbortController();
    };

    const store = createTestStore<WorkspaceState, WorkspaceAction>({
      initialState: createInitialWorkspaceState(),
      reducer: composition.reducer,
      execution: composition.execution,
      dependencies
    });

    // Send a message in the active conversation
    await store.send(
      {
        type: 'chat',
        action: {
          type: 'presented',
          action: { type: 'sendMessage', message: 'How do I handle token errors?' }
        }
      },
      (state) => {
        expect(state.chat?.messages).toHaveLength(1);
        expect(state.chat?.isWaitingForResponse).toBe(true);
        expect(state.conversations['conv-1']?.completedResponses).toHaveLength(0);
      }
    );

    // Assistant streams response chunk
    streamChunk('Use a try/catch block around verifyToken.');
    await store.receive({
      type: 'chat',
      action: {
        type: 'presented',
        action: {
          type: 'chunkReceived',
          chunk: 'Use a try/catch block around verifyToken.',
          streamId: '1'
        }
      }
    });

    // Stream completes
    streamComplete();
    await store.receive(
      {
        type: 'chat',
        action: {
          type: 'presented',
          action: { type: 'streamComplete', streamId: '1' }
        }
      },
      (state) => {
        expect(state.chat?.isWaitingForResponse).toBe(false);
        // Acceptance observation: completed assistant response recorded once by application
        const conv = state.conversations['conv-1'];
        expect(conv?.completedResponses).toHaveLength(1);
        expect(conv?.completedResponses[0]?.content).toBe('Use a try/catch block around verifyToken.');
      }
    );

    // Idle and superseded completions are ignored by the chat child but still reach
    // the parent; they must not archive the same reply again.
    await store.send(
      { type: 'chat', action: { type: 'presented', action: { type: 'streamComplete' } } },
      (state) => {
        expect(state.conversations['conv-1']?.completedResponses).toHaveLength(1);
      }
    );
    await store.send(
      { type: 'chat', action: { type: 'presented', action: { type: 'streamComplete', streamId: '1' } } },
      (state) => {
        expect(state.conversations['conv-1']?.completedResponses).toHaveLength(1);
      }
    );

    await store.finish();
  });

  it('routes editor commands to the live editor and synchronizes edits with durable conversation state', async () => {
    const dependencies = createFakeWorkspaceDependencies();
    const store = createTestStore<WorkspaceState, WorkspaceAction>({
      initialState: createInitialWorkspaceState(),
      reducer: composition.reducer,
      execution: composition.execution,
      dependencies
    });

    expect(store.state.editor?.value).toContain('verifyAuthToken');

    // Simulate edit value report updating draft in live editor
    const updatedCode = 'export function verifyAuthToken(t: string): boolean { return Boolean(t); }';
    await store.send(
      {
        type: 'editor',
        action: {
          type: 'presented',
          action: {
            type: 'valueChanged',
            value: updatedCode
          }
        }
      },
      (state) => {
        expect(state.editor?.value).toBe(updatedCode);
        // Durable state in parent reducer is kept up to date
        expect(state.conversations['conv-1']?.draftCode).toBe(updatedCode);
      }
    );

    // Dispatching an editor command (insertText) is accepted by the reducer
    // and emitted via observeChildActions for the live CodeMirror engine
    await store.send({
      type: 'editor',
      action: {
        type: 'presented',
        action: {
          type: 'insertText',
          text: '\n// verified\n'
        }
      }
    });

    await store.finish();
  });

  it('attributes voice recording and transcript to its original conversation', async () => {
    const dependencies = createFakeWorkspaceDependencies({
      transcriptText: 'Token expired after 3600 seconds'
    });

    const store = createTestStore<WorkspaceState, WorkspaceAction>({
      initialState: createInitialWorkspaceState(),
      reducer: composition.reducer,
      execution: composition.execution,
      dependencies
    });

    // Complete a voice transcription in conv-1
    await store.send(
      {
        type: 'voice',
        action: {
          type: 'presented',
          action: {
            type: 'transcriptionCompleted',
            transcript: 'Token expired after 3600 seconds'
          }
        }
      },
      (state) => {
        const conv1 = state.conversations['conv-1'];
        // Acceptance observation: transcript belongs to original conversation
        expect(conv1?.transcripts).toHaveLength(1);
        expect(conv1?.transcripts[0]).toBe('Token expired after 3600 seconds');
        // Conv-2 has no transcripts
        expect(state.conversations['conv-2']?.transcripts).toHaveLength(0);
      }
    );

    await store.finish();
  });

  it('closing a conversation retires child slots and aborts in-flight work', async () => {
    const abortSpy = vi.fn();
    let lateChunk!: (chunk: string) => void;
    let lateComplete!: () => void;
    const dependencies = createFakeWorkspaceDependencies();
    dependencies.streamMessage = (_msg, onChunk, onComplete) => {
      lateChunk = onChunk;
      lateComplete = onComplete;
      const controller = new AbortController();
      controller.signal.addEventListener('abort', abortSpy);
      return controller;
    };

    const store = createTestStore<WorkspaceState, WorkspaceAction>({
      initialState: createInitialWorkspaceState(),
      reducer: composition.reducer,
      execution: composition.execution,
      dependencies
    });

    // Start a message stream in conv-1
    await store.send({
      type: 'chat',
      action: {
        type: 'presented',
        action: { type: 'sendMessage', message: 'Investigating auth...' }
      }
    });

    // Close conversation
    await store.send({ type: 'closeConversation' }, (state) => {
      expect(state.activeConversationId).toBeNull();
      expect(state.chat).toBeNull();
      expect(state.editor).toBeNull();
      expect(state.voice).toBeNull();
    });

    // Abort signal should have fired on slot retirement
    expect(abortSpy).toHaveBeenCalledTimes(1);

    // A transport that ignores abort still calls back; retired dispatch drops it
    lateChunk('late reply for a closed conversation');
    lateComplete();
    expect(store.state.chat).toBeNull();
    expect(store.state.conversations['conv-1']?.completedResponses).toHaveLength(0);

    await store.finish();
  });

  it('replacing a conversation prevents late work from mutating its successor', async () => {
    const conv1Abort = vi.fn();
    const streams: Array<{ chunk: (chunk: string) => void; complete: () => void }> = [];

    const dependencies = createFakeWorkspaceDependencies();
    dependencies.streamMessage = (_msg, onChunk, onComplete) => {
      streams.push({ chunk: onChunk, complete: onComplete });
      const controller = new AbortController();
      if (streams.length === 1) controller.signal.addEventListener('abort', conv1Abort);
      return controller;
    };

    const store = createTestStore<WorkspaceState, WorkspaceAction>({
      initialState: createInitialWorkspaceState(),
      reducer: composition.reducer,
      execution: composition.execution,
      dependencies
    });

    // Conv-1 sends message and has a stream in flight
    await store.send({
      type: 'chat',
      action: {
        type: 'presented',
        action: { type: 'sendMessage', message: 'Conv 1 question' }
      }
    });

    // Replace Conv-1 with Conv-2
    await store.send({ type: 'replaceConversation', id: 'conv-2' }, (state) => {
      expect(state.activeConversationId).toBe('conv-2');
      expect(state.chat?.messages).toHaveLength(0);
      expect(state.editor?.value).toContain('calculateBufferSize');
    });

    // Conv-1's in-flight stream was aborted when the slot owner was replaced
    expect(conv1Abort).toHaveBeenCalledTimes(1);

    // Conv-2 has its own clean initial state
    expect(store.state.conversations['conv-2']?.completedResponses).toHaveLength(0);

    // Conv-2 starts its own stream; conv-1's transport then calls back late
    await store.send({
      type: 'chat',
      action: { type: 'presented', action: { type: 'sendMessage', message: 'Conv 2 question' } }
    });
    streams[0]!.chunk('LATE conv-1 reply');
    streams[0]!.complete();
    expect(store.state.chat?.messages).toHaveLength(1);
    expect(store.state.chat?.currentStreaming?.content).toBe('');
    expect(store.state.conversations['conv-1']?.completedResponses).toHaveLength(0);
    expect(store.state.conversations['conv-2']?.completedResponses).toHaveLength(0);

    // Conv-2's own reply is archived to conv-2 only
    streams[1]!.chunk('Conv 2 reply');
    await store.receive({
      type: 'chat',
      action: { type: 'presented', action: { type: 'chunkReceived', chunk: 'Conv 2 reply', streamId: '1' } }
    });
    streams[1]!.complete();
    await store.receive(
      { type: 'chat', action: { type: 'presented', action: { type: 'streamComplete', streamId: '1' } } },
      (state) => {
        expect(state.conversations['conv-2']?.completedResponses.map((r) => r.content)).toEqual(['Conv 2 reply']);
        expect(state.conversations['conv-1']?.completedResponses).toHaveLength(0);
      }
    );

    await store.finish();
  });

  it('second conversation remains completely independent', async () => {
    const dependencies = createFakeWorkspaceDependencies();
    const store = createTestStore<WorkspaceState, WorkspaceAction>({
      initialState: createInitialWorkspaceState(),
      reducer: composition.reducer,
      execution: composition.execution,
      dependencies
    });

    // 1. Edit draft in conv-1
    await store.send({
      type: 'editor',
      action: {
        type: 'presented',
        action: { type: 'valueChanged', value: '// Modified conv-1 draft' }
      }
    });

    // Add transcript to conv-1
    await store.send({
      type: 'voice',
      action: {
        type: 'presented',
        action: { type: 'transcriptionCompleted', transcript: 'Conv-1 note' }
      }
    });

    // 2. Switch to conv-2
    await store.send({ type: 'openConversation', id: 'conv-2' }, (state) => {
      expect(state.activeConversationId).toBe('conv-2');
      expect(state.editor?.value).toContain('calculateBufferSize');
      expect(state.conversations['conv-2']?.transcripts).toHaveLength(0);
    });

    // Edit draft in conv-2
    await store.send({
      type: 'editor',
      action: {
        type: 'presented',
        action: { type: 'valueChanged', value: '// Modified conv-2 draft' }
      }
    });

    // Add transcript to conv-2
    await store.send({
      type: 'voice',
      action: {
        type: 'presented',
        action: { type: 'transcriptionCompleted', transcript: 'Conv-2 note' }
      }
    });

    // 3. Switch back to conv-1
    await store.send({ type: 'openConversation', id: 'conv-1' }, (state) => {
      expect(state.activeConversationId).toBe('conv-1');
      // Conv-1's draft was independently preserved
      expect(state.editor?.value).toBe('// Modified conv-1 draft');
      expect(state.conversations['conv-1']?.transcripts).toEqual(['Conv-1 note']);
      // Conv-2's data was independently preserved
      expect(state.conversations['conv-2']?.draftCode).toBe('// Modified conv-2 draft');
      expect(state.conversations['conv-2']?.transcripts).toEqual(['Conv-2 note']);
    });

    await store.finish();
  });

  it('sendDraftToChat runs an effect dispatching the drafted code to chat', async () => {
    let sentMessage = '';
    let chunk!: (text: string) => void;
    let complete!: () => void;
    const dependencies = createFakeWorkspaceDependencies();
    dependencies.streamMessage = (msg, onChunk, onComplete) => {
      sentMessage = msg;
      chunk = onChunk;
      complete = onComplete;
      return new AbortController();
    };

    const store = createTestStore<WorkspaceState, WorkspaceAction>({
      initialState: createInitialWorkspaceState(),
      reducer: composition.reducer,
      execution: composition.execution,
      dependencies
    });

    const draft = store.state.editor!.value;
    const message = `Here is the current code draft for review:\n\`\`\`typescript\n${draft}\n\`\`\``;

    await store.send({ type: 'sendDraftToChat' });

    // The chat receives the sendMessage action containing the live editor draft
    await store.receive(
      { type: 'chat', action: { type: 'presented', action: { type: 'sendMessage', message } } },
      (state) => {
        expect(state.chat?.messages).toHaveLength(1);
        expect(state.chat?.messages[0]?.content).toContain('verifyAuthToken');
        expect(sentMessage).toBe(message);
      }
    );

    chunk('Draft looks correct.');
    await store.receive({
      type: 'chat',
      action: { type: 'presented', action: { type: 'chunkReceived', chunk: 'Draft looks correct.', streamId: '1' } }
    });
    complete();
    await store.receive(
      { type: 'chat', action: { type: 'presented', action: { type: 'streamComplete', streamId: '1' } } },
      (state) => {
        expect(state.conversations['conv-1']?.completedResponses.map((r) => r.content)).toEqual([
          'Draft looks correct.'
        ]);
      }
    );

    await store.finish();
  });
});
