/**
 * The attachment pipeline must actually run through the store.
 *
 * `StreamingChatState.pendingAttachments` and its three actions are covered
 * exhaustively by `streaming-chat-attachments.test.ts` — and the shipped UI used
 * none of it. `FullStreamingChat` kept its own component-local `$state` array,
 * so the store field was provably always `[]` and the `??` fallback in
 * `sendMessage` could never change an outcome.
 *
 * Tested reducer, untested wiring, which is exactly backwards: the half that was
 * verified was the half nothing called. So these tests mount the real component
 * and drive the real file input. That is the only shape that can catch it.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';
import { createStore } from '@composable-svelte/core';
import FullStreamingChat from '../src/lib/streaming-chat/variants/FullStreamingChat.svelte';
import { streamingChatReducer } from '../src/lib/streaming-chat/reducer.js';
import { createInitialStreamingChatState } from '../src/lib/streaming-chat/types.js';
import type {
	StreamingChatState,
	StreamingChatAction,
	StreamingChatDependencies
} from '../src/lib/streaming-chat/types.js';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mountChat(deps: Partial<StreamingChatDependencies> = {}) {
	const store = createStore<StreamingChatState, StreamingChatAction>({
		initialState: createInitialStreamingChatState(),
		reducer: streamingChatReducer,
		dependencies: {
			streamMessage: (_m, _c, onComplete) => {
				setTimeout(onComplete, 0);
			},
			...deps
		} as StreamingChatDependencies
	});
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(FullStreamingChat as never, { target, props: { store } });
	flushSync();
	cleanup.push(() => {
		unmount(component);
		target.remove();
		store.destroy?.();
	});
	return { store, target };
}

/** Drive the real `<input type="file">` the way a browser does. */
async function attach(target: HTMLElement, files: File[]) {
	const input = target.querySelector('input[type="file"]') as HTMLInputElement;
	expect(input, 'no file input rendered').not.toBeNull();

	const dt = new DataTransfer();
	files.forEach((f) => dt.items.add(f));
	input.files = dt.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));

	// `createAttachmentFromFile` is async (it extracts metadata), so the dispatch
	// lands a macrotask later.
	for (let i = 0; i < 10; i += 1) {
		flushSync();
		await tick();
		await new Promise((r) => setTimeout(r, 5));
	}
	flushSync();
}

const textFile = (name = 'note.txt') =>
	new File(['hello'], name, { type: 'text/plain' });

describe('picking a file', () => {
	it('puts the attachment in the store, not in a component local', async () => {
		const { store, target } = mountChat();

		await attach(target, [textFile()]);

		expect(
			store.state.pendingAttachments,
			'the shipped UI bypassed the store entirely'
		).toHaveLength(1);
		expect(store.state.pendingAttachments[0]!.filename).toBe('note.txt');
	});

	it('appends rather than replacing', async () => {
		const { store, target } = mountChat();

		await attach(target, [textFile('one.txt')]);
		await attach(target, [textFile('two.txt')]);

		expect(store.state.pendingAttachments.map((a) => a.filename)).toEqual([
			'one.txt',
			'two.txt'
		]);
	});

	it('renders what the store holds', async () => {
		const { target } = mountChat();
		await attach(target, [textFile('shown.txt')]);

		expect(target.textContent).toContain('shown.txt');
	});
});

describe('sending', () => {
	it('takes the attachments from the store and clears them', async () => {
		const { store, target } = mountChat();
		await attach(target, [textFile('sent.txt')]);

		const form = target.querySelector('form');
		expect(form, 'no form rendered').not.toBeNull();
		form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		flushSync();
		await tick();

		expect(store.state.messages).toHaveLength(1);
		expect(store.state.messages[0]!.attachments).toHaveLength(1);
		expect(store.state.pendingAttachments, 'pending list survived the send').toHaveLength(0);
	});
});
