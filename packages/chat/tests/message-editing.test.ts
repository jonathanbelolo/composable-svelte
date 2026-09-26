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
import { type EffectType, createStore } from '@composable-svelte/core';
import { streamingChatReducer } from '../src/lib/streaming-chat/reducer.js';
import { createInitialStreamingChatState } from '../src/lib/streaming-chat/types.js';
import type {
	Message,
	StreamingChatState,
	StreamingChatAction,
	StreamingChatDependencies
} from '../src/lib/streaming-chat/types.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitForAction = (store: ReturnType<typeof makeStore>['store'], type: string) =>
	new Promise<void>((resolve) => {
		const unsub = store.subscribeToActions!((action) => {
			if (action.type === type) {
				unsub();
				resolve();
			}
		});
	});

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function makeStore(deps: Partial<StreamingChatDependencies> = {}) {
	const streamed: string[] = [];
	const uploadTasks: Promise<void>[] = [];
	const observeUploads = (effect: EffectType<StreamingChatAction>): EffectType<StreamingChatAction> => {
		if (effect._tag === 'Batch') return { ...effect, effects: effect.effects.map(observeUploads) };
		if (effect._tag !== 'Cancellable' || effect.cancelOnly || !effect.id.startsWith('streaming-chat/upload/')) return effect;
		return { ...effect, execute: (dispatch, signal) => {
			const task = Promise.resolve(effect.execute(dispatch, signal));
			uploadTasks.push(task);
			return task;
		} };
	};
	let ids = 0;
	const store = createStore<StreamingChatState, StreamingChatAction>({
		initialState: createInitialStreamingChatState(),
		reducer: (state, action, dependencies) => {
			const [next, effect] = streamingChatReducer(state, action, dependencies);
			return [next, observeUploads(effect)];
		},
		ssr: { deferEffects: false },
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
	const dispatched: StreamingChatAction[] = [];
	store.subscribeToActions!(action => dispatched.push(action));
	cleanup.push(() => store.destroy?.());
	return { store, streamed, dispatched, drainUploads: () => Promise.all(uploadTasks) };
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
		const { store, streamed, dispatched, drainUploads } = makeStore();
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
		let releaseFirst!: (url: string) => void;
		let releaseSecond!: (url: string) => void;
		let firstStarted!: () => void;
		const firstReady = new Promise<void>((r) => { firstStarted = r; });
		let secondStarted!: () => void;
		const secondReady = new Promise<void>((r) => { secondStarted = r; });
		let call = 0;
		const { store, streamed, dispatched, drainUploads } = makeStore({
			uploadFile: () => {
				call++;
				if (call === 1) {
					firstStarted();
					return new Promise<string>((r) => { releaseFirst = r; });
				}
				secondStarted();
				return new Promise<string>((r) => { releaseSecond = r; });
			}
		});
		store.dispatch({ type: 'addAttachment', attachment: withAttachment()[0]!.attachments![0]! });
		store.dispatch({ type: 'sendMessage', message: 'look' });
		await firstReady;

		store.dispatch({ type: 'startEditingMessage', messageId: store.state.messages[0]!.id });
		store.dispatch({ type: 'updateEditingContent', content: 'edited' });
		store.dispatch({ type: 'submitEditedMessage' });
		await secondReady;

		const completePromise = waitForAction(store, 'streamComplete');
		releaseFirst('https://cdn.example.com/a.png');
		releaseSecond('https://cdn.example.com/a.png');
		await completePromise;

		expect(streamed, 'the superseded upload streamed the pre-edit text').toEqual(['edited']);
	});

	it('cancels an upload whose message the edit removed', async () => {
		let release!: (url: string) => void;
		let started!: () => void;
		const ready = new Promise<void>((r) => { started = r; });
		const { store, streamed, dispatched, drainUploads } = makeStore({
			uploadFile: () => {
				started();
				return new Promise<string>((r) => { release = r; });
			}
		});
		store.dispatch({ type: 'restoreMessages', messages: conversation });

		store.dispatch({ type: 'addAttachment', attachment: withAttachment()[0]!.attachments![0]! });
		store.dispatch({ type: 'sendMessage', message: 'look' });
		await ready;

		const completePromise = waitForAction(store, 'streamComplete');
		store.dispatch({ type: 'startEditingMessage', messageId: 'u1' });
		store.dispatch({ type: 'updateEditingContent', content: 'edited' });
		store.dispatch({ type: 'submitEditedMessage' });
		await completePromise;

		release('https://cdn.example.com/a.png');
		await drainUploads();

		expect(streamed, 'a removed message still got a reply').toEqual(['edited']);
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
		let started!: () => void;
		const ready = new Promise<void>((r) => { started = r; });
		const promise = new Promise<string>((resolve) => (release = resolve));
		return {
			promise,
			ready,
			started,
			release: () => release('https://cdn.example.com/a.png')
		};
	};

	it('settles both uploads but only streams the latest send', async () => {
		const first = pending();
		const second = pending();
		let call = 0;
		const { store, streamed, dispatched, drainUploads } = makeStore({
			uploadFile: () => {
				const current = call++ === 0 ? first : second;
				current.started();
				return current.promise;
			}
		});

		store.dispatch({ type: 'addAttachment', attachment: attach('a1') });
		store.dispatch({ type: 'sendMessage', message: 'first' });
		await first.ready;
		store.dispatch({ type: 'addAttachment', attachment: attach('a2') });
		store.dispatch({ type: 'sendMessage', message: 'second' });
		await second.ready;

		const completePromise = waitForAction(store, 'streamComplete');
		first.release();
		second.release();
		await completePromise;

		expect(streamed, 'superseded upload must not replace the current reply').toEqual(['second']);
		expect(store.state.messages[0]!.attachments![0]!.uploadStatus).toBe('success');
	});

	it('settles an older upload without replacing the plain send reply', async () => {
		const upload = pending();
		const { store, streamed, dispatched, drainUploads } = makeStore({
			uploadFile: () => {
				upload.started();
				return upload.promise;
			}
		});

		store.dispatch({ type: 'addAttachment', attachment: attach('a1') });
		store.dispatch({ type: 'sendMessage', message: 'with file' });
		await upload.ready;
		const completePromise = waitForAction(store, 'streamComplete');
		store.dispatch({ type: 'sendMessage', message: 'plain' });
		await completePromise;

		upload.release();
		await drainUploads();

		expect(streamed, 'superseded upload must not replace the plain reply').toEqual(['plain']);
		expect(store.state.messages[0]!.attachments![0]!.uploadStatus).toBe('success');
	});

	it('cancels the upload of a message that is deleted', async () => {
		// The upload outlives the message, and its resolution streams a reply —
		// into a conversation that no longer contains the question.
		const upload = pending();
		const { store, streamed, dispatched, drainUploads } = makeStore({
			uploadFile: () => {
				upload.started();
				return upload.promise;
			}
		});

		store.dispatch({ type: 'addAttachment', attachment: attach('a1') });
		store.dispatch({ type: 'sendMessage', message: 'doomed' });
		await upload.ready;

		store.dispatch({ type: 'deleteMessage', messageId: store.state.messages[0]!.id });
		upload.release();
		await drainUploads();

		expect(dispatched.filter(action => action.type === '_internal_attachmentsResolved')).toEqual([]);
		expect(streamed, 'a deleted message still got a reply').toEqual([]);
		expect(store.state.messages).toEqual([]);
	});

	it('cancels uploads when the conversation is cleared', async () => {
		const upload = pending();
		const { store, streamed, dispatched, drainUploads } = makeStore({
			uploadFile: () => {
				upload.started();
				return upload.promise;
			}
		});

		store.dispatch({ type: 'addAttachment', attachment: attach('a1') });
		store.dispatch({ type: 'sendMessage', message: 'doomed' });
		await upload.ready;

		store.dispatch({ type: 'clearMessages' });
		upload.release();
		await drainUploads();

		expect(dispatched.filter(action => action.type === '_internal_attachmentsResolved')).toEqual([]);
		expect(streamed).toEqual([]);
	});

	it('cancels uploads when an older session is restored over them', async () => {
		const upload = pending();
		const { store, streamed, dispatched, drainUploads } = makeStore({
			uploadFile: () => {
				upload.started();
				return upload.promise;
			}
		});

		store.dispatch({ type: 'addAttachment', attachment: attach('a1') });
		store.dispatch({ type: 'sendMessage', message: 'doomed' });
		await upload.ready;

		store.dispatch({ type: 'restoreMessages', messages: conversation });
		upload.release();
		await drainUploads();

		expect(dispatched.filter(action => action.type === '_internal_attachmentsResolved')).toEqual([]);
		expect(streamed).toEqual([]);
	});
});

describe('regenerateMessage', () => {
	it('replaces the reply without repeating the question', async () => {
		const { store, streamed, dispatched, drainUploads } = makeStore();
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
		const { store, streamed, dispatched, drainUploads } = makeStore();
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
		expect(dispatched.filter(action => action.type === '_internal_attachmentsResolved')).toEqual([]);
		expect(streamed).toEqual([]);
	});
});
