/**
 * Auto-scroll must survive its own scrolling.
 *
 * All three chat variants keep a `shouldAutoScroll` flag, set from a `scroll`
 * listener that asks "is the container within 50px of the bottom?". They also
 * scrolled with `scroll-behavior: smooth`, which the animation policy prohibits
 * — and which was quietly breaking that flag.
 *
 * The browser fires a `scroll` event on every frame of a smooth scroll, and the
 * listener cannot tell those from the user's. Every frame more than 50px short
 * of the bottom set `shouldAutoScroll = false`, latching auto-scroll **off**
 * partway through a response until the user manually scrolled back down.
 *
 * The follower fixes it by making its own frames identifiable — not by going
 * deaf while it runs, which would leave the user unable to scroll away from a
 * stream at all. Both halves are asserted here.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import FullStreamingChat from '../src/lib/streaming-chat/variants/FullStreamingChat.svelte';
import { streamingChatReducer } from '../src/lib/streaming-chat/reducer.js';
import { createInitialStreamingChatState } from '../src/lib/streaming-chat/types.js';
import type {
	Message,
	StreamingChatState,
	StreamingChatAction
} from '../src/lib/streaming-chat/types.js';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

const frames = (n: number) =>
	new Promise((resolve) => {
		let left = n;
		const tick = () => (left-- <= 0 ? resolve(undefined) : requestAnimationFrame(tick));
		requestAnimationFrame(tick);
	});

function longConversation(count: number): Message[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `m${i}`,
		role: (i % 2 === 0 ? 'user' : 'assistant') as Message['role'],
		content: `message ${i} — ${'padding '.repeat(20)}`,
		timestamp: 0
	}));
}

function mountChat() {
	const store = createStore<StreamingChatState, StreamingChatAction>({
		initialState: { ...createInitialStreamingChatState(), messages: longConversation(40) },
		reducer: streamingChatReducer,
		dependencies: { streamMessage: () => {} } as never
	});
	const target = document.createElement('div');
	target.style.cssText = 'height:300px;width:400px;position:absolute;top:0;left:0;';
	document.body.appendChild(target);
	const component = mount(FullStreamingChat as never, { target, props: { store } });
	flushSync();
	cleanup.push(() => {
		unmount(component);
		target.remove();
		store.destroy?.();
	});
	const list = target.querySelector('.full-streaming-chat__messages') as HTMLElement;
	return { store, target, list };
}

describe('auto-scroll during a stream', () => {
	it('keeps following while its own animation runs', async () => {
		const { store, list } = mountChat();
		expect(list, 'no message list rendered').not.toBeNull();

		// Stream several chunks, the way a response arrives.
		for (let i = 0; i < 5; i += 1) {
			store.dispatch({ type: 'chunkReceived', chunk: 'more text '.repeat(20) });
			flushSync();
			await frames(3);
		}
		await frames(60);

		const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
		// The defect: the follower's own frames tripped the "user scrolled away"
		// check, auto-scroll switched itself off, and the list fell behind the
		// text it was meant to be following.
		expect(remaining, `list stalled ${remaining}px from the bottom`).toBeLessThan(50);
	});

	it('still lets the user scroll away mid-stream', async () => {
		// The other half. A follower that simply ignored every scroll event while
		// running would pass the test above and trap the user at the bottom.
		const { store, list } = mountChat();

		store.dispatch({ type: 'chunkReceived', chunk: 'text '.repeat(50) });
		flushSync();
		await frames(2);

		list.scrollTop = 0;
		list.dispatchEvent(new Event('scroll'));
		flushSync();

		store.dispatch({ type: 'chunkReceived', chunk: 'more '.repeat(50) });
		flushSync();
		await frames(30);

		expect(list.scrollTop, 'the user was dragged back to the bottom').toBeLessThan(50);
	});
});
