/**
 * Which message is new, and why the component cannot know.
 *
 * The `slideIn` keyframes on the two message renderers were one-shot CSS
 * lifecycle animations, which the policy prohibits. Converting them ran into
 * invariant 7 — "on first run, place, do not animate" — which does *not*
 * transplant onto a keyed list item: `{#each … (message.id)}` gives each message
 * component exactly one run, so a per-instance first-run guard suppresses every
 * animation forever.
 *
 * Newness is a property of the list's diff, and nothing recorded it.
 * `sendMessage` and `streamComplete` append; `restoreMessages` replaces; all
 * three produce structurally identical state. So a session restoring fifty
 * messages was indistinguishable from fifty messages arriving, and the CSS
 * animated all fifty.
 *
 * `lastAppendedId` records it in the one place that knows.
 *
 * The deliberate asymmetry: only `sendMessage` sets it. A completed assistant
 * reply was already on screen as the streaming placeholder — animating it in
 * would re-animate text the user has been reading, in place. Today's CSS fires
 * slideIn twice per reply for exactly that reason.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import ChatMessage from '../src/lib/streaming-chat/primitives/ChatMessage.svelte';
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

let idCounter = 0;
function makeStore() {
	idCounter = 0;
	const store = createStore<StreamingChatState, StreamingChatAction>({
		initialState: createInitialStreamingChatState(),
		reducer: streamingChatReducer,
		// Typed against the real interface rather than cast through `as never`, so a
		// signature change here is a compile error rather than a silent drift.
		dependencies: {
			streamMessage: (
				_message: string,
				onChunk: (chunk: string) => void,
				onComplete: () => void
			) => {
				onChunk('hello');
				setTimeout(onComplete, 0);
			},
			generateId: () => `id-${++idCounter}`,
			getTimestamp: () => 0
		} satisfies StreamingChatDependencies
	});
	cleanup.push(() => store.destroy?.());
	return store;
}

const restored: Message[] = Array.from({ length: 5 }, (_, i) => ({
	id: `old-${i}`,
	role: 'user' as const,
	content: `old ${i}`,
	timestamp: 0
}));

describe('lastAppendedId', () => {
	it('is null before anything happens', () => {
		expect(makeStore().state.lastAppendedId).toBeNull();
	});

	it('names the message the user just sent', () => {
		const store = makeStore();
		store.dispatch({ type: 'sendMessage', message: 'hi' });

		expect(store.state.lastAppendedId).toBe(store.state.messages[0]!.id);
	});

	it('is cleared by a restore, so nothing restored counts as new', () => {
		// The whole point. Fifty restored messages must be placed, not animated.
		const store = makeStore();
		store.dispatch({ type: 'sendMessage', message: 'hi' });
		expect(store.state.lastAppendedId).not.toBeNull();

		store.dispatch({ type: 'restoreMessages', messages: restored });

		expect(store.state.lastAppendedId, 'a restore left a message marked new').toBeNull();
		expect(store.state.messages).toHaveLength(5);
	});

	it('does not mark a completed assistant reply', async () => {
		// It was already on screen as the streaming placeholder; animating it in
		// would re-animate text the user has been reading, in place.
		const store = makeStore();
		store.dispatch({ type: 'sendMessage', message: 'hi' });
		const userMessageId = store.state.lastAppendedId;

		await wait(30);

		expect(store.state.messages.length, 'the reply never landed').toBe(2);
		expect(
			store.state.lastAppendedId,
			'the assistant reply was marked new and would animate over itself'
		).toBe(userMessageId);
	});
});

describe('the entry animation reaches the DOM', () => {
	function render(props: Record<string, unknown>) {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(ChatMessage as never, { target, props });
		flushSync();
		cleanup.push(() => {
			unmount(component);
			target.remove();
		});
		return target.querySelector('.chat-message') as HTMLElement;
	}

	const message: Message = { id: 'm1', role: 'user', content: 'hi', timestamp: 0 };

	it('animates a message the list marks as new', async () => {
		const el = render({ message, animateIn: true });
		await wait(20);

		// Mid-flight: Motion One writes inline styles, so this is observable.
		const opacity = parseFloat(getComputedStyle(el).opacity);
		expect(opacity, `opacity was ${opacity}`).toBeLessThan(1);
		expect(opacity).toBeGreaterThan(0);
	});

	it('places a message that is not new — the restore case', async () => {
		// A paired discriminator with the test above. Fifty restored messages must
		// appear instantly; asserting only "eventually 1" would pass either way.
		const el = render({ message, animateIn: false });
		await wait(20);

		expect(parseFloat(getComputedStyle(el).opacity), 'a restored message animated').toBe(1);
	});

	it('settles fully visible', async () => {
		const el = render({ message, animateIn: true });
		await wait(600);

		expect(parseFloat(getComputedStyle(el).opacity)).toBeCloseTo(1, 1);
	});

});
