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

function makeStore(deps: Partial<StreamingChatDependencies> = {}) {
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
			getTimestamp: () => 0,
			...deps
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

describe('editing a message with attachments', () => {
	// Editing was the one action that could resend a message and silently keep a
	// URL only the sender can open: the first draft of the duplication fix went
	// straight to `streamNow`, skipping uploads entirely, so a failed upload had
	// no path to a second attempt.

	const withAttachment = (uploadStatus?: 'error'): Message[] => [
		{
			id: 'u1',
			role: 'user',
			content: 'first question',
			timestamp: 0,
			attachments: [
				{
					id: 'a1',
					type: 'image',
					filename: 'a.png',
					url: 'data:image/png;base64,iVBORw0KGgo=',
					size: 10,
					mimeType: 'image/png',
					...(uploadStatus && { uploadStatus })
				}
			]
		},
		{ id: 'a1m', role: 'assistant', content: 'first answer', timestamp: 1 }
	];

	it('retries an upload that failed the first time', async () => {
		const uploads: string[] = [];
		const { store } = makeStore({
			uploadFile: async (file) => {
				uploads.push(file.name);
				return 'https://cdn.example.com/a.png';
			}
		});
		store.dispatch({ type: 'restoreMessages', messages: withAttachment('error') });

		store.dispatch({ type: 'startEditingMessage', messageId: 'u1' });
		store.dispatch({ type: 'updateEditingContent', content: 'better question' });
		store.dispatch({ type: 'submitEditedMessage' });
		await wait(40);

		expect(uploads, 'the failed upload was never retried').toEqual(['a.png']);
		expect(store.state.messages[0]!.attachments![0]!.url).toBe('https://cdn.example.com/a.png');
	});

	it('does not let a superseded upload start a second stream', async () => {
		// Edit while the first upload is still in flight. The resolution used to
		// land afterwards and stream again — carrying the *pre-edit* text.
		let release: (url: string) => void = () => {};
		const { store, streamed } = makeStore({
			uploadFile: () => new Promise<string>((resolve) => (release = resolve))
		});
		store.dispatch({ type: 'addAttachment', attachment: withAttachment()[0]!.attachments![0]! });
		store.dispatch({ type: 'sendMessage', message: 'look' });
		await wait(20);

		store.dispatch({ type: 'startEditingMessage', messageId: store.state.messages[0]!.id });
		store.dispatch({ type: 'updateEditingContent', content: 'edited' });
		store.dispatch({ type: 'submitEditedMessage' });
		await wait(20);

		release('https://cdn.example.com/a.png');
		await wait(40);

		expect(streamed, 'the superseded upload streamed the pre-edit text').not.toContain('look');
	});

	it('cancels an upload whose message the edit removed', async () => {
		// Edit an *earlier* message while a later one's upload is still going.
		// `submitEditedMessage` truncates everything after the edited message, so
		// the uploading message is gone — but its resolution still landed and
		// streamed the text of a message that is no longer in the conversation.
		//
		// This is the path the explicit `Effect.cancel` covers. When the edited
		// message has its own upload, `Effect.cancellable` supersedes by id on its
		// own; when it does not, nothing would stop the old one.
		let release: (url: string) => void = () => {};
		const { store, streamed } = makeStore({
			uploadFile: () => new Promise<string>((resolve) => (release = resolve))
		});
		store.dispatch({ type: 'restoreMessages', messages: conversation });

		store.dispatch({ type: 'addAttachment', attachment: withAttachment()[0]!.attachments![0]! });
		store.dispatch({ type: 'sendMessage', message: 'look' });
		await wait(20);

		store.dispatch({ type: 'startEditingMessage', messageId: 'u1' });
		store.dispatch({ type: 'updateEditingContent', content: 'edited' });
		store.dispatch({ type: 'submitEditedMessage' });
		await wait(20);

		release('https://cdn.example.com/a.png');
		await wait(40);

		expect(streamed, 'a removed message still got a reply').not.toContain('look');
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
		// The first version of this used the *first* user message, so deleting the
		// role guard still bailed — at the "no preceding user message" check, one
		// branch later. This one has a user message before it, so only the role
		// guard can stop it.
		const { store, streamed } = makeStore();
		store.dispatch({
			type: 'restoreMessages',
			messages: [
				...conversation,
				{ id: 'u2', role: 'user', content: 'second question', timestamp: 2 }
			]
		});

		store.dispatch({ type: 'regenerateMessage', messageId: 'u2' });
		await wait(20);

		expect(contents(store)).toEqual([
			'user:first question',
			'assistant:first answer',
			'user:second question'
		]);
		expect(streamed).toEqual([]);
	});
});
