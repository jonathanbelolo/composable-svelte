import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import { createFakeWorkspaceDependencies } from '../src/dependencies';

beforeAll(() => {
  if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  }
});

const settle = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor<T>(read: () => T | null | undefined | false, what: string, maxAttempts = 100): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    const value = read();
    if (value) return value;
    await settle(25);
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

describe('Support Workspace - Component & Browser DOM Interaction', () => {
  const cleanup: Array<() => void> = [];
  afterEach(async () => {
    while (cleanup.length > 0) {
      const fn = cleanup.pop();
      try {
        await fn?.();
      } catch {
        /* cleanup */
      }
    }
  });

  it('mounts the workspace and renders Chat, Code, and Media features', async () => {
    const dependencies = createFakeWorkspaceDependencies();
    const target = document.createElement('div');
    document.body.appendChild(target);

    const app = mount(App, { target, props: { dependencies } });
    flushSync();
    cleanup.push(async () => {
      await unmount(app);
      target.remove();
    });

    // 1. Verify workspace header and active conversation
    expect(target.querySelector('[data-testid="workspace-root"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="active-id"]')?.textContent).toBe('conv-1');

    // 2. Verify all 3 packaged features are present in the UI
    // - FullStreamingChat
    expect(target.querySelector('.full-streaming-chat, [data-testid="chat-feature"]')).not.toBeNull();
    // - CodeEditor (CodeMirror 6 engine)
    const cmEditor = await waitFor(
      () => target.querySelector<HTMLElement>('.cm-editor'),
      'CodeMirror editor'
    );
    expect(cmEditor).not.toBeNull();
    // - VoiceInput
    expect(target.querySelector('.voice-input, [data-testid="voice-feature"]')).not.toBeNull();
    // - Media Embed
    expect(target.querySelector('[data-testid="media-box"]')).not.toBeNull();

    // 3. Verify qualification notice is explicitly displayed
    const qualificationNotice = target.querySelector('[data-testid="qualification-notice"]');
    expect(qualificationNotice?.textContent).toContain('Deterministic Simulation');
  });

  it('routes live editor commands to the live CodeMirror instance via observeChildActions', async () => {
    const dependencies = createFakeWorkspaceDependencies();
    const target = document.createElement('div');
    document.body.appendChild(target);

    const app = mount(App, { target, props: { dependencies } });
    flushSync();
    cleanup.push(async () => {
      await unmount(app);
      target.remove();
    });

    const cmEditor = await waitFor(
      () => target.querySelector<HTMLElement>('.cm-editor'),
      'CodeMirror live editor'
    );

    const getEditorText = () =>
      [...cmEditor.querySelectorAll('.cm-line')].map((line) => line.textContent).join('\n');

    expect(getEditorText()).toContain('verifyAuthToken');

    // Click "+ Snippet" editor command button
    const insertBtn = target.querySelector<HTMLButtonElement>('[data-testid="editor-insert-snippet-btn"]')!;
    expect(insertBtn).not.toBeNull();
    insertBtn.click();
    flushSync();

    // CodeMirror receives the insertText action via observeChildActions and updates live document
    await waitFor(
      () => getEditorText().includes('// Injected live snippet'),
      'Injected live snippet in CodeMirror'
    );
    expect(getEditorText()).toContain('export const helper = () => true;');
  });

  it('streams chat messages through deterministic transport and records completed response in durable state', async () => {
    const dependencies = createFakeWorkspaceDependencies({
      autoReplyPrefix: 'Support advice: ',
      streamDelayMs: 20
    });

    const target = document.createElement('div');
    document.body.appendChild(target);

    const app = mount(App, { target, props: { dependencies } });
    flushSync();
    cleanup.push(async () => {
      await unmount(app);
      target.remove();
    });

    // Enter message in chat textarea
    const textarea = await waitFor(
      () => target.querySelector<HTMLTextAreaElement>('.full-streaming-chat textarea, textarea'),
      'Chat textarea'
    );
    textarea.value = 'How should I authenticate requests?';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    // Click Send
    const sendButton = target.querySelector<HTMLButtonElement>(
      'button[aria-label="Send message"], button[type="submit"]'
    )!;
    expect(sendButton).not.toBeNull();
    sendButton.click();
    flushSync();

    // Wait for the streaming response to arrive and complete
    await waitFor(
      () => target.textContent?.includes('Support advice: How should I authenticate requests?'),
      'Streamed assistant reply'
    );

    // Verify durable recorded outcome in parent state:
    // The completed assistant response is recorded once in the archived responses section
    const archivedContainer = target.querySelector('[data-testid="archived-responses-container"]');
    expect(archivedContainer).not.toBeNull();
    await waitFor(
      () => target.querySelector('[data-testid="archived-reply-item"]') !== null,
      'Archived reply item in durable container'
    );
    expect(target.querySelector('[data-testid="archived-reply-item"]')?.textContent).toContain(
      'Support advice: How should I authenticate requests?'
    );
    expect(target.querySelector('[data-testid="archived-count"]')?.textContent).toBe('1');
  });

  it('records voice transcripts and attributes them to the active conversation', async () => {
    const dependencies = createFakeWorkspaceDependencies({
      transcriptText: 'User verified client credentials in header'
    });

    const target = document.createElement('div');
    document.body.appendChild(target);

    const app = mount(App, { target, props: { dependencies } });
    flushSync();
    cleanup.push(async () => {
      await unmount(app);
      target.remove();
    });

    // Locate the push-to-talk button inside VoiceInput
    const micButton = await waitFor(
      () => target.querySelector<HTMLButtonElement>('.voice-input button'),
      'Voice input mic button'
    );

    // Simulate push-to-talk press & release via keyboard Space
    micButton.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    flushSync();
    await settle(30);

    micButton.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }));
    flushSync();
    await settle(50);

    // Wait for transcript to be recorded in conversation state and displayed
    await waitFor(
      () => target.querySelector('[data-testid="transcript-item"]') !== null,
      'Recorded transcript item'
    );

    expect(target.querySelector('[data-testid="transcript-item"]')?.textContent).toContain(
      'User verified client credentials in header'
    );
    expect(target.querySelector('[data-testid="transcripts-count"]')?.textContent).toBe('1');
  });

  it('a transcription finishing after replacement never reaches the successor conversation', async () => {
    // Deferred fake STT: the test decides when each transcription resolves.
    async function recordThenMaybeReplace(replace: boolean) {
      const dependencies = createFakeWorkspaceDependencies();
      let resolveTranscript: ((text: string) => void) | undefined;
      dependencies.transcribeAudio = () =>
        new Promise<string>((resolve) => {
          resolveTranscript = resolve;
        });

      const target = document.createElement('div');
      document.body.appendChild(target);
      const app = mount(App, { target, props: { dependencies } });
      flushSync();
      cleanup.push(async () => {
        await unmount(app);
        target.remove();
      });

      const micButton = await waitFor(
        () => target.querySelector<HTMLButtonElement>('.voice-input button'),
        'Voice input mic button'
      );
      micButton.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      flushSync();
      await settle(30);
      micButton.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }));
      flushSync();
      await waitFor(() => resolveTranscript, 'Pending conv-1 transcription');

      if (replace) {
        target.querySelector<HTMLButtonElement>('[data-testid="switch-to-conv-2-btn"]')!.click();
        flushSync();
        await waitFor(
          () => target.querySelector('[data-testid="active-id"]')?.textContent === 'conv-2',
          'Active conversation conv-2'
        );
      }

      resolveTranscript!('Late conv-1 voice note');
      await settle(50);
      flushSync();
      return target;
    }

    // Negative control: without replacement the pending transcript lands on conv-1.
    // It is asserted after the same fixed wait used for the replacement case below.
    const control = await recordThenMaybeReplace(false);
    expect(control.querySelector('[data-testid="transcripts-count"]')?.textContent).toBe('1');

    // With replacement the retired voice owner cannot deliver into conv-2.
    const target = await recordThenMaybeReplace(true);
    expect(target.querySelector('[data-testid="active-id"]')?.textContent).toBe('conv-2');
    expect(target.querySelector('[data-testid="transcripts-count"]')?.textContent).toBe('0');
    expect(target.textContent).not.toContain('Late conv-1 voice note');

    // The package cancels transcription work with its owner, so conv-1 does not receive it either.
    target.querySelector<HTMLButtonElement>('[data-testid="switch-to-conv-1-btn"]')!.click();
    flushSync();
    await waitFor(
      () => target.querySelector('[data-testid="active-id"]')?.textContent === 'conv-1',
      'Active conversation conv-1'
    );
    expect(target.querySelector('[data-testid="transcripts-count"]')?.textContent).toBe('0');
  });

  it('supports replacing conversations, preserving independent state and preventing cross-conversation mutation', async () => {
    const dependencies = createFakeWorkspaceDependencies();
    const target = document.createElement('div');
    document.body.appendChild(target);

    const app = mount(App, { target, props: { dependencies } });
    flushSync();
    cleanup.push(async () => {
      await unmount(app);
      target.remove();
    });

    // 1. Wait for live editor to be mounted
    await waitFor(() => target.querySelector<HTMLElement>('.cm-editor'), 'CodeMirror live editor');

    // In Conv-1, insert snippet into live editor
    const insertBtn = target.querySelector<HTMLButtonElement>('[data-testid="editor-insert-snippet-btn"]')!;
    insertBtn.click();
    flushSync();
    await waitFor(
      () => target.querySelector('.cm-editor')?.textContent?.includes('// Injected live snippet'),
      'Snippet inserted in live editor'
    );
    await settle(50);

    // 2. Replace conversation with conv-2 (Issue #102)
    const switchBtn = target.querySelector<HTMLButtonElement>('[data-testid="switch-to-conv-2-btn"]')!;
    expect(switchBtn).not.toBeNull();
    switchBtn.click();
    flushSync();

    // Verify conv-2 is now active
    await waitFor(
      () => target.querySelector('[data-testid="active-id"]')?.textContent === 'conv-2',
      'Active conversation conv-2'
    );

    // Conv-2 has its own independent code draft
    const cmEditor = await waitFor(() => target.querySelector<HTMLElement>('.cm-editor'), 'Editor in conv-2');
    const getEditorText = () =>
      [...cmEditor.querySelectorAll('.cm-line')].map((line) => line.textContent).join('\n');
    expect(getEditorText()).toContain('calculateBufferSize');
    expect(getEditorText()).not.toContain('// Injected live snippet');

    // 3. Switch back to conv-1
    const switchBackBtn = target.querySelector<HTMLButtonElement>('[data-testid="switch-to-conv-1-btn"]')!;
    switchBackBtn.click();
    flushSync();

    await waitFor(
      () => target.querySelector('[data-testid="active-id"]')?.textContent === 'conv-1',
      'Active conversation conv-1'
    );

    // Conv-1 draft was preserved independently
    const cmEditor1 = await waitFor(() => target.querySelector<HTMLElement>('.cm-editor'), 'Editor in conv-1');
    const getEditor1Text = () =>
      [...cmEditor1.querySelectorAll('.cm-line')].map((line) => line.textContent).join('\n');
    expect(getEditor1Text()).toContain('verifyAuthToken');
    expect(getEditor1Text()).toContain('// Injected live snippet');
  });

  it('closing a conversation unmounts features and re-opening restores cleanly', async () => {
    const dependencies = createFakeWorkspaceDependencies();
    const target = document.createElement('div');
    document.body.appendChild(target);

    const app = mount(App, { target, props: { dependencies } });
    flushSync();
    cleanup.push(async () => {
      await unmount(app);
      target.remove();
    });

    // Close active conversation
    const closeBtn = target.querySelector<HTMLButtonElement>('[data-testid="close-conversation-btn"]')!;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    flushSync();

    // Empty state should be visible and features unmounted
    expect(target.querySelector('[data-testid="empty-workspace"]')).not.toBeNull();
    expect(target.querySelector('.cm-editor')).toBeNull();
    expect(target.querySelector('.full-streaming-chat')).toBeNull();

    // Reopen conversation
    const reopenBtn = target.querySelector<HTMLButtonElement>('[data-testid="empty-open-conv-1-btn"]')!;
    expect(reopenBtn).not.toBeNull();
    reopenBtn.click();
    flushSync();

    // Workspace is restored
    await waitFor(() => target.querySelector('.cm-editor') !== null, 'Reopened editor');
    expect(target.querySelector('[data-testid="active-id"]')?.textContent).toBe('conv-1');
  });
});
