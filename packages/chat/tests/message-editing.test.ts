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

const attach = (id: string) => ({
	id,
	type: 'image' as const,
	filename: `${id}.png`,
	url: 'data:image/png;base64,iVBORw0KGgo=',
	size: 10,
	mimeType: 'image/png'
});

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

	it('reports progress for the retried upload', async () => {
		// `sendMessage` marks its attachments `'uploading'` before appending, and
		// `_internal_attachmentUploadProgress` writes only to an attachment already
		// in that state. The edit and regenerate paths carry their attachments
		// through unchanged, so every progress report on a retry was dispatched,
		// clamped and discarded — the identical defect the comment in `sendMessage`
		// describes as fixed, fixed in one arm of three.
		let report!: (percent: number) => void;
		const { store } = makeStore({
			uploadFile: (_file, onProgress) =>
				new Promise<string>((resolve) => {
					// The public dependency reports bytes, not a percentage.
					report = (percent) => onProgress?.(percent, 100);
					setTimeout(() => resolve('https://cdn.example.com/a.png'), 50);
				})
		});
		store.dispatch({ type: 'restoreMessages', messages: withAttachment('error') });

		store.dispatch({ type: 'startEditingMessage', messageId: 'u1' });
		store.dispatch({ type: 'updateEditingContent', content: 'better question' });
		store.dispatch({ type: 'submitEditedMessage' });
		await wait(10);

		report(42);
		await wait(10);

		expect(
			store.state.messages[0]!.attachments![0]!.uploadProgress,
			'the retry reported progress and the reducer threw it away'
		).toBe(42);
	});

	it('reports progress for an upload retried by regenerate', async () => {
		// The third of the three paths through `streamFor`. Found by mutation:
		// removing the marking from `regenerateMessage` left the whole suite green,
		// so the fix on that path was riding on the edit path's test.
		let report!: (percent: number) => void;
		const { store } = makeStore({
			uploadFile: (_file, onProgress) =>
				new Promise<string>((resolve) => {
					report = (percent) => onProgress?.(percent, 100);
					setTimeout(() => resolve('https://cdn.example.com/a.png'), 50);
				})
		});
		store.dispatch({ type: 'restoreMessages', messages: withAttachment('error') });

		store.dispatch({ type: 'regenerateMessage', messageId: 'a1m' });
		await wait(10);

		report(63);
		await wait(10);

		expect(
			store.state.messages[0]!.attachments![0]!.uploadProgress,
			'regenerate reported progress and the reducer threw it away'
		).toBe(63);
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

describe('one upload per message', () => {
	// The cancellation id used to be a single constant for the whole store, which
	// made the upload a singleton. Measured with two sends: the first message
	// never streamed, never got a reply, and kept an attachment frozen at
	// `uploadStatus: 'uploading'` — which renders a progress bar that can never
	// move. Any attachment-free send did the same to an upload in flight.

	const pending = () => {
		let release!: (url: string) => void;
		const promise = new Promise<string>((resolve) => (release = resolve));
		return { promise, release: () => release('https://cdn.example.com/a.png') };
	};

	it('does not let a second send destroy the first send’s upload', async () => {
		const first = pending();
		const second = pending();
		let call = 0;
		const { store, streamed } = makeStore({
			uploadFile: () => (call++ === 0 ? first.promise : second.promise)
		});

		store.dispatch({ type: 'addAttachment', attachment: attach('a1') });
		store.dispatch({ type: 'sendMessage', message: 'first' });
		await wait(20);
		store.dispatch({ type: 'addAttachment', attachment: attach('a2') });
		store.dispatch({ type: 'sendMessage', message: 'second' });
		await wait(20);

		first.release();
		second.release();
		await wait(40);

		expect(streamed, 'the first message never got a reply').toContain('first');
		expect(store.state.messages[0]!.attachments![0]!.uploadStatus).toBe('success');
	});

	it('does not let a plain send destroy an unrelated upload', async () => {
		const upload = pending();
		const { store, streamed } = makeStore({ uploadFile: () => upload.promise });

		store.dispatch({ type: 'addAttachment', attachment: attach('a1') });
		store.dispatch({ type: 'sendMessage', message: 'with file' });
		await wait(20);
		store.dispatch({ type: 'sendMessage', message: 'plain' });
		await wait(20);

		upload.release();
		await wait(40);

		expect(streamed).toContain('with file');
		expect(store.state.messages[0]!.attachments![0]!.uploadStatus).toBe('success');
	});

	it('cancels the upload of a message that is deleted', async () => {
		// The upload outlives the message, and its resolution streams a reply —
		// into a conversation that no longer contains the question.
		const upload = pending();
		const { store, streamed } = makeStore({ uploadFile: () => upload.promise });

		store.dispatch({ type: 'addAttachment', attachment: attach('a1') });
		store.dispatch({ type: 'sendMessage', message: 'doomed' });
		await wait(20);

		store.dispatch({ type: 'deleteMessage', messageId: store.state.messages[0]!.id });
		upload.release();
		await wait(40);

		expect(streamed, 'a deleted message still got a reply').toEqual([]);
		expect(store.state.messages).toEqual([]);
	});

	it('cancels uploads when the conversation is cleared', async () => {
		const upload = pending();
		const { store, streamed } = makeStore({ uploadFile: () => upload.promise });

		store.dispatch({ type: 'addAttachment', attachment: attach('a1') });
		store.dispatch({ type: 'sendMessage', message: 'doomed' });
		await wait(20);

		store.dispatch({ type: 'clearMessages' });
		upload.release();
		await wait(40);

		expect(streamed).toEqual([]);
	});

	it('cancels uploads when an older session is restored over them', async () => {
		const upload = pending();
		const { store, streamed } = makeStore({ uploadFile: () => upload.promise });

		store.dispatch({ type: 'addAttachment', attachment: attach('a1') });
		store.dispatch({ type: 'sendMessage', message: 'doomed' });
		await wait(20);

		store.dispatch({ type: 'restoreMessages', messages: conversation });
		upload.release();
		await wait(40);

		expect(streamed).toEqual([]);
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
