/**
 * Editing a message, and regenerating a reply, each left a duplicate behind.
 *
 * Both cases rebuilt the message list *keeping* the user's message and then
 * dispatched `sendMessage` to start the stream — and `sendMessage` appends a
 * user message unconditionally. So the conversation ended up with the same text
 * twice, one from the rebuild and one from the re-send.
 *
 * Neither action had a single test anywhere in the repo, which is why a defect
 * this visible survived: it is the whole observable outcome of both features.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { streamingChatReducer } from '../src/lib/streaming-chat/reducer.js';
import { createInitialStreamingChatState } from '../src/lib/streaming-chat/types.js';
import type {
	Message,
	StreamingChatState,
	StreamingChatAction,
	StreamingChatDependencies
} from '../src/lib/streaming-chat/types.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function makeStore() {
	const streamed: string[] = [];
	let ids = 0;
	const store = createStore<StreamingChatState, StreamingChatAction>({
		initialState: createInitialStreamingChatState(),
		reducer: streamingChatReducer,
		dependencies: {
			streamMessage: (message, onChunk, onComplete) => {
				streamed.push(message);
				onChunk('reply');
				setTimeout(onComplete, 0);
			},
			generateId: () => `gen${(ids += 1)}`,
			getTimestamp: () => 0
		} as StreamingChatDependencies
	});
	cleanup.push(() => store.destroy?.());
	return { store, streamed };
}

const conversation: Message[] = [
	{ id: 'u1', role: 'user', content: 'first question', timestamp: 0 },
	{ id: 'a1', role: 'assistant', content: 'first answer', timestamp: 1 }
];

const contents = (store: { state: StreamingChatState }) =>
	store.state.messages.map((m) => `${m.role}:${m.content}`);

describe('submitEditedMessage', () => {
	it('replaces the message rather than adding a second copy of it', async () => {
		const { store, streamed } = makeStore();
		store.dispatch({ type: 'restoreMessages', messages: conversation });

		store.dispatch({ type: 'startEditingMessage', messageId: 'u1' });
		store.dispatch({ type: 'updateEditingContent', content: 'better question' });
		store.dispatch({ type: 'submitEditedMessage' });
		await wait(20);

		expect(contents(store)).toEqual(['user:better question', 'assistant:reply']);
		expect(streamed, 'the edited text never reached the transport').toEqual([
			'better question'
		]);
	});

	it('drops everything that followed the edited message', async () => {
		const { store } = makeStore();
		store.dispatch({
			type: 'restoreMessages',
			messages: [
				...conversation,
				{ id: 'u2', role: 'user', content: 'second question', timestamp: 2 }
			]
		});

		store.dispatch({ type: 'startEditingMessage', messageId: 'u1' });
		store.dispatch({ type: 'updateEditingContent', content: 'better question' });
		store.dispatch({ type: 'submitEditedMessage' });
		await wait(20);

		expect(contents(store)).toEqual(['user:better question', 'assistant:reply']);
	});
});

describe('regenerateMessage', () => {
	it('replaces the reply without repeating the question', async () => {
		const { store, streamed } = makeStore();
		store.dispatch({ type: 'restoreMessages', messages: conversation });

		store.dispatch({ type: 'regenerateMessage', messageId: 'a1' });
		await wait(20);

		expect(contents(store)).toEqual(['user:first question', 'assistant:reply']);
		expect(streamed).toEqual(['first question']);
	});

	it('ignores a request to regenerate a user message', async () => {
		const { store, streamed } = makeStore();
		store.dispatch({ type: 'restoreMessages', messages: conversation });

		store.dispatch({ type: 'regenerateMessage', messageId: 'u1' });
		await wait(20);

		expect(contents(store)).toEqual(['user:first question', 'assistant:first answer']);
		expect(streamed).toEqual([]);
	});
});
