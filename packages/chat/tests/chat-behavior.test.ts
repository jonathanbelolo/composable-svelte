import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createStore } from '@composable-svelte/core';
import ChatMessage from '../src/lib/streaming-chat/primitives/ChatMessage.svelte';
import ContextMenu from '../src/lib/streaming-chat/primitives/ContextMenu.svelte';
import * as markdown from '../src/lib/streaming-chat/markdown';
import { streamingChatReducer } from '../src/lib/streaming-chat/reducer';
import { createInitialStreamingChatState, type Message } from '../src/lib/streaming-chat/types';
import { propsBox } from './props-box.svelte';
vi.mock('../src/lib/streaming-chat/markdown', { spy: true });

const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });
function message(content = 'hello'): Message { return { id: 'message', role: 'assistant', content, timestamp: 0 }; }
function mountMessage(content: string) {
 const props = propsBox({ message: message(content), isStreaming: false, assistantLabel: 'Assistant' });
 const target = document.createElement('div'); document.body.append(target);
 const component = mount(ChatMessage, { target, props }); flushSync();
 cleanups.push(() => { void unmount(component); target.remove(); });
 return { props, target };
}
it('replaces completed code with a live copy button that copies only the new text', async () => {
 await markdown.optionalDependenciesReady;
 const writeText = vi.fn(async (_text: string) => {}); vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);
 const { props, target } = mountMessage('```js\nfirst()\n```');
 expect(target.querySelectorAll('.copy-button')).toHaveLength(1);
 props.message = message('```js\nsecond()\n```'); flushSync();
 expect(target.querySelectorAll('.copy-button')).toHaveLength(1);
 (target.querySelector('.copy-button') as HTMLButtonElement).click();
 await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('second()'));
 props.isStreaming = true; flushSync(); expect(target.querySelectorAll('.copy-button')).toHaveLength(0);
 props.isStreaming = false; flushSync(); expect(target.querySelectorAll('.copy-button')).toHaveLength(1);
});
it('extracts one stable image collection for one content version and refreshes for changed content', async () => {
 await markdown.optionalDependenciesReady;
 vi.mocked(markdown.extractImagesFromMarkdown).mockClear();
 const { props, target } = mountMessage('![first](https://example.test/first.png)');
 expect(markdown.extractImagesFromMarkdown).toHaveBeenCalledTimes(1);
 expect(target.querySelector('.chat-message__gallery')).not.toBeNull();
 props.assistantLabel = 'Changed'; flushSync();
 expect(markdown.extractImagesFromMarkdown).toHaveBeenCalledTimes(1);
 props.message = message('![second](https://example.test/second.png)'); flushSync();
 expect(markdown.extractImagesFromMarkdown).toHaveBeenCalledTimes(2);
 expect(target.querySelector('.chat-message__gallery img')?.getAttribute('data-src')).toBe('https://example.test/second.png');
});
function mountMenu() {
 const store = createStore({ initialState: createInitialStreamingChatState(), reducer: streamingChatReducer, dependencies: { streamMessage: () => {} } });
 const target = document.createElement('div'); document.body.append(target);
 const component = mount(ContextMenu, { target, props: { message: message(), store } }); flushSync();
 let gone = false; const dispose = () => { if (!gone) { gone = true; void unmount(component); target.remove(); store.destroy(); } };
 cleanups.push(dispose); return { target, dispose, trigger: target.querySelector('button')! };
}
it.each(['close', 'unmount'] as const)('cancels deferred outside listener before %s', async mode => {
 vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
 const add = vi.spyOn(document, 'addEventListener');
 const { target, trigger, dispose } = mountMenu();
 trigger.click(); flushSync(); expect(target.querySelector('.context-menu__dropdown')).not.toBeNull();
 if (mode === 'close') { trigger.click(); flushSync(); } else dispose();
 await vi.runAllTimersAsync();
 expect(add.mock.calls.filter(([type, listener]) => type === 'click' && typeof listener === 'function' && listener.name === 'handleClickOutside')).toHaveLength(0);
});
it('installs a live outside listener and removes it on close', async () => {
 vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
 const add = vi.spyOn(document, 'addEventListener'); const remove = vi.spyOn(document, 'removeEventListener');
 const { target, trigger } = mountMenu(); trigger.click(); flushSync(); await vi.runAllTimersAsync();
 const listener = add.mock.calls.find(([type, listener]) => type === 'click' && typeof listener === 'function' && listener.name === 'handleClickOutside')?.[1]; expect(listener).toBeDefined();
 document.body.click(); flushSync(); expect(target.querySelector('.context-menu__dropdown')).toBeNull();
 expect(remove).toHaveBeenCalledWith('click', listener);
});
it('normal transport ownership stays outside state while stop executes abort through the store', () => {
 const controller = new AbortController(); const abort = vi.spyOn(controller, 'abort');
 const store = createStore({ initialState: createInitialStreamingChatState(), reducer: streamingChatReducer, dependencies: { streamMessage: () => controller } });
 cleanups.push(() => store.destroy()); store.dispatch({ type: 'sendMessage', message: 'hello' });
 expect(store.state.currentStreaming).not.toHaveProperty('abortController'); expect(abort).not.toHaveBeenCalled();
 store.dispatch({ type: 'stopGeneration' }); expect(abort).toHaveBeenCalledTimes(1);
});
it('legacy controller compatibility reduction stays pure and its returned effect aborts only when executed', () => {
 const controller = new AbortController();
 const state = { ...createInitialStreamingChatState(), currentStreaming: { content: 'partial', abortController: controller } };
 const [next] = streamingChatReducer(state, { type: 'stopGeneration' }, { streamMessage: () => {} });
 expect(controller.signal.aborted).toBe(false); expect(next.currentStreaming).toBeNull();
 const store = createStore({ initialState: state, reducer: streamingChatReducer, dependencies: { streamMessage: () => {} } });
 cleanups.push(() => store.destroy()); store.dispatch({ type: 'stopGeneration' });
 expect(controller.signal.aborted).toBe(true); expect(store.state.messages.at(-1)?.content).toBe('partial');
});
