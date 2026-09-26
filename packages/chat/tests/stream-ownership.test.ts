import { describe, it, expect, vi, type Mock } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { streamingChatReducer } from '../src/lib/streaming-chat/reducer.js';
import { createInitialStreamingChatState, type StreamingChatDependencies, type StreamingChatState } from '../src/lib/streaming-chat/types.js';
function fixture(options: {
    controller?: boolean;
    synchronous?: boolean;
} = {}) {
    const streams: Array<{
        chunk: (s: string) => void;
        complete: () => void;
        error: (s: string) => void;
        controller: AbortController;
        abort: Mock<(reason?: unknown) => void>;
    }> = [];
    const dependencies: StreamingChatDependencies = { generateId: () => 'constant', getTimestamp: () => 1, streamMessage(_message, chunk, complete, error) { const controller = new AbortController(); const abort = vi.spyOn(controller, 'abort'); streams.push({ chunk, complete, error, controller, abort }); if (options.synchronous) {
            chunk('sync');
            complete();
        } return options.controller === false ? undefined : controller; } };
    const store = createStore({ initialState: createInitialStreamingChatState(), reducer: streamingChatReducer, dependencies, ssr: { deferEffects: false } });
    return { store, streams, dependencies };
}
describe('stream operation ownership', () => {
    it('keeps transport alive across turns and retires it once on replacement despite constant message IDs', async () => {
        const f = fixture();
        try {
            f.store.dispatch({ type: 'sendMessage', message: 'first' });
            await Promise.resolve();
            f.streams[0]!.chunk('old');
            f.store.dispatch({ type: 'sendMessage', message: 'second' });
            expect(f.streams[0]!.abort).toHaveBeenCalledTimes(1);
            f.streams[0]!.chunk('late');
            f.streams[0]!.complete();
            f.streams[0]!.error('late');
            f.streams[1]!.chunk('new');
            expect(f.store.state.currentStreaming?.content).toBe('new');
            f.streams[1]!.complete();
            expect(f.store.state.messages.at(-1)?.content).toBe('new');
            expect(f.streams[1]!.abort).not.toHaveBeenCalled();
        }
        finally {
            f.store.destroy();
        }
    });
    for (const kind of ['stopGeneration', 'clearMessages', 'restoreMessages'] as const)
        it(`retires callbacks on ${kind}`, async () => {
            const f = fixture();
            const dispatched: string[] = [];
            const stop = f.store.subscribeToActions!(action => {
                dispatched.push(action.type);
            });
            try {
                f.store.dispatch({ type: 'sendMessage', message: 'first' });
                await Promise.resolve();
                f.streams[0]!.chunk('partial');
                f.store.dispatch(kind === 'restoreMessages' ? { type: kind, messages: [] } : { type: kind });
                expect(f.streams[0]!.abort).toHaveBeenCalledTimes(1);
                const state = f.store.state;
                const countBeforeLate = dispatched.length;
                f.streams[0]!.chunk('late');
                f.streams[0]!.complete();
                f.streams[0]!.error('late');
                expect(dispatched.slice(countBeforeLate)).toEqual([]);
                expect(f.store.state).toBe(state);
                if (kind === 'stopGeneration')
                    expect(state.messages.at(-1)?.content).toBe('partial');
            }
            finally {
                stop();
                f.store.destroy();
            }
        });
    it('preserves partial content without a transport controller', () => {
        const f = fixture({ controller: false });
        const dispatched: string[] = [];
        const stop = f.store.subscribeToActions!(action => {
            dispatched.push(action.type);
        });
        try {
        f.store.dispatch({ type: 'sendMessage', message: 'hello' });
        f.streams[0]!.chunk('partial');
        f.store.dispatch({ type: 'stopGeneration' });
        expect(f.store.state.messages.at(-1)?.content).toBe('partial');
        const state = f.store.state;
        const countBeforeLate = dispatched.length;
        f.streams[0]!.chunk('late');
        f.streams[0]!.complete();
        f.streams[0]!.error('late');
        expect(dispatched.slice(countBeforeLate)).toEqual([]);
        expect(f.store.state).toBe(state);
    }
    finally {
        stop();
        f.store.destroy();
    } });
    it('retires a synchronously completed transport without aborting it', () => { const f = fixture({ synchronous: true }); try {
        f.store.dispatch({ type: 'sendMessage', message: 'hello' });
        expect(f.store.state.messages.at(-1)?.content).toBe('sync');
        expect(f.streams[0]!.abort).not.toHaveBeenCalled();
    }
    finally {
        f.store.destroy();
    } expect(f.streams[0]!.abort).not.toHaveBeenCalled(); });
    it('destroy aborts still-active transport after a microtask boundary', async () => { const f = fixture(); f.store.dispatch({ type: 'sendMessage', message: 'hi' }); await Promise.resolve(); f.store.destroy(); expect(f.streams[0]!.abort).toHaveBeenCalledTimes(1); const state = f.store.state; f.streams[0]!.chunk('late'); expect(f.store.state).toBe(state); });
    it('never aborts legacy state controllers during pure reduction', () => {
        const controller = new AbortController();
        const state = { ...createInitialStreamingChatState(), currentStreaming: { content: 'partial', abortController: controller } };
        const [next, effect] = streamingChatReducer(state, { type: 'stopGeneration' }, { streamMessage: () => { } });
        expect(controller.signal.aborted).toBe(false);
        expect(next.messages.at(-1)?.content).toBe('partial');
        const findFireAndForget = (eff: typeof effect): boolean => eff._tag === 'FireAndForget' || (eff._tag === 'Batch' && eff.effects.some(findFireAndForget));
        expect(findFireAndForget(effect)).toBe(true);
    });
    it('rejects tagged terminal actions after settlement but preserves untagged legacy actions', () => { const f = fixture(); try {
        f.store.dispatch({ type: 'sendMessage', message: 'hi' });
        const streamId = f.store.state.activeStreamId!;
        f.streams[0]!.complete();
        const state = f.store.state;
        f.store.dispatch({ type: 'streamError', error: 'stale', streamId });
        expect(f.store.state).toBe(state);
        f.store.dispatch({ type: 'streamError', error: 'legacy' });
        expect(f.store.state.error).toBe('legacy');
    }
    finally {
        f.store.destroy();
    } });
});
describe('truncation and upload ownership', () => {
    it('retires the active stream when its user message is deleted', () => { const f = fixture(); try {
        f.store.dispatch({ type: 'sendMessage', message: 'hi' });
        f.store.dispatch({ type: 'deleteMessage', messageId: 'constant' });
        expect(f.streams[0]!.abort).toHaveBeenCalledTimes(1);
        f.streams[0]!.chunk('late');
        f.streams[0]!.complete();
        expect(f.store.state.messages).toEqual([]);
        expect(f.store.state.currentStreaming).toBeNull();
    }
    finally {
        f.store.destroy();
    } });
    for (const operation of ['regenerateMessage', 'submitEditedMessage'] as const)
        it(`prunes obsolete picker on ${operation}`, () => {
            const state: StreamingChatState = { ...createInitialStreamingChatState(), messages: [{ id: 'u', role: 'user', content: 'question', timestamp: 1 }, { id: 'a', role: 'assistant', content: 'answer', timestamp: 2 }], reactionPicker: { status: 'presented', content: 'a' }, editingMessage: { id: 'u', content: 'changed' } };
            const [next] = streamingChatReducer(state, operation === 'regenerateMessage' ? { type: operation, messageId: 'a' } : { type: operation }, { streamMessage: () => { } });
            expect(next.reactionPicker.status).toBe('idle');
        });
    it('updates an older upload without letting its completion replace the current reply', async () => {
        const f = fixture();
        let id = 0;
        let resolve!: (url: string) => void;
        const uploaded = new Promise<string>(done => { resolve = done; });
        let started!: () => void;
        const ready = new Promise<void>(done => { started = done; });
        const store = createStore({ initialState: createInitialStreamingChatState(), reducer: streamingChatReducer, ssr: { deferEffects: false }, dependencies: { ...f.dependencies, generateId: () => String(++id), uploadFile: async () => { started(); return uploaded; } } });
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('file'));
        try {
            store.dispatch({ type: 'sendMessage', message: 'old', attachments: [{ id: 'file', type: 'file', url: 'data:text/plain,file', filename: 'a.txt', mimeType: 'text/plain', size: 4 }] });
            await ready;
            store.dispatch({ type: 'sendMessage', message: 'new' });
            f.streams[0]!.chunk('new reply');
            let delivered!: () => void;
            const done = new Promise<void>(resolve => { delivered = resolve; });
            const stop = store.subscribeToActions!(action => { if (action.type === '_internal_attachmentsResolved')
                delivered(); });
            resolve('https://example.test/file');
            await done;
            stop();
            expect(f.streams).toHaveLength(1);
            expect(store.state.currentStreaming?.content).toBe('new reply');
        }
        finally {
            fetchSpy.mockRestore();
            store.destroy();
            f.store.destroy();
        }
    });
});
it('stops synchronously during transport setup and aborts its subsequently returned controller', () => {
    const controller = new AbortController();
    const abort = vi.spyOn(controller, 'abort');
    const store = createStore({ initialState: createInitialStreamingChatState(), reducer: streamingChatReducer, ssr: { deferEffects: false }, dependencies: { streamMessage(_message, chunk) { chunk('partial'); return controller; } } });
    const stop = store.subscribeToActions!(action => { if (action.type === 'chunkReceived')
        store.dispatch({ type: 'stopGeneration' }); });
    try {
        store.dispatch({ type: 'sendMessage', message: 'hi' });
        expect(abort).toHaveBeenCalledTimes(1);
        expect(store.state.currentStreaming).toBeNull();
        expect(store.state.messages.at(-1)?.content).toBe('partial');
    }
    finally {
        stop();
        store.destroy();
    }
});
describe('reviewed stream semantics', () => {
    it('preserves identity and emits no effects for idle Stop', () => { const message = { id: 'u', role: 'user' as const, content: 'past', timestamp: 1 }; const state = { ...createInitialStreamingChatState(), messages: [message] }; const [next, effect] = streamingChatReducer(state, { type: 'stopGeneration' }, { streamMessage: () => { } }); expect(next).toBe(state); expect(next.messages[0]).toBe(message); expect(effect._tag).toBe('None'); });
    it('preserves untouched message identity while stopping an active stream', () => { const state = { ...createInitialStreamingChatState(), messages: [{ id: 'u', role: 'user' as const, content: 'past', timestamp: 1 }], currentStreaming: { content: '' } }; const [next] = streamingChatReducer(state, { type: 'stopGeneration' }, { streamMessage: () => { } }); expect(next.messages).toBe(state.messages); });
    it('accepts a legacy untagged attachment resolution without converting it into unmatchable tagged actions', () => { const f = fixture(); const store = createStore({ initialState: { ...createInitialStreamingChatState(), currentStreaming: { content: '' } }, reducer: streamingChatReducer, dependencies: f.dependencies, ssr: { deferEffects: false } }); try {
        store.dispatch({ type: '_internal_attachmentsResolved', messageId: 'legacy', message: 'hello', attachments: [] });
        f.streams[0]!.chunk('reply');
        f.streams[0]!.complete();
        expect(store.state.messages.at(-1)?.content).toBe('reply');
        expect(f.streams[0]!.abort).not.toHaveBeenCalled();
    }
    finally {
        store.destroy();
        f.store.destroy();
    } });
    it('emits one observable supersession event for the retired operation', () => { const f = fixture(); const events: unknown[] = []; const stop = f.store.subscribeToActions!(action => { if (action.type === 'streamSuperseded')
        events.push(action); }); try {
        f.store.dispatch({ type: 'sendMessage', message: 'first' });
        const previous = f.store.state.activeStreamId;
        f.store.dispatch({ type: 'sendMessage', message: 'second' });
        expect(events).toEqual([{ type: 'streamSuperseded', streamId: previous, messageId: 'constant' }]);
    }
    finally {
        stop();
        f.store.destroy();
    } });
    it('keeps an active stream when an unrelated assistant message is deleted', () => { const f = fixture(); let id = 0; const store = createStore({ initialState: { ...createInitialStreamingChatState(), messages: [{ id: 'old-assistant', role: 'assistant' as const, content: 'old', timestamp: 0 }] }, reducer: streamingChatReducer, dependencies: { ...f.dependencies, generateId: () => String(++id) }, ssr: { deferEffects: false } }); try {
        store.dispatch({ type: 'sendMessage', message: 'new' });
        store.dispatch({ type: 'deleteMessage', messageId: 'old-assistant' });
        expect(f.streams[0]!.abort).not.toHaveBeenCalled();
        f.streams[0]!.chunk('still active');
        expect(store.state.currentStreaming?.content).toBe('still active');
    }
    finally {
        store.destroy();
        f.store.destroy();
    } });
});
it('Stop leaves an older independent upload able to settle metadata without starting a reply', async () => {
    const f = fixture();
    let id = 0;
    let resolve!: (url: string) => void;
    const uploaded = new Promise<string>(done => { resolve = done; });
    let started!: () => void;
    const ready = new Promise<void>(done => { started = done; });
    const store = createStore({ initialState: createInitialStreamingChatState(), reducer: streamingChatReducer, ssr: { deferEffects: false }, dependencies: { ...f.dependencies, generateId: () => String(++id), uploadFile: async () => { started(); return uploaded; } } });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('file'));
    try {
        store.dispatch({ type: 'sendMessage', message: 'old', attachments: [{ id: 'file', type: 'file', url: 'data:text/plain,file', filename: 'a.txt', mimeType: 'text/plain', size: 4 }] });
        await ready;
        store.dispatch({ type: 'sendMessage', message: 'new' });
        store.dispatch({ type: 'stopGeneration' });
        expect(store.state.messages[0]!.attachments![0]!.uploadStatus).toBe('uploading');
        let delivered!: () => void;
        const done = new Promise<void>(finish => { delivered = finish; });
        const stop = store.subscribeToActions!(action => { if (action.type === '_internal_attachmentsResolved')
            delivered(); });
        resolve('https://example.test/file');
        await done;
        stop();
        expect(f.streams).toHaveLength(1);
        expect(store.state.messages[0]!.attachments![0]!.uploadStatus).toBe('success');
        expect(store.state.currentStreaming).toBeNull();
    }
    finally {
        fetchSpy.mockRestore();
        store.destroy();
        f.store.destroy();
    }
});
it('synchronous retry on streamSuperseded installs a coherent transport without zombies', () => {
    const f = fixture();
    let retried = false;
    const stop = f.store.subscribeToActions!(action => {
        if (action.type === 'streamSuperseded' && !retried) {
            retried = true;
            f.store.dispatch({ type: 'sendMessage', message: 'retry' });
        }
    });
    try {
        f.store.dispatch({ type: 'sendMessage', message: 'first' });
        f.store.dispatch({ type: 'sendMessage', message: 'second' });
        expect(f.streams).toHaveLength(3);
        expect(f.streams[0]!.abort).toHaveBeenCalledTimes(1);
        expect(f.streams[1]!.abort).toHaveBeenCalledTimes(1);
        expect(f.streams[2]!.abort).not.toHaveBeenCalled();
        expect(f.store.state.activeStreamId).toBe('3');
        f.streams[2]!.chunk('live-chunk');
        expect(f.store.state.currentStreaming?.content).toBe('live-chunk');
        f.streams[2]!.complete();
        expect(f.store.state.messages.at(-1)?.content).toBe('live-chunk');
    }
    finally {
        stop();
        f.store.destroy();
    }
});
it('stopGeneration handles duplicate message IDs safely without throwing', () => {
    const uploadingAttachment = { id: 'f', type: 'file' as const, url: 'blob:old', filename: 'a.txt', mimeType: 'text/plain', size: 1, uploadStatus: 'uploading' as const };
    const state = {
        ...createInitialStreamingChatState(),
        messages: [
            { id: 'dup', role: 'user' as const, content: 'first', timestamp: 1 },
            { id: 'dup', role: 'user' as const, content: 'second', timestamp: 2, attachments: [uploadingAttachment] }
        ]
    };
    const [stopped] = streamingChatReducer(state, { type: 'stopGeneration' }, { streamMessage: () => { } });
    expect(stopped.messages[0]!.attachments).toBeUndefined();
    expect(stopped.messages[1]!.attachments?.[0]?.uploadStatus).toBe('error');
    expect(stopped.messages[1]!.attachments?.[0]?.uploadError).toBe('Upload cancelled');
});
it('legacy untagged attachment resolution does not hijack an active stream', () => {
    const f = fixture();
    try {
        f.store.dispatch({ type: 'sendMessage', message: 'live' });
        expect(f.store.state.activeStreamId).toBe('1');
        f.store.dispatch({ type: '_internal_attachmentsResolved', messageId: 'other', message: 'stale', attachments: [] });
        expect(f.streams).toHaveLength(1);
        expect(f.streams[0]!.abort).not.toHaveBeenCalled();
        f.streams[0]!.chunk('still live');
        expect(f.store.state.currentStreaming?.content).toBe('still live');
    }
    finally {
        f.store.destroy();
    }
});
it('a late tagged upload resolution cannot revive an attachment failed by Stop', () => {
    const attachment = { id: 'f', type: 'file' as const, url: 'blob:old', filename: 'a.txt', mimeType: 'text/plain', size: 1, uploadStatus: 'uploading' as const };
    const state = { ...createInitialStreamingChatState(), currentStreaming: { content: '' }, activeStreamId: '1', activeStreamMessageId: 'u', messages: [{ id: 'u', role: 'user' as const, content: 'hi', timestamp: 1, attachments: [attachment] }] };
    const deps = { streamMessage: () => { } };
    const [stopped] = streamingChatReducer(state, { type: 'stopGeneration' }, deps);
    const [resolved, effect] = streamingChatReducer(stopped, { type: '_internal_attachmentsResolved', streamId: '1', messageId: 'u', message: 'hi', attachments: [{ ...attachment, url: 'https://example.test/file', uploadStatus: 'success' }] }, deps);
    expect(resolved.messages[0]!.attachments![0]!.uploadStatus).toBe('error');
    expect(resolved.messages[0]!.attachments![0]!.uploadError).toBe('Upload cancelled');
    expect(effect._tag).toBe('None');
    expect(resolved).toBe(stopped);
    expect(resolved.messages).toBe(stopped.messages);
    expect(resolved.messages[0]).toBe(stopped.messages[0]);
    expect(resolved.messages[0]!.attachments).toBe(stopped.messages[0]!.attachments);
});

it('synchronous stop on superseded notification retires the installed replacement', () => {
 const f = fixture();
 const stop = f.store.subscribeToActions!(action => {
  if (action.type === 'streamSuperseded') f.store.dispatch({type: 'stopGeneration'});
 });
 try {
  f.store.dispatch({type:'sendMessage',message:'first'});
  f.store.dispatch({type:'sendMessage',message:'second'});
  expect(f.streams).toHaveLength(2);
  for (const stream of f.streams) expect(stream.abort).toHaveBeenCalledTimes(1);
  const state = f.store.state;
  f.streams[1]!.chunk('zombie');
  expect(f.store.state).toBe(state);
  expect(f.store.state.activeStreamId).toBeNull();
 } finally { stop(); f.store.destroy(); }
});
