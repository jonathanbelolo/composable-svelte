/**
 * Chat components and effects under managed composition, against the
 * standalone behaviour they must keep.
 *
 * - A variant renders from a `ChildView` exactly as from a `Store`, and its
 *   dispatches reach the owner the view captured, never a sibling.
 * - Retirement (removal, same-slot replacement) empties the component, aborts
 *   the owner's transport and uploads, drops late callbacks, and revokes the
 *   composer's blob URLs without a read of a store that has gone.
 * - Business results are the parent reducer's: it sees each reduced child
 *   action once, after the child.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, type Component } from 'svelte';
import { createStore } from '@composable-svelte/core';
import MinimalStreamingChat from '../src/lib/streaming-chat/variants/MinimalStreamingChat.svelte';
import StandardStreamingChat from '../src/lib/streaming-chat/variants/StandardStreamingChat.svelte';
import FullStreamingChat from '../src/lib/streaming-chat/variants/FullStreamingChat.svelte';
import ActionButtons from '../src/lib/streaming-chat/primitives/ActionButtons.svelte';
import ChatMessageWithActions from '../src/lib/streaming-chat/primitives/ChatMessageWithActions.svelte';
import { streamingChatReducer } from '../src/lib/streaming-chat/reducer.js';
import {
	createInitialStreamingChatState,
	type Message,
	type StreamingChatAction
} from '../src/lib/streaming-chat/types.js';
import { blobAttachment, createWorkspace, fakeTransport, type WorkspaceAction } from './fixtures/managed-chat.js';
import { propsBox } from './props-box.svelte';

const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
	vi.restoreAllMocks();
});

function render<P extends Record<string, unknown>>(component: Component<P>, props: P) {
	const target = document.createElement('div');
	document.body.append(target);
	const instance = mount(component, { target, props });
	flushSync();
	let mounted = true;
	const dispose = () => {
		if (!mounted) return;
		mounted = false;
		void unmount(instance);
		flushSync();
		target.remove();
	};
	cleanups.push(dispose);
	return { target, dispose };
}

function workspace(initial: Parameters<typeof createWorkspace>[1] = {}) {
	const transport = fakeTransport();
	const { store, bind } = createWorkspace(transport.dependencies, initial);
	const log: WorkspaceAction[] = [];
	const stop = store.subscribeToActions!((action) => log.push(action));
	cleanups.push(() => {
		stop();
		store.destroy();
	});
	return { ...transport, store, bind, log };
}

function standalone() {
	const transport = fakeTransport();
	const store = createStore({
		initialState: createInitialStreamingChatState(),
		reducer: streamingChatReducer,
		dependencies: transport.dependencies
	});
	cleanups.push(() => store.destroy());
	return { ...transport, store };
}

function type(target: HTMLElement, text: string) {
	const input = target.querySelector('textarea') as HTMLTextAreaElement;
	input.value = text;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
	return input;
}

function send(target: HTMLElement, text: string) {
	type(target, text);
	(target.querySelector('[aria-label="Send message"]') as HTMLButtonElement).click();
	flushSync();
}

/** Child actions the parent reduced for one side, unwrapped, in order. */
function childActions(log: WorkspaceAction[], side: 'left' | 'right'): StreamingChatAction[] {
	return log.flatMap((action) =>
		action.type === side && action.action.type === 'presented' ? [action.action.action] : []
	);
}

const variants = [
	['MinimalStreamingChat', MinimalStreamingChat, '.minimal-streaming-chat'],
	['StandardStreamingChat', StandardStreamingChat, '.standard-streaming-chat'],
	['FullStreamingChat', FullStreamingChat, '.full-streaming-chat']
] as const;

describe.each(variants)('%s', (_name, Variant, root) => {
	const Chat = Variant as unknown as Component<{ store: unknown }>;

	it('streams a reply through a standalone Store', () => {
		const { store, streams } = standalone();
		const { target } = render(Chat, { store });

		send(target, 'hello');
		expect(streams.map((s) => s.message)).toEqual(['hello']);
		streams[0]!.chunk('Hi there');
		flushSync();
		expect(target.textContent).toContain('Hi there');
		streams[0]!.complete();
		flushSync();
		expect(store.state.messages.map((m) => m.content)).toEqual(['hello', 'Hi there']);
	});

	it('streams a reply through a managed view, and the parent sees it once', () => {
		const { bind, streams, store, log } = workspace();
		const { target } = render(Chat, { store: bind('left') });

		send(target, 'hello');
		expect(streams.map((s) => s.message)).toEqual(['hello']);
		streams[0]!.chunk('Hi there');
		flushSync();
		expect(target.querySelector(root)?.textContent).toContain('Hi there');
		streams[0]!.complete();
		flushSync();

		expect(store.state.left?.messages.map((m) => m.content)).toEqual(['hello', 'Hi there']);
		expect(store.state.sent).toEqual([{ side: 'left', message: 'hello' }]);
		expect(store.state.archive).toEqual([{ side: 'left', messageId: store.state.left!.messages[1]!.id, content: 'Hi there' }]);
		expect(childActions(log, 'right')).toEqual([]);
	});

	it('renders nothing once its owner retires, and aborts the stream once', () => {
		const errors = vi.spyOn(console, 'error');
		const { bind, streams, store, log } = workspace();
		const { target, dispose } = render(Chat, { store: bind('left') });
		send(target, 'hello');
		streams[0]!.chunk('partial');
		flushSync();

		store.dispatch({ type: 'close', side: 'left' });
		flushSync();

		expect(target.querySelector(root)).toBeNull();
		expect(streams[0]!.abort).toHaveBeenCalledTimes(1);

		const before = log.length;
		streams[0]!.chunk('late');
		streams[0]!.complete();
		flushSync();
		expect(log).toHaveLength(before);
		expect(store.state.archive).toEqual([]);

		dispose();
		expect(errors).not.toHaveBeenCalled();
	});
});

describe('owner isolation', () => {
	it('sibling chats share effect ids without sharing streams', () => {
		const { bind, streams, store, log } = workspace();
		const left = render(FullStreamingChat, { store: bind('left') });
		const right = render(FullStreamingChat, { store: bind('right') });

		send(left.target, 'from left');
		send(right.target, 'from right');
		expect(streams.map((s) => s.message)).toEqual(['from left', 'from right']);

		// Both registered `streaming-chat/stream`; stopping one must not cancel the other.
		(left.target.querySelector('[aria-label="Stop generation"]') as HTMLButtonElement).click();
		flushSync();
		expect(streams[0]!.abort).toHaveBeenCalledTimes(1);
		expect(streams[1]!.abort).not.toHaveBeenCalled();

		streams[1]!.chunk('right reply');
		streams[1]!.complete();
		flushSync();
		expect(store.state.right?.messages.at(-1)?.content).toBe('right reply');
		expect(store.state.left?.messages.map((m) => m.content)).toEqual(['from left']);
		expect(store.state.archive).toEqual([{ side: 'right', messageId: store.state.right!.messages.at(-1)!.id, content: 'right reply' }]);
		expect(childActions(log, 'left').map((a) => a.type)).toEqual(['sendMessage', 'stopGeneration']);
	});

	it('a replaced owner starts again at the same stream id without hearing its predecessor', () => {
		const { bind, streams, store } = workspace();
		const first = bind('left');
		first.dispatch({ type: 'sendMessage', message: 'first' });
		expect(store.state.left?.activeStreamId).toBe('1');

		store.dispatch({ type: 'restart', side: 'left' });
		expect(streams[0]!.abort).toHaveBeenCalledTimes(1);
		expect(first.state).toBeUndefined();

		const second = bind('left');
		expect(second).not.toBe(first);
		second.dispatch({ type: 'sendMessage', message: 'second' });
		// Same generation, same id: correlation alone cannot tell these apart.
		expect(store.state.left?.activeStreamId).toBe('1');

		streams[0]!.chunk('stale');
		streams[0]!.complete();
		streams[1]!.chunk('fresh');
		streams[1]!.complete();

		expect(store.state.left?.messages.map((m) => m.content)).toEqual(['second', 'fresh']);
		expect(store.state.archive).toEqual([{ side: 'left', messageId: store.state.left!.messages[1]!.id, content: 'fresh' }]);
		// A dispatch through the retired view is dropped, not delivered to the new owner.
		first.dispatch({ type: 'sendMessage', message: 'through the old view' });
		expect(streams).toHaveLength(2);
		expect(store.state.left?.messages).toHaveLength(2);
	});

	it.each(variants)('an unkeyed %s whose store changes does not carry the draft across', (_name, Variant) => {
		const { bind, streams, store } = workspace();
		const props = propsBox({ store: bind('left') });
		const { target } = render(Variant as unknown as Component<typeof props>, props);

		type(target, 'meant for left');
		props.store = bind('right');
		flushSync();

		const input = target.querySelector('textarea') as HTMLTextAreaElement;
		expect(input.value).toBe('');
		expect((target.querySelector('[aria-label="Send message"]') as HTMLButtonElement).disabled).toBe(true);
		send(target, 'meant for right');
		expect(streams.map((s) => s.message)).toEqual(['meant for right']);
		expect(store.state.sent).toEqual([{ side: 'right', message: 'meant for right' }]);
	});
});

describe('attachments and uploads', () => {
	function pick(target: HTMLElement, name: string) {
		const input = target.querySelector('input[type="file"]') as HTMLInputElement;
		const transfer = new DataTransfer();
		transfer.items.add(new File(['x'], name, { type: 'text/plain' }));
		input.files = transfer.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}

	it('files picked before the store changes land in the store they were picked in', async () => {
		const { bind, store } = workspace();
		const props = propsBox({ store: bind('left') });
		const { target } = render(FullStreamingChat as unknown as Component<typeof props>, props);

		pick(target, 'notes.txt');
		props.store = bind('right');
		flushSync();

		await vi.waitFor(() => expect(store.state.left?.pendingAttachments).toHaveLength(1));
		expect(store.state.left?.pendingAttachments[0]?.filename).toBe('notes.txt');
		expect(store.state.right?.pendingAttachments).toEqual([]);
	});

	it('files still being read when their owner retires are released, not added', async () => {
		const revoke = vi.spyOn(URL, 'revokeObjectURL');
		const create = vi.spyOn(URL, 'createObjectURL');
		const { bind, store, log } = workspace();
		const { target } = render(FullStreamingChat, { store: bind('left') });

		pick(target, 'late.txt');
		store.dispatch({ type: 'close', side: 'left' });
		flushSync();

		await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
		const url = create.mock.results[0]!.value as string;
		await vi.waitFor(() => expect(revoke.mock.calls.map(([u]) => u)).toContain(url));
		expect(childActions(log, 'left')).toEqual([]);
	});

	it('destroying the root aborts every owner\'s stream', () => {
		const { bind, streams, store } = workspace();
		bind('left').dispatch({ type: 'sendMessage', message: 'left' });
		bind('right').dispatch({ type: 'sendMessage', message: 'right' });
		store.destroy();
		expect(streams.map((s) => s.abort.mock.calls.length)).toEqual([1, 1]);
	});

	it('retirement revokes the composer blob URLs once, without reading the retired store', () => {
		const attachment = blobAttachment('a1');
		const revoke = vi.spyOn(URL, 'revokeObjectURL');
		const { bind, store } = workspace({
			left: { ...createInitialStreamingChatState(), pendingAttachments: [attachment] }
		});
		const { target, dispose } = render(FullStreamingChat, { store: bind('left') });
		expect(target.querySelectorAll('.full-streaming-chat__attachments-preview > *')).toHaveLength(1);

		store.dispatch({ type: 'close', side: 'left' });
		flushSync();
		expect(revoke.mock.calls.map(([url]) => url)).toEqual([attachment.url]);

		dispose();
		expect(revoke).toHaveBeenCalledTimes(1);
	});

	function twoComposers() {
		const left = blobAttachment('left-file');
		const right = blobAttachment('right-file');
		const revoke = vi.spyOn(URL, 'revokeObjectURL');
		const space = workspace({
			left: { ...createInitialStreamingChatState(), pendingAttachments: [left] },
			right: { ...createInitialStreamingChatState(), pendingAttachments: [right] }
		});
		const props = propsBox({ store: space.bind('left') });
		const rendered = render(FullStreamingChat as unknown as Component<typeof props>, props);
		const revoked = () => revoke.mock.calls.map(([url]) => url);
		return { ...space, ...rendered, props, left, right, revoked };
	}

	it.each([
		['the previous owner retires first', ['left', 'right']],
		['the current owner retires first', ['right', 'left']]
	] as const)(
		'a live-to-live store change revokes nothing; each owner revokes its own URLs when it retires (%s)',
		(_order, sides) => {
			const { store, bind, target, props, left, right, revoked, dispose } = twoComposers();
			props.store = bind('right');
			flushSync();
			expect(target.querySelector('.full-streaming-chat__attachments-preview')).not.toBeNull();
			expect(revoked()).toEqual([]);

			const urls = { left: left.url, right: right.url };
			store.dispatch({ type: 'close', side: sides[0] });
			flushSync();
			expect(revoked()).toEqual([urls[sides[0]]]);
			store.dispatch({ type: 'close', side: sides[1] });
			flushSync();
			expect(revoked()).toEqual([urls[sides[0]], urls[sides[1]]]);

			dispose();
			expect(revoked()).toHaveLength(2);
		}
	);

	it('a change to an already-retired view leaves the live conversation\'s URLs alone', () => {
		const { store, bind, target, props, left, right, revoked } = twoComposers();
		const retired = bind('right');
		store.dispatch({ type: 'close', side: 'right' });
		flushSync();
		expect(revoked()).toEqual([]);

		props.store = retired;
		flushSync();
		expect(target.querySelector('.full-streaming-chat')).toBeNull();
		expect(revoked()).toEqual([]);

		store.dispatch({ type: 'close', side: 'left' });
		flushSync();
		expect(revoked()).toEqual([left.url]);
		expect(revoked()).not.toContain(right.url);
	});

	it('unmount revokes every conversation it still holds, once, and a later retirement adds nothing', () => {
		const { store, bind, props, left, right, revoked, dispose } = twoComposers();
		props.store = bind('right');
		flushSync();

		dispose();
		expect(revoked().sort()).toEqual([left.url, right.url].sort());
		store.dispatch({ type: 'close', side: 'left' });
		store.dispatch({ type: 'close', side: 'right' });
		expect(revoked()).toHaveLength(2);
	});

	it('an upload in flight when its owner retires never starts a reply', async () => {
		const { bind, streams, uploads, store, log } = workspace({
			left: { ...createInitialStreamingChatState(), pendingAttachments: [blobAttachment('a1')] }
		});
		bind('left').dispatch({ type: 'sendMessage', message: 'with a file' });
		await vi.waitFor(() => expect(uploads).toHaveLength(1));

		store.dispatch({ type: 'close', side: 'left' });
		uploads[0]!.pending.resolve('https://cdn.test/a1');
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(streams).toHaveLength(0);
		expect(childActions(log, 'left').map((a) => a.type)).toEqual(['sendMessage']);
	});

	it('uploads for two messages of one owner run concurrently; only the latest replies', async () => {
		const { bind, streams, uploads, store } = workspace();
		const left = bind('left');
		const right = bind('right');

		left.dispatch({ type: 'addAttachment', attachment: blobAttachment('a1') });
		left.dispatch({ type: 'sendMessage', message: 'first' });
		left.dispatch({ type: 'addAttachment', attachment: blobAttachment('a2') });
		left.dispatch({ type: 'sendMessage', message: 'second' });
		right.dispatch({ type: 'addAttachment', attachment: blobAttachment('b1') });
		right.dispatch({ type: 'sendMessage', message: 'other side' });
		await vi.waitFor(() => expect(uploads).toHaveLength(3));

		// The first message's reply was superseded; the parent is told which one.
		expect(store.state.superseded).toEqual([{ side: 'left', streamId: '1', messageId: 'm1' }]);

		uploads[0]!.pending.resolve('https://cdn.test/a1');
		await vi.waitFor(() =>
			expect(store.state.left?.messages[0]?.attachments?.[0]?.uploadStatus).toBe('success')
		);
		expect(streams).toHaveLength(0);

		uploads[1]!.pending.resolve('https://cdn.test/a2');
		await vi.waitFor(() => expect(streams).toHaveLength(1));
		expect(streams[0]!.message).toBe('second');
		expect(streams[0]!.attachments?.[0]?.url).toBe('https://cdn.test/a2');

		uploads[2]!.pending.resolve('https://cdn.test/b1');
		await vi.waitFor(() => expect(streams).toHaveLength(2));
		expect(streams[1]!.message).toBe('other side');
		expect(store.state.right?.isWaitingForResponse).toBe(true);
	});
});

describe('business handoff to the parent reducer', () => {
	const seeded: Message = {
		id: 'reply',
		role: 'assistant',
		content: 'An answer',
		timestamp: 0,
		reactions: [{ emoji: '👍', count: 1, reactedByMe: true }]
	};

	it('copy and reactions are reduced by the child and handed to the parent once', async () => {
		const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
		const { bind, store } = workspace({
			left: { ...createInitialStreamingChatState(), messages: [seeded] }
		});
		const { target } = render(FullStreamingChat, { store: bind('left') });

		(target.querySelector('.message-reaction') as HTMLButtonElement).click();
		flushSync();
		expect(store.state.reactions).toEqual([{ side: 'left', messageId: 'reply', emoji: '👍', on: false }]);
		expect(store.state.left?.messages[0]?.reactions ?? []).toEqual([]);

		(target.querySelector('[aria-label="Message actions"]') as HTMLButtonElement).click();
		flushSync();
		const copy = [...target.querySelectorAll('.context-menu__item')].find((b) => b.textContent?.includes('Copy'));
		(copy as HTMLButtonElement).click();
		await vi.waitFor(() => expect(store.state.copies).toEqual([{ side: 'left', outcome: 'copied' }]));
		expect(writeText).toHaveBeenCalledWith('An answer');
	});

	it('an idle streamComplete is not a completion; a genuine repeat reply still is', () => {
		const { bind, streams, store } = workspace();
		const view = bind('left');
		view.dispatch({ type: 'sendMessage', message: 'hello' });
		streams[0]!.chunk('Hi');
		streams[0]!.complete();
		const messages = store.state.left!.messages;
		const first = { side: 'left', messageId: messages[1]!.id, content: 'Hi' };
		expect(store.state.archive).toEqual([first]);

		// Public actions the chat ignores (no reply in flight, finished stream id)
		// still reach the parent. They must not archive the reply again.
		view.dispatch({ type: 'streamComplete' });
		view.dispatch({ type: 'streamComplete', streamId: '1' });
		expect(store.state.left!.messages).toBe(messages);
		expect(store.state.archive).toEqual([first]);

		// A regenerated reply with the same text is a new message and is archived.
		view.dispatch({ type: 'regenerateMessage', messageId: messages[1]!.id });
		streams[1]!.chunk('Hi');
		streams[1]!.complete();
		expect(store.state.archive).toEqual([first, { side: 'left', messageId: store.state.left!.messages[1]!.id, content: 'Hi' }]);
		expect(store.state.archive[1]!.messageId).not.toBe(first.messageId);
	});

	it('message primitives render nothing for a retired owner', () => {
		const { bind, store } = workspace({
			left: { ...createInitialStreamingChatState(), messages: [seeded] }
		});
		const view = bind('left');
		const buttons = render(ActionButtons, { message: seeded, store: view });
		const withActions = render(ChatMessageWithActions, { message: seeded, store: view });
		expect(buttons.target.querySelector('.action-buttons')).not.toBeNull();
		expect(withActions.target.textContent).toContain('An answer');

		store.dispatch({ type: 'close', side: 'left' });
		flushSync();
		expect(buttons.target.querySelector('.action-buttons')).toBeNull();
		expect(withActions.target.textContent?.trim()).toBe('');
	});
});
