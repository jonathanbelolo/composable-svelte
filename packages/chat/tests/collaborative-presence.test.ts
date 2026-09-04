/**
 * The collaborative presence components, which no test had ever rendered.
 *
 * The README advertises "Real-time presence, typing indicators, and live
 * cursors". `CursorOverlay` and `PresenceList` are reached through the tested
 * collaborative surface; `TypingIndicator`, `TypingUsersList` and
 * `ActionButtons` were not reached by anything.
 *
 * The interesting property in a typing indicator is the one that is easy to get
 * subtly wrong and impossible to notice: the *sentence*. "Alice is typing" and
 * "Alice and Bob are typing" and "3 people are typing" are three different
 * grammatical shapes, and `TypingIndicator` used to carry its own copy of that
 * logic separately from the exported `formatTypingIndicator` — the two had
 * already drifted on punctuation once, which is recorded in the component.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount } from 'svelte';
import TypingIndicator from '../src/lib/streaming-chat/collaborative-primitives/TypingIndicator.svelte';
import TypingUsersList from '../src/lib/streaming-chat/collaborative-primitives/TypingUsersList.svelte';
import ActionButtons from '../src/lib/streaming-chat/primitives/ActionButtons.svelte';
import { createStore } from '@composable-svelte/core';
import { streamingChatReducer } from '../src/lib/streaming-chat/reducer.js';
import { createInitialStreamingChatState } from '../src/lib/streaming-chat/types.js';
import { formatTypingIndicator } from '../src/lib/streaming-chat/collaborative-hooks.js';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function renderIn(component: unknown, props: Record<string, unknown>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(component as never, { target, props: props as never });
	cleanup.push(() => {
		unmount(instance);
		target.remove();
	});
	return target;
}

const user = (name: string, id = name.toLowerCase()) => ({
	id,
	name,
	color: '#336699'
});

describe('TypingIndicator', () => {
	it('renders nothing when nobody is typing', async () => {
		// The empty case is the one that runs most of the time, and an indicator
		// that renders an empty bubble permanently is worse than none.
		const target = renderIn(TypingIndicator, { users: [] });
		expect(target.querySelector('.typing-indicator')).toBeNull();
	});

	it('renders when somebody is', async () => {
		// Non-vacuity for the arm above.
		const target = renderIn(TypingIndicator, { users: [user('Alice')] });
		expect(target.querySelector('.typing-indicator')).not.toBeNull();
	});

	it('names one person', async () => {
		const target = renderIn(TypingIndicator, { users: [user('Alice')] });
		expect(target.textContent).toContain('Alice');
	});

	it('names two', async () => {
		const target = renderIn(TypingIndicator, { users: [user('Alice'), user('Bob')] });
		expect(target.textContent).toContain('Alice');
		expect(target.textContent).toContain('Bob');
	});

	it('says the same thing as the exported formatter', async () => {
		// The property that keeps the component and `formatTypingIndicator` from
		// drifting again. A consumer building their own indicator uses the
		// formatter, and the two must not describe the same state differently.
		for (const users of [
			[user('Alice')],
			[user('Alice'), user('Bob')],
			[user('Alice'), user('Bob'), user('Carol')]
		]) {
			const target = renderIn(TypingIndicator, { users });
			const text = target.querySelector('.typing-text')!.textContent!.trim();
			expect(text).toBe(formatTypingIndicator(users).trim());
		}
	});

	it('distinguishes one person from several', async () => {
		// Non-vacuity for the agreement arm: a formatter returning a constant
		// would satisfy it.
		const one = renderIn(TypingIndicator, { users: [user('Alice')] }).textContent;
		const three = renderIn(TypingIndicator, {
			users: [user('Alice'), user('Bob'), user('Carol')]
		}).textContent;
		expect(one).not.toBe(three);
	});

	it('forwards the caller’s class', async () => {
		const target = renderIn(TypingIndicator, { users: [user('Alice')], class: 'mine' });
		expect(target.querySelector('.typing-indicator')!.className).toContain('mine');
	});
});

describe('TypingUsersList', () => {
	it('renders nothing for nobody', async () => {
		const target = renderIn(TypingUsersList, { users: [] });
		expect(target.textContent!.trim()).toBe('');
	});

	it('lists the people typing', async () => {
		const target = renderIn(TypingUsersList, { users: [user('Alice'), user('Bob')] });
		expect(target.textContent).toContain('Alice');
		expect(target.textContent).toContain('Bob');
	});

	it('renders a compact form that differs from the full one', async () => {
		// `compact` is a documented prop; a prop that changes nothing is the
		// defect this campaign has found repeatedly.
		const full = renderIn(TypingUsersList, { users: [user('Alice')], compact: false });
		const compact = renderIn(TypingUsersList, { users: [user('Alice')], compact: true });
		expect(full.innerHTML).not.toBe(compact.innerHTML);
	});

	it('shows avatars only when asked', async () => {
		const without = renderIn(TypingUsersList, {
			users: [{ ...user('Alice'), avatar: 'https://example.test/a.png' }],
			showAvatars: false
		});
		const with_ = renderIn(TypingUsersList, {
			users: [{ ...user('Alice'), avatar: 'https://example.test/a.png' }],
			showAvatars: true
		});
		expect(with_.innerHTML).not.toBe(without.innerHTML);
	});

	it('accepts undefined for its optional props', async () => {
		const target = renderIn(TypingUsersList, {
			users: [user('Alice')],
			showAvatars: undefined,
			compact: undefined,
			class: undefined
		});
		expect(target.textContent).toContain('Alice');
	});
});

describe('ActionButtons', () => {
	// A per-message toolbar whose buttons dispatch into the chat store. Nothing
	// had rendered it, so nothing checked that the buttons a given message
	// actually gets are the right ones — the user/assistant split is the part
	// that would look correct while being backwards.
	const message = (role: 'user' | 'assistant', id = 'm1') => ({
		id,
		role,
		content: 'hello',
		timestamp: Date.now()
	});

	/**
	 * A real store, not a `{ dispatch }` stand-in.
	 *
	 * The regenerate button reads `$store.isWaitingForResponse`, so the component
	 * auto-subscribes and a bare object fails Svelte's store contract with
	 * `store_invalid_shape`. Dispatches are recorded by wrapping the real
	 * `dispatch`, which keeps the state machine live underneath.
	 */
	const chatStore = (state: Record<string, unknown> = {}) => {
		const dispatched: Array<{ type: string; messageId?: string }> = [];
		const store = createStore({
			initialState: { ...createInitialStreamingChatState(), ...state } as never,
			reducer: streamingChatReducer as never,
			dependencies: {} as never
		});
		const realDispatch = store.dispatch.bind(store);
		const wrapped = new Proxy(store, {
			get: (target, prop) =>
				prop === 'dispatch'
					? (a: { type: string; messageId?: string }) => {
							dispatched.push(a);
							realDispatch(a as never);
						}
					: Reflect.get(target, prop)
		});
		return { dispatched, store: wrapped };
	};

	it('offers a copy action for any message', async () => {
		const { store } = chatStore();
		const target = renderIn(ActionButtons, { message: message('user'), store });
		expect(target.querySelector('[aria-label="Copy message"]')).not.toBeNull();
	});

	it('copies the message it was given, not some other one', async () => {
		const { store, dispatched } = chatStore();
		const target = renderIn(ActionButtons, { message: message('user', 'the-right-id'), store });

		(target.querySelector('[aria-label="Copy message"]') as HTMLButtonElement).click();

		expect(dispatched).toEqual([{ type: 'copyMessage', messageId: 'the-right-id' }]);
	});

	it('lets a user edit their own message', async () => {
		const { store, dispatched } = chatStore();
		const target = renderIn(ActionButtons, { message: message('user'), store });

		const edit = target.querySelector('[aria-label="Edit message"]') as HTMLButtonElement | null;
		expect(edit, 'a user message offered no edit action').not.toBeNull();
		edit!.click();

		expect(dispatched).toContainEqual({ type: 'startEditingMessage', messageId: 'm1' });
	});

	it('offers regenerate on an assistant message instead of edit', async () => {
		// The split that would look right while being backwards: editing the
		// model's reply and regenerating your own are both nonsense.
		const { store, dispatched } = chatStore();
		const target = renderIn(ActionButtons, { message: message('assistant'), store });

		expect(target.querySelector('[aria-label="Edit message"]')).toBeNull();
		const regenerate = target.querySelector(
			'[aria-label="Regenerate response"]'
		) as HTMLButtonElement | null;
		expect(regenerate, 'an assistant message offered no regenerate action').not.toBeNull();

		regenerate!.click();
		expect(dispatched).toContainEqual({ type: 'regenerateMessage', messageId: 'm1' });
	});

	it('does not offer regenerate on a user message', async () => {
		const { store } = chatStore();
		const target = renderIn(ActionButtons, { message: message('user'), store });
		expect(target.querySelector('[aria-label="Regenerate response"]')).toBeNull();
	});

	it('gives every button an accessible name', async () => {
		// Icon-only buttons: without a label they are unusable without sight, and
		// there is no text to fall back on.
		const { store } = chatStore();
		const target = renderIn(ActionButtons, { message: message('assistant'), store });

		const buttons = [...target.querySelectorAll('button')];
		expect(buttons.length).toBeGreaterThan(0);
		for (const button of buttons) {
			expect(button.getAttribute('aria-label')?.trim(), button.outerHTML.slice(0, 60)).toBeTruthy();
		}
	});
});

describe('ActionButtons while a response is streaming', () => {
	it('will not let you regenerate mid-response', async () => {
		// `disabled={$store.isWaitingForResponse}` is the reason this component
		// needs a real store at all, and the reason it auto-subscribes. Asking for
		// a regeneration while one is already streaming is the case it guards.
		const store = createStore({
			initialState: {
				...createInitialStreamingChatState(),
				isWaitingForResponse: true
			} as never,
			reducer: streamingChatReducer as never,
			dependencies: {} as never
		});

		const target = document.createElement('div');
		document.body.appendChild(target);
		const instance = mount(ActionButtons as never, {
			target,
			props: {
				message: { id: 'm1', role: 'assistant', content: 'hi', timestamp: 0 },
				store
			} as never
		});
		cleanup.push(() => {
			unmount(instance);
			target.remove();
		});

		const regenerate = target.querySelector(
			'[aria-label="Regenerate response"]'
		) as HTMLButtonElement;
		expect(regenerate).not.toBeNull();
		expect(regenerate.disabled).toBe(true);
	});
});
