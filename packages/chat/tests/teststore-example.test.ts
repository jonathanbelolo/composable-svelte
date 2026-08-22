/**
 * The example the documentation shows, kept honest by running it.
 *
 * Both `README.md` files and `SKILL.md` carried a `TestStore` example, and both
 * failed when anyone actually ran them. Twice, for different reasons:
 *
 * 1. The first version drove `createMockStreamingChat()`, which fakes a
 *    realistic reply — a 300ms lead-in then a word every 50ms — while `receive`
 *    times out after one second and `finish()` refuses to pass with any
 *    dispatched action unasserted.
 * 2. The replacement used a fake that called `onChunk`/`onComplete`
 *    *synchronously*. `TestStore.send` starts the effect before running its
 *    assertion, so the whole stream landed first and every line of that
 *    assertion was wrong: `isWaitingForResponse` was already `false`,
 *    `currentStreaming` already `null`, `messages` already 2.
 *
 * The shape below is what works: hand the callbacks out and call them when the
 * test is ready. `vi.useFakeTimers()` is required because `finish()` advances
 * virtual time, and it throws outright if the timer APIs are not mocked.
 *
 * The documents quote this file. If it stops passing, they are wrong again.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestStore } from '@composable-svelte/core/test';
import { streamingChatReducer } from '../src/lib/streaming-chat/reducer.js';
import { createInitialStreamingChatState } from '../src/lib/streaming-chat/types.js';
import type { StreamingChatDependencies } from '../src/lib/streaming-chat/types.js';

describe('StreamingChat', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('sends a message and receives the reply', async () => {
		let chunk!: (text: string) => void;
		let complete!: () => void;

		const store = new TestStore({
			initialState: createInitialStreamingChatState(),
			reducer: streamingChatReducer,
			dependencies: {
				// Hand the callbacks out rather than calling them here: the reply
				// has to arrive when the test says so, not inside `send`.
				streamMessage: (_message, onChunk, onComplete) => {
					chunk = onChunk;
					complete = onComplete;
				},
				generateId: () => 'm1',
				getTimestamp: () => 0
			} satisfies StreamingChatDependencies
		});

		await store.send({ type: 'sendMessage', message: 'Hello' }, (state) => {
			expect(state.messages).toHaveLength(1);
			expect(state.messages[0]!.content).toBe('Hello');
			expect(state.isWaitingForResponse).toBe(true);
			expect(state.currentStreaming).toEqual({ content: '' });
		});

		chunk('Hi');
		await store.receive({ type: 'chunkReceived', chunk: 'Hi' }, (state) => {
			expect(state.currentStreaming?.content).toBe('Hi');
			expect(state.isWaitingForResponse).toBe(false);
		});

		complete();
		await store.receive({ type: 'streamComplete' }, (state) => {
			expect(state.currentStreaming).toBeNull();
			expect(state.messages).toHaveLength(2); // User + assistant
		});

		await store.finish();
	});
});
