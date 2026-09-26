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

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import FullStreamingChat from '../src/lib/streaming-chat/variants/FullStreamingChat.svelte';
import { streamingChatReducer } from '../src/lib/streaming-chat/reducer.js';
import { createInitialStreamingChatState } from '../src/lib/streaming-chat/types.js';
import type {
	Message,
	StreamingChatState,
	StreamingChatAction,
	StreamingChatDependencies
} from '../src/lib/streaming-chat/types.js';

const nativeMatchMedia = window.matchMedia.bind(window);
beforeEach(() => {
	vi.spyOn(window, 'matchMedia').mockImplementation(query => {
		const result = nativeMatchMedia(query);
		if (query === '(prefers-reduced-motion: reduce)') {
			Object.defineProperty(result, 'matches', { value: false });
		}
		return result;
	});
});
let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
	vi.restoreAllMocks();
});

const frames = (n: number) =>
	new Promise((resolve) => {
		let left = n;
		const tick = () => (left-- <= 0 ? resolve(undefined) : requestAnimationFrame(tick));
		requestAnimationFrame(tick);
	});

async function waitForGeometry(predicate: () => boolean, maxFrames = 60): Promise<boolean> {
	for (let i = 0; i < maxFrames; i += 1) {
		if (predicate()) return true;
		await new Promise((resolve) => requestAnimationFrame(resolve));
	}
	return predicate();
}

function longConversation(count: number): Message[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `m${i}`,
		role: (i % 2 === 0 ? 'user' : 'assistant') as Message['role'],
		content: `message ${i} — ${'padding '.repeat(20)}`,
		timestamp: 0
	}));
}

function mountChat(initialStateOverrides: Partial<StreamingChatState> = {}) {
	const dependencies: StreamingChatDependencies = {
		streamMessage: () => {}
	};
	const store = createStore<StreamingChatState, StreamingChatAction>({
		initialState: {
			...createInitialStreamingChatState(),
			messages: longConversation(40),
			currentStreaming: { content: '' },
			...initialStateOverrides
		},
		reducer: streamingChatReducer,
		dependencies
	});
	const target = document.createElement('div');
	target.style.cssText = 'height:300px;width:400px;position:absolute;top:0;left:0;';
	document.body.appendChild(target);
	const component = mount(FullStreamingChat, { target, props: { store } });
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

		// Wait for initial conversation to settle at the bottom
		const initialSettled = await waitForGeometry(
			() => list.scrollHeight - list.scrollTop - list.clientHeight <= 1
		);
		expect(initialSettled, 'initial conversation failed to scroll to bottom').toBe(true);
		await frames(2); // Let the initial loop observe its settled target and stop.

		const baselineScrollHeight = list.scrollHeight;
		const baselineScrollTop = list.scrollTop;
		expect(baselineScrollHeight, 'baseline conversation has no scrollable overflow').toBeGreaterThan(
			list.clientHeight
		);

		// Stream several chunks, the way a response arrives.
		for (let i = 0; i < 5; i += 1) {
			const chunk = `stream-chunk-${i} ${'more text '.repeat(20)}`;
			const prevScrollHeight = list.scrollHeight;
			store.dispatch({ type: 'chunkReceived', chunk });
			flushSync();

			// Assert visible content rendered into DOM and geometry expanded mid-stream
			expect(list.textContent).toContain(`stream-chunk-${i}`);
			expect(list.scrollHeight, `scrollHeight must expand on chunk ${i}`).toBeGreaterThan(
				prevScrollHeight
			);

			await frames(2);
		}

		const reachedBottom = await waitForGeometry(
			() => list.scrollHeight - list.scrollTop - list.clientHeight < 50
		);
		expect(reachedBottom, 'follower failed to reach the bottom of streamed content').toBe(true);

		const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
		// The defect: the follower's own frames tripped the "user scrolled away"
		// check, auto-scroll switched itself off, and the list fell behind the
		// text it was meant to be following.
		expect(remaining, `list stalled ${remaining}px from the bottom`).toBeLessThan(50);
		expect(list.scrollTop, 'scrollTop should advance beyond baseline').toBeGreaterThan(
			baselineScrollTop
		);
		expect(list.scrollHeight, 'scrollHeight should have expanded beyond baseline').toBeGreaterThan(
			baselineScrollHeight
		);
	});

	it('still lets the user scroll away mid-stream', async () => {
		// The other half. A follower that simply ignored every scroll event while
		// running would pass the test above and trap the user at the bottom.
		const { store, list } = mountChat();
		expect(list, 'no message list rendered').not.toBeNull();

		// Wait for initial conversation to settle at the bottom
		const initialSettled = await waitForGeometry(
			() => list.scrollHeight - list.scrollTop - list.clientHeight < 50
		);
		expect(initialSettled, 'initial conversation failed to scroll to bottom').toBe(true);
		expect(list.scrollTop, 'list should be scrolled down initially').toBeGreaterThan(100);

		// Stream chunk 1 and assert visible content and changing geometry
		const chunk1 = 'mid-stream-chunk-1 ' + 'text '.repeat(300);
		const scrollHeightBeforeChunk1 = list.scrollHeight;
		store.dispatch({ type: 'chunkReceived', chunk: chunk1 });
		flushSync();

		expect(list.textContent).toContain('mid-stream-chunk-1');
		expect(list.scrollHeight, 'scrollHeight must expand on chunk 1').toBeGreaterThan(
			scrollHeightBeforeChunk1
		);

		await frames(2);
		expect(list.scrollHeight - list.scrollTop - list.clientHeight, 'interrupt while follower is still travelling').toBeGreaterThan(50);

		// User scrolls away mid-stream to top
		list.scrollTop = 0;
		list.dispatchEvent(new Event('scroll'));
		flushSync();
		expect(list.scrollTop, 'user scroll should place list at top').toBe(0);

		// Stream chunk 2 while user is scrolled away
		const chunk2 = 'mid-stream-chunk-2 ' + 'more '.repeat(50);
		const scrollHeightBeforeChunk2 = list.scrollHeight;
		store.dispatch({ type: 'chunkReceived', chunk: chunk2 });
		flushSync();

		// Assert chunk 2 content is rendered and geometry expanded mid-stream
		expect(list.textContent).toContain('mid-stream-chunk-2');
		expect(list.scrollHeight, 'scrollHeight must expand on chunk 2').toBeGreaterThan(
			scrollHeightBeforeChunk2
		);

		// Bounded frame delay: if follower erroneously continues following, scrollTop will advance
		await frames(10);

		expect(list.scrollTop, 'the user was dragged back to the bottom').toBeLessThan(50);
		expect(list.scrollTop, 'user position should remain anchored at top').toBe(0);
	});
});
