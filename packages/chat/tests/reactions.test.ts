/**
 * Reactions could only ever go up.
 *
 * `removeReaction` had a complete 47-line reducer case and **no dispatcher
 * anywhere**. `ChatMessageWithActions` carried two byte-identical handlers that
 * both dispatched `addReaction`, and the one wired to the reaction chips was
 * commented "toggle or add/remove" while doing neither. Clicking your own
 * reaction incremented it again; clicking it ten times gave a count of ten from
 * one person.
 *
 * A real toggle needs to know whether *you* already reacted, and `MessageReaction`
 * recorded only an aggregate count. The fix is one bit, not a list of user ids:
 * shipping `reactedBy: string[]` would mean a popular message sends thousands of
 * ids to render "👍 12", and windowing that list means carrying a separate count
 * anyway. `count` stays the cheap aggregate a server can supply; `reactedByMe`
 * answers the only question the toggle asks.
 *
 * That also means no user identity is needed anywhere — the flag *is* the
 * answer, so nothing compares ids.
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

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

const message: Message = { id: 'm1', role: 'assistant', content: 'hi', timestamp: 0 };

function makeStore(messages: Message[] = [message]) {
	const store = createStore<StreamingChatState, StreamingChatAction>({
		initialState: { ...createInitialStreamingChatState(), messages },
		reducer: streamingChatReducer,
		dependencies: { streamMessage: () => {} } satisfies StreamingChatDependencies
	});
	cleanup.push(() => store.destroy?.());
	return store;
}

const reactions = (s: StreamingChatState, id = 'm1') =>
	s.messages.find((m) => m.id === id)?.reactions;

describe('adding a reaction', () => {
	it('records that it was mine', () => {
		const store = makeStore();
		store.dispatch({ type: 'addReaction', messageId: 'm1', emoji: '👍' });

		expect(reactions(store.state)).toEqual([{ emoji: '👍', count: 1, reactedByMe: true }]);
	});

	it('is idempotent — reacting twice does not count twice', () => {
		// The defect, precisely. Ten clicks used to give a count of ten.
		const store = makeStore();
		store.dispatch({ type: 'addReaction', messageId: 'm1', emoji: '👍' });
		store.dispatch({ type: 'addReaction', messageId: 'm1', emoji: '👍' });
		store.dispatch({ type: 'addReaction', messageId: 'm1', emoji: '👍' });

		expect(reactions(store.state)![0]!.count, 'one person counted three times').toBe(1);
	});

	it('adds to a count that arrived from elsewhere without claiming it', () => {
		// A server-supplied aggregate: eleven other people reacted, I have not.
		const store = makeStore([
			{ ...message, reactions: [{ emoji: '👍', count: 11 }] }
		]);
		store.dispatch({ type: 'addReaction', messageId: 'm1', emoji: '👍' });

		expect(reactions(store.state)).toEqual([{ emoji: '👍', count: 12, reactedByMe: true }]);
	});
});

describe('removing a reaction', () => {
	it('decrements and clears the flag', () => {
		const store = makeStore([
			{ ...message, reactions: [{ emoji: '👍', count: 12, reactedByMe: true }] }
		]);
		store.dispatch({ type: 'removeReaction', messageId: 'm1', emoji: '👍' });

		expect(reactions(store.state)).toEqual([{ emoji: '👍', count: 11, reactedByMe: false }]);
	});

	it('does nothing when the reaction was not mine', () => {
		const store = makeStore([
			{ ...message, reactions: [{ emoji: '👍', count: 3 }] }
		]);
		store.dispatch({ type: 'removeReaction', messageId: 'm1', emoji: '👍' });

		expect(reactions(store.state)![0]!.count, 'removed someone else’s reaction').toBe(3);
	});

	it('drops the emoji entirely at zero, and the key with it', () => {
		// Deliberate existing behaviour worth preserving: a de-reacted message ends
		// up structurally identical to one that was never reacted to, so a restore
		// cannot tell them apart.
		const store = makeStore([
			{ ...message, reactions: [{ emoji: '👍', count: 1, reactedByMe: true }] }
		]);
		store.dispatch({ type: 'removeReaction', messageId: 'm1', emoji: '👍' });

		const m = store.state.messages[0]!;
		expect(reactions(store.state)).toBeUndefined();
		expect('reactions' in m, 'the empty reactions key was left behind').toBe(false);
	});

	it('tolerates a restored reaction with no flag at all', () => {
		// `restoreMessages` assigns whatever the caller persisted, so `reactedByMe`
		// arrives undefined for data written before it existed.
		const store = makeStore();
		store.dispatch({
			type: 'restoreMessages',
			messages: [{ ...message, reactions: [{ emoji: '🎉', count: 4 }] }]
		});
		store.dispatch({ type: 'removeReaction', messageId: 'm1', emoji: '🎉' });

		expect(reactions(store.state)![0]!.count).toBe(4);
	});
});
