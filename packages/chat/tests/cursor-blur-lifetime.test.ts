import { afterEach, expect, it, vi } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { collaborativeReducer } from '../src/lib/streaming-chat/collaborative-reducer.js';
import { createInitialCollaborativeState, type CollaborativeAction, type CollaborativeStreamingChatState } from '../src/lib/streaming-chat/collaborative-types.js';
import { useCursorTracking } from '../src/lib/streaming-chat/collaborative-hooks.js';
const cleanups: Array<() => void> = [];
afterEach(() => {
    cleanups.splice(0).reverse().forEach(f => f());
    vi.useRealTimers();
});
it('blur cancels queued cursor publication and refocus remains live', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const state = createInitialCollaborativeState();
    state.currentUserId = 'me';
    state.users.set('me', { id: 'me', name: 'Me', color: 'red', presence: 'active', typing: null, cursor: null, lastSeen: 0 });
    const store = createStore<CollaborativeStreamingChatState, CollaborativeAction>({ initialState: state, reducer: collaborativeReducer, dependencies: { getTimestamp: () => Date.now() } });
    const input = document.createElement('textarea');
    input.value = 'hello';
    document.body.append(input);
    const stopTracking = useCursorTracking(store, input, 100);
    let tracking = true;
    const dispose = () => {
        if (tracking) {
            tracking = false;
            stopTracking();
        }
    };
    cleanups.push(() => {
        dispose();
        store.destroy();
        input.remove();
    });
    input.focus();
    input.setSelectionRange(1, 1);
    input.dispatchEvent(new KeyboardEvent('keyup'));
    expect(store.state.users.get('me')!.cursor).not.toBeNull();
    expect(vi.getTimerCount()).toBe(1);
    input.blur();
    expect(vi.getTimerCount()).toBe(0);
    expect(store.state.users.get('me')!.cursor).toBeNull();
    vi.advanceTimersByTime(101);
    expect(store.state.users.get('me')!.cursor).toBeNull();
    input.focus();
    expect(store.state.users.get('me')!.cursor?.position).toBe(1);
    input.setSelectionRange(3, 3);
    input.dispatchEvent(new KeyboardEvent('keyup'));
    vi.advanceTimersByTime(101);
    expect(store.state.users.get('me')!.cursor?.position).toBe(3);
    dispose();
    expect(store.state.users.get('me')!.cursor).toBeNull();
    input.setSelectionRange(5, 5);
    input.dispatchEvent(new KeyboardEvent('keyup'));
    vi.advanceTimersByTime(101);
    expect(store.state.users.get('me')!.cursor).toBeNull();
});
it('disposing an old input after focus handoff preserves the new cursor', () => {
    const state = createInitialCollaborativeState();
    state.currentUserId = 'me';
    state.users.set('me', { id: 'me', name: 'Me', color: 'red', presence: 'active', typing: null, cursor: null, lastSeen: 0 });
    const store = createStore<CollaborativeStreamingChatState, CollaborativeAction>({ initialState: state, reducer: collaborativeReducer, dependencies: { getTimestamp: () => Date.now() } });
    const first = document.createElement('textarea');
    const second = document.createElement('textarea');
    first.value = 'first';
    second.value = 'second';
    document.body.append(first, second);
    const stopFirst = useCursorTracking(store, first, 100);
    const stopSecond = useCursorTracking(store, second, 100);
    cleanups.push(() => {
        stopFirst();
        stopSecond();
        store.destroy();
        first.remove();
        second.remove();
    });
    first.focus();
    expect(store.state.users.get('me')!.cursor).not.toBeNull();
    second.setSelectionRange(2, 2);
    second.focus();
    expect(store.state.users.get('me')!.cursor?.position).toBe(2);
    stopFirst();
    expect(store.state.users.get('me')!.cursor?.position).toBe(2);
    second.remove();
    stopSecond();
    expect(store.state.users.get('me')!.cursor).toBeNull();
});
