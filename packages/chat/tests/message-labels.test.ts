/**
 * Labels a consumer passes, and a sender name the message carries.
 *
 * `StandardStreamingChat` and `MinimalStreamingChat` declared no `userLabel` or
 * `assistantLabel` at all and forwarded nothing — while the README told
 * consumers to write `<StandardStreamingChat {store} userLabel="You"
 * assistantLabel="AI" />`. Svelte 5 discards an undeclared prop silently, so it
 * looked accepted and did nothing.
 *
 * `Message.senderName` — documented as "overrides userLabel/assistantLabel in
 * display" — was honoured by one renderer of three. `SimpleChatMessage`
 * hardcoded 'You' / 'Assistant', and the edit header in
 * `ChatMessageWithActions` used the generic label, so a message from "Alice"
 * became "You (editing)" the moment Edit was pressed and reverted on save.
 *
 * These are the first tests of any of it.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import StandardStreamingChat from '../src/lib/streaming-chat/variants/StandardStreamingChat.svelte';
import MinimalStreamingChat from '../src/lib/streaming-chat/variants/MinimalStreamingChat.svelte';
import SimpleChatMessage from '../src/lib/streaming-chat/primitives/SimpleChatMessage.svelte';
import ChatMessage from '../src/lib/streaming-chat/primitives/ChatMessage.svelte';
import { streamingChatReducer } from '../src/lib/streaming-chat/reducer.js';
import { createInitialStreamingChatState } from '../src/lib/streaming-chat/types.js';
import type {
	Message,
	StreamingChatState,
	StreamingChatAction
} from '../src/lib/streaming-chat/types.js';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function render(Component: unknown, props: Record<string, unknown>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(Component as never, { target, props });
	flushSync();
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	return target;
}

const message = (over: Partial<Message> = {}): Message => ({
	id: 'm1',
	role: 'assistant',
	content: 'hi',
	timestamp: 0,
	...over
});

function storeWith(messages: Message[]) {
	return createStore<StreamingChatState, StreamingChatAction>({
		initialState: { ...createInitialStreamingChatState(), messages },
		reducer: streamingChatReducer,
		dependencies: { streamMessage: () => {} } as never
	});
}

describe('label props on the variants', () => {
	it('StandardStreamingChat forwards them', () => {
		const target = render(StandardStreamingChat, {
			store: storeWith([message()]),
			assistantLabel: 'AI'
		});
		expect(target.textContent, 'the label the README documents did nothing').toContain('AI');
	});

	it('MinimalStreamingChat forwards them', () => {
		const target = render(MinimalStreamingChat, {
			store: storeWith([message()]),
			assistantLabel: 'Bot'
		});
		expect(target.textContent).toContain('Bot');
	});
});

describe('senderName', () => {
	it('overrides the label in SimpleChatMessage', () => {
		const target = render(SimpleChatMessage, {
			message: message({ senderName: 'Alice' }),
			assistantLabel: 'Assistant'
		});
		expect(target.textContent, 'senderName was ignored').toContain('Alice');
		expect(target.querySelector('.chat-message__role')!.textContent).not.toContain('Assistant');
	});

	it('is honoured identically by ChatMessage — the one that already worked', () => {
		const target = render(ChatMessage, { message: message({ senderName: 'Alice' }) });
		expect(target.textContent).toContain('Alice');
	});

	it('falls back to the label when absent', () => {
		const target = render(SimpleChatMessage, {
			message: message(),
			assistantLabel: 'Bot'
		});
		expect(target.textContent).toContain('Bot');
	});

	it('treats an empty sender name as a name, not as absent', () => {
		// `??` not `||`, matching the renderer that already worked. The distinction
		// is the difference between honouring a deliberate blank and silently
		// substituting a generic label.
		const target = render(SimpleChatMessage, {
			message: message({ senderName: '' }),
			assistantLabel: 'Bot'
		});
		expect(target.querySelector('.chat-message__role')!.textContent!.trim()).toBe('');
	});
});
