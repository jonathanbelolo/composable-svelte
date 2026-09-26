import { expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ChatMessage from '../src/lib/streaming-chat/primitives/ChatMessage.svelte';
const control = vi.hoisted(() => {
 let release!: () => void;
 const ready = new Promise<void>(resolve => { release = resolve; });
 return { ready, release, loaded: false };
});
vi.mock('../src/lib/streaming-chat/markdown', async importOriginal => {
 const actual = await importOriginal<typeof import('../src/lib/streaming-chat/markdown')>();
 const { default: Video } = await import('./fixtures/OptionalVideo.svelte');
 return { ...actual, optionalDependenciesReady: control.ready,
  getVideoEmbedComponent: () => control.loaded ? Video : null,
  extractVideosFromMarkdown: () => control.loaded ? [{ url: 'https://youtu.be/example', platform: 'youtube', videoId: 'example' }] : [] };
});
it('invalidates memoized video extraction when the optional renderer becomes ready after mount', async () => {
 const target = document.createElement('div'); document.body.append(target);
 const component = mount(ChatMessage, { target, props: { message: { id: 'm', role: 'assistant', content: 'https://youtu.be/example', timestamp: 0 } } });
 try {
  flushSync(); expect(target.querySelector('[data-optional-video]')).toBeNull();
  control.loaded = true; control.release();
  await vi.waitFor(() => { flushSync(); expect(target.querySelector('[data-optional-video]')?.getAttribute('data-optional-video')).toBe('https://youtu.be/example'); });
 } finally { await unmount(component); target.remove(); }
});
