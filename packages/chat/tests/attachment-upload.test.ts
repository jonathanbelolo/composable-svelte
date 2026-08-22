/**
 * `uploadFile` had no call site, and attachments never reached the transport.
 *
 * Two dead ends on one path. A consumer supplied `uploadFile` and got silence —
 * every attachment kept the blob URL created at pick time, which does not
 * survive a reload and means nothing to anyone else. And `deps.streamMessage`
 * was called with the message text only, so the backend and the model never saw
 * the file at all: the whole feature terminated at the message bubble.
 *
 * Uploading happens on send rather than on attach, so nothing is uploaded for a
 * file the user then removes. A failed upload keeps its blob URL and the message
 * still goes out — degrading rather than blocking.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { streamingChatReducer } from '../src/lib/streaming-chat/reducer.js';
import { createInitialStreamingChatState } from '../src/lib/streaming-chat/types.js';
import type {
	StreamingChatState,
	StreamingChatAction,
	StreamingChatDependencies,
	MessageAttachment
} from '../src/lib/streaming-chat/types.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

const attachment = (id = 'a1'): MessageAttachment => ({
	id,
	type: 'image',
	filename: `${id}.png`,
	// Not a blob: URL — the reducer recovers a File by fetching it, and jsdom's
	// fetch cannot reach a blob: URL created in another realm. A data: URL is the
	// same shape for our purposes and is fetchable.
	url: 'data:image/png;base64,iVBORw0KGgo=',
	size: 10,
	mimeType: 'image/png'
});

function makeStore(deps: Partial<StreamingChatDependencies> = {}) {
	const streamed: Array<{ message: string; attachments?: MessageAttachment[] }> = [];
	const store = createStore<StreamingChatState, StreamingChatAction>({
		initialState: createInitialStreamingChatState(),
		reducer: streamingChatReducer,
		dependencies: {
			streamMessage: (message, _onChunk, onComplete, _onError, attachments) => {
				streamed.push({ message, ...(attachments && { attachments }) });
				setTimeout(onComplete, 0);
			},
			generateId: () => 'm1',
			getTimestamp: () => 0,
			...deps
		} as StreamingChatDependencies
	});
	cleanup.push(() => store.destroy?.());
	return { store, streamed };
}

async function sendWithAttachment(deps: Partial<StreamingChatDependencies>, id = 'a1') {
	const made = makeStore(deps);
	made.store.dispatch({ type: 'addAttachment', attachment: attachment(id) });
	made.store.dispatch({ type: 'sendMessage', message: 'look at this' });
	await wait(60);
	return made;
}

describe('uploading on send', () => {
	it('calls uploadFile once per attachment and uses the returned URL', async () => {
		const calls: string[] = [];
		const { store } = await sendWithAttachment({
			uploadFile: async (file) => {
				calls.push(file.name);
				return 'https://cdn.example.com/a1.png';
			}
		});

		expect(calls, 'uploadFile was supplied and not called').toHaveLength(1);
		const sent = store.state.messages[0]!.attachments![0]!;
		expect(sent.url, 'the uploaded URL never replaced the local one').toBe(
			'https://cdn.example.com/a1.png'
		);
		expect(sent.uploadStatus).toBe('success');
	});

	it('marks an attachment uploading, so progress has somewhere to land', () => {
		// `_internal_attachmentUploadProgress` only writes to an attachment already
		// in `'uploading'`, and nothing ever put one there — so every value a
		// consumer's `onProgress` produced was dispatched, clamped and discarded.
		// Read synchronously: the mark must be on the message the moment it is
		// appended, not after the upload resolves.
		const { store } = makeStore({ uploadFile: () => new Promise<string>(() => {}) });
		store.dispatch({ type: 'addAttachment', attachment: attachment() });
		store.dispatch({ type: 'sendMessage', message: 'look at this' });

		const sent = store.state.messages[0]!.attachments![0]!;
		expect(sent.uploadStatus).toBe('uploading');
		expect(sent.uploadProgress).toBe(0);
	});

	it('does not mark an attachment that will not be uploaded', () => {
		// No `uploadFile`, so nothing uploads and a status would be a lie. Same
		// for an already-remote URL, which `uploadThenStream` skips.
		const { store } = makeStore();
		store.dispatch({ type: 'addAttachment', attachment: attachment() });
		store.dispatch({ type: 'sendMessage', message: 'look at this' });

		expect(store.state.messages[0]!.attachments![0]!.uploadStatus).toBeUndefined();
	});

	it('reports progress into the state, clamped', async () => {
		let report: ((loaded: number, total: number) => void) | undefined;
		let finish: ((url: string) => void) | undefined;

		const { store } = makeStore({
			uploadFile: (_file, onProgress) =>
				new Promise<string>((resolve) => {
					report = onProgress;
					finish = resolve;
				})
		});
		store.dispatch({ type: 'addAttachment', attachment: attachment() });
		store.dispatch({ type: 'sendMessage', message: 'look at this' });
		await wait(20);

		const progress = () => store.state.messages[0]!.attachments![0]!.uploadProgress;

		report!(5, 10);
		expect(progress(), 'the reported value never reached the state').toBe(50);

		report!(30, 10); // over 100 — must clamp
		expect(progress()).toBe(100);

		finish!('https://cdn.example.com/a1.png');
		await wait(20);
		expect(store.state.messages[0]!.attachments![0]!.uploadStatus).toBe('success');
	});

	it('keeps the local URL and marks the failure, and still sends', async () => {
		const { store, streamed } = await sendWithAttachment({
			uploadFile: async () => {
				throw new Error('quota exceeded');
			}
		});

		const sent = store.state.messages[0]!.attachments![0]!;
		expect(sent.url, 'a failed upload destroyed the local URL').toBe(attachment().url);
		expect(sent.uploadStatus).toBe('error');
		expect(sent.uploadError).toContain('quota exceeded');
		expect(streamed, 'a failed upload blocked the send').toHaveLength(1);
	});

	it('sends without uploading when no uploadFile is supplied', async () => {
		const { store, streamed } = await sendWithAttachment({});

		expect(streamed).toHaveLength(1);
		expect(store.state.messages[0]!.attachments![0]!.url).toBe(attachment().url);
	});
});

describe('reaching the transport', () => {
	it('hands the attachments to streamMessage', async () => {
		const { streamed } = await sendWithAttachment({
			uploadFile: async () => 'https://cdn.example.com/a1.png'
		});

		expect(streamed[0]!.attachments, 'the model never saw the file').toHaveLength(1);
		expect(streamed[0]!.attachments![0]!.url).toBe('https://cdn.example.com/a1.png');
	});

	it('passes no attachments field when there are none', async () => {
		const { store, streamed } = makeStore({});
		store.dispatch({ type: 'sendMessage', message: 'just text' });
		await wait(30);

		expect(streamed[0]!.attachments).toBeUndefined();
	});
});
