import { expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { StreamingChatDependencies } from '@composable-svelte/chat';
import ManagedChat from './ManagedChat.svelte';

it('archives a completed child reply once and aborts a pending stream on owner retirement', async () => {
  const streams: Array<{ chunk: (text: string) => void; complete: () => void; abort: ReturnType<typeof vi.fn> }> = [];
  const dependencies: StreamingChatDependencies = {
    streamMessage: (_message, onChunk, onComplete) => {
      const controller = new AbortController();
      const abort = vi.fn();
      controller.signal.addEventListener('abort', abort);
      streams.push({ chunk: onChunk, complete: onComplete, abort });
      return controller;
    },
    generateId: (() => { let id = 0; return () => `m${++id}`; })(),
    getTimestamp: () => 1000
  };
  const warn = vi.spyOn(console, 'warn');
  const error = vi.spyOn(console, 'error');
  const target = document.createElement('div');
  document.body.append(target);
  const app = mount(ManagedChat, { target, props: { dependencies } });
  try {
    const button = (label: string) => [...target.querySelectorAll('button')].find(b => b.textContent === label) as HTMLButtonElement;
    button('Open chat').click();
    flushSync();
    const send = (text: string) => {
      const input = target.querySelector('textarea') as HTMLTextAreaElement;
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
      (target.querySelector('[aria-label="Send message"]') as HTMLButtonElement).click();
      flushSync();
    };
    send('First question');
    expect(streams).toHaveLength(1);
    streams[0]!.chunk('First answer');
    streams[0]!.complete();
    flushSync();
    expect(target.textContent).toContain('1 replies archived');
    send('Second question');
    expect(streams).toHaveLength(2);
    button('Close chat').click();
    flushSync();
    expect(streams[1]!.abort).toHaveBeenCalledTimes(1);
    expect(target.querySelector('.full-streaming-chat')).toBeNull();
    streams[1]!.complete();
    flushSync();
    expect(target.textContent).toContain('1 replies archived');
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  } finally {
    await unmount(app);
    target.remove();
    warn.mockRestore();
    error.mockRestore();
  }
});
