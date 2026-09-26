/**
 * Server rendering of every store-taking chat component, from a standalone
 * store, a live managed view and a retired one.
 *
 * Browser mode never runs the server build, where `$effect` and `onMount` do
 * not run but `onDestroy` does. A retired view reads `undefined`; a component
 * that dereferenced it on the server would throw here, not in a browser test.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { createStore } from '@composable-svelte/core';
import MinimalStreamingChat from '../../src/lib/streaming-chat/variants/MinimalStreamingChat.svelte';
import StandardStreamingChat from '../../src/lib/streaming-chat/variants/StandardStreamingChat.svelte';
import FullStreamingChat from '../../src/lib/streaming-chat/variants/FullStreamingChat.svelte';
import ChatMessageWithActions from '../../src/lib/streaming-chat/primitives/ChatMessageWithActions.svelte';
import ActionButtons from '../../src/lib/streaming-chat/primitives/ActionButtons.svelte';
import { streamingChatReducer } from '../../src/lib/streaming-chat/reducer.js';
import { createInitialStreamingChatState, type Message } from '../../src/lib/streaming-chat/types.js';
import { createWorkspace, fakeTransport } from '../fixtures/managed-chat.js';
import ManagedChat from '../recipes/ManagedChat.svelte';

const question: Message = { id: 'q', role: 'user', content: 'What is SSR?', timestamp: 0 };
const answer: Message = { id: 'a', role: 'assistant', content: 'Server-side rendering.', timestamp: 0 };
const conversation = { ...createInitialStreamingChatState(), messages: [question, answer] };

const variants = [
	['MinimalStreamingChat', MinimalStreamingChat],
	['StandardStreamingChat', StandardStreamingChat],
	['FullStreamingChat', FullStreamingChat]
] as const;

function sources() {
	const transport = fakeTransport();
	const standalone = createStore({
		initialState: conversation,
		reducer: streamingChatReducer,
		dependencies: transport.dependencies
	});
	const { store, bind } = createWorkspace(transport.dependencies, { left: conversation, right: conversation });
	const live = bind('left');
	const retired = bind('right');
	store.dispatch({ type: 'close', side: 'right' });
	return { transport, standalone, live, retired };
}

describe('server render', () => {
	it.each(variants)('%s renders a standalone store and a live view alike, and nothing for a retired one', (_, Variant) => {
		// `render`'s generic collapses to `never` on a union of component types.
		const Chat = Variant as typeof MinimalStreamingChat;
		const { transport, standalone, live, retired } = sources();

		const fromStore = render(Chat, { props: { store: standalone } }).body;
		const fromView = render(Chat, { props: { store: live } }).body;
		const fromRetired = render(Chat, { props: { store: retired } }).body;

		for (const body of [fromStore, fromView]) {
			expect(body).toContain('What is SSR?');
			expect(body).toContain('Server-side rendering.');
			expect(body).toContain('aria-label="Chat message input"');
		}
		expect(fromRetired).not.toContain('What is SSR?');
		expect(fromRetired).not.toContain('textarea');
		expect(transport.streams).toHaveLength(0);
	});

	it('message primitives render from a live view and nothing from a retired one', () => {
		const { live, retired } = sources();
		expect(render(ChatMessageWithActions, { props: { message: answer, store: live } }).body).toContain(
			'Server-side rendering.'
		);
		expect(render(ActionButtons, { props: { message: answer, store: live } }).body).toContain('Copy message');
		expect(render(ChatMessageWithActions, { props: { message: answer, store: retired } }).body).not.toContain(
			'Server-side rendering.'
		);
		expect(render(ActionButtons, { props: { message: answer, store: retired } }).body).not.toContain(
			'Copy message'
		);
	});

	it('FullStreamingChat revokes nothing on the server', () => {
		const revoke = vi.spyOn(URL, 'revokeObjectURL');
		const { live } = sources();
		render(FullStreamingChat, { props: { store: live } });
		expect(revoke).not.toHaveBeenCalled();
	});

	it('the README recipe renders its closed state without touching the transport', () => {
		const { dependencies, streams } = fakeTransport();
		const { body } = render(ManagedChat, { props: { dependencies } });
		expect(body).toContain('Open chat');
		expect(body).toContain('0 replies archived');
		expect(streams).toHaveLength(0);
	});
});
