/**
 * One picker at a time, and it survives its own message disappearing.
 *
 * Every message owned a `showReactionPicker` boolean **and rendered its own
 * `position: fixed; inset: 0` backdrop**. Opening a second picker stacked two
 * full-viewport backdrops: only the last-painted one received clicks, so the
 * first became impossible to close. Moving the lifecycle into the store makes
 * one-at-a-time an invariant of the reducer rather than an accident of usage.
 *
 * The other half is what happens when the element vanishes mid-animation. Motion
 * One's promise for an unmounted element never settles, so the completion never
 * arrives and the lifecycle sticks at `presenting` forever — after which the
 * reducer's own `status !== 'presented'` guard refuses every later dismiss. There
 * are three ways in, and the sharpest is not the obvious one: deleting a *user*
 * message truncates every message after it, so a picker several messages below
 * dies too.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import ReactionPicker from '../src/lib/streaming-chat/primitives/ReactionPicker.svelte';
import { streamingChatReducer } from '../src/lib/streaming-chat/reducer.js';
import { createInitialStreamingChatState } from '../src/lib/streaming-chat/types.js';
import type {
	Message,
	StreamingChatState,
	StreamingChatAction,
	StreamingChatDependencies
} from '../src/lib/streaming-chat/types.js';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

const msg = (id: string, role: Message['role'] = 'assistant'): Message => ({
	id,
	role,
	content: id,
	timestamp: 0
});

function makeStore(messages: Message[] = [msg('m1'), msg('m2')]) {
	const store = createStore<StreamingChatState, StreamingChatAction>({
		initialState: { ...createInitialStreamingChatState(), messages },
		reducer: streamingChatReducer,
		dependencies: { streamMessage: () => {} } satisfies StreamingChatDependencies
	});
	cleanup.push(() => store.destroy?.());
	return store;
}

const picker = (s: StreamingChatState) => s.reactionPicker;

function openOn(store: ReturnType<typeof makeStore>, messageId: string) {
	store.dispatch({ type: 'reactionPickerOpened', messageId });
	store.dispatch({
		type: 'reactionPickerPresentation',
		event: { type: 'presentationCompleted' }
	});
}

describe('the picker lifecycle', () => {
	it('starts idle', () => {
		expect(picker(makeStore().state).status).toBe('idle');
	});

	it('opens onto a message and completes', () => {
		const store = makeStore();
		store.dispatch({ type: 'reactionPickerOpened', messageId: 'm1' });
		expect(picker(store.state).status).toBe('presenting');

		store.dispatch({
			type: 'reactionPickerPresentation',
			event: { type: 'presentationCompleted' }
		});
		const p = picker(store.state);
		expect(p.status).toBe('presented');
		expect(p.status !== 'idle' && p.content).toBe('m1');
	});

	it('holds one slot — opening on another message moves it', () => {
		// The defect this fixes: two component-local booleans meant two stacked
		// full-viewport backdrops, and the first became unclosable.
		const store = makeStore();
		openOn(store, 'm1');
		store.dispatch({ type: 'reactionPickerOpened', messageId: 'm2' });

		const p = picker(store.state);
		expect(p.status !== 'idle' && p.content, 'the slot did not move').toBe('m2');
	});

	it('refuses a dismiss until the entrance finishes', () => {
		const store = makeStore();
		store.dispatch({ type: 'reactionPickerOpened', messageId: 'm1' });
		store.dispatch({ type: 'reactionPickerDismissed' });

		expect(picker(store.state).status).toBe('presenting');
	});

	it('runs the full lifecycle back to idle', () => {
		const store = makeStore();
		openOn(store, 'm1');
		store.dispatch({ type: 'reactionPickerDismissed' });
		expect(picker(store.state).status).toBe('dismissing');

		store.dispatch({
			type: 'reactionPickerPresentation',
			event: { type: 'dismissalCompleted' }
		});
		expect(picker(store.state).status).toBe('idle');
	});
});

describe('when the picker’s element disappears', () => {
	it('resets when its own message is deleted', () => {
		const store = makeStore();
		openOn(store, 'm2');
		store.dispatch({ type: 'deleteMessage', messageId: 'm2' });

		expect(picker(store.state).status, 'stuck presented on a deleted message').toBe('idle');
	});

	it('resets when a message ABOVE it is deleted', () => {
		// The sharp one. Deleting a *user* message truncates the tail, so a picker
		// several messages below unmounts without ever being mentioned.
		const store = makeStore([msg('m1', 'user'), msg('m2'), msg('m3')]);
		openOn(store, 'm3');
		store.dispatch({ type: 'deleteMessage', messageId: 'm1' });

		expect(store.state.messages, 'precondition: the tail was truncated').toHaveLength(0);
		expect(picker(store.state).status, 'stuck on a message that no longer exists').toBe('idle');
	});

	it('survives a deletion that does not touch it', () => {
		// The discriminator: a blanket reset would pass the two above while
		// closing the picker on every unrelated delete.
		const store = makeStore([msg('m1'), msg('m2')]);
		openOn(store, 'm2');
		store.dispatch({ type: 'deleteMessage', messageId: 'm1' });

		expect(picker(store.state).status, 'an unrelated deletion closed the picker').toBe(
			'presented'
		);
	});

	it('resets when the conversation is cleared', () => {
		const store = makeStore();
		openOn(store, 'm1');
		store.dispatch({ type: 'clearMessages' });

		expect(picker(store.state).status).toBe('idle');
	});

	it('resets when the message enters edit mode', () => {
		// The picker lives in the display branch, so editing unmounts it.
		const store = makeStore([msg('m1', 'user')]);
		openOn(store, 'm1');
		store.dispatch({ type: 'startEditingMessage', messageId: 'm1' });

		expect(picker(store.state).status).toBe('idle');
	});
});

describe('a gap the attachment preview left', () => {
	it('restoring a session clears an open attachment preview', () => {
		// Step J added the preview lifecycle and did not reset it here, so a
		// restore left it pointing at an attachment from the previous session.
		const attachment = {
			id: 'a1',
			type: 'image' as const,
			filename: 'p.png',
			url: 'blob:x',
			size: 1,
			mimeType: 'image/png'
		};
		const store = createStore<StreamingChatState, StreamingChatAction>({
			initialState: {
				...createInitialStreamingChatState(),
				attachmentPreview: {
					presentation: { status: 'presented', content: attachment },
					removeOnDismiss: false
				}
			},
			reducer: streamingChatReducer,
			dependencies: { streamMessage: () => {} } satisfies StreamingChatDependencies
		});
		cleanup.push(() => store.destroy?.());

		store.dispatch({ type: 'restoreMessages', messages: [msg('m1')] });

		expect(store.state.attachmentPreview.presentation.status).toBe('idle');
	});

	it('also resets an open picker', () => {
		// The other half of the same block, and it was the half with no assertion.
		const store = createStore<StreamingChatState, StreamingChatAction>({
			initialState: {
				...createInitialStreamingChatState(),
				reactionPicker: { status: 'presented', content: 'm-from-the-last-session' }
			},
			reducer: streamingChatReducer,
			dependencies: { streamMessage: () => {} } satisfies StreamingChatDependencies
		});
		cleanup.push(() => store.destroy?.());

		store.dispatch({ type: 'restoreMessages', messages: [msg('m1')] });

		expect(store.state.reactionPicker.status).toBe('idle');
	});

	it('does not restore a progress bar that can never move', () => {
		// An upload from a previous session is not in flight. Left alone, the
		// gallery renders `role="progressbar"` frozen at whatever percentage it
		// had reached, forever. Only reachable since attachments started being
		// marked `'uploading'` at all.
		const store = createStore<StreamingChatState, StreamingChatAction>({
			initialState: createInitialStreamingChatState(),
			reducer: streamingChatReducer,
			dependencies: { streamMessage: () => {} } satisfies StreamingChatDependencies
		});
		cleanup.push(() => store.destroy?.());

		store.dispatch({
			type: 'restoreMessages',
			messages: [
				{
					...msg('m1'),
					attachments: [
						{
							id: 'a1',
							type: 'image',
							filename: 'a.png',
							url: 'https://cdn.example.com/a.png',
							size: 1,
							mimeType: 'image/png',
							uploadStatus: 'uploading',
							uploadProgress: 37
						}
					]
				}
			]
		});

		const restored = store.state.messages[0]!.attachments![0]!;
		expect(restored.uploadStatus).toBeUndefined();
		expect(restored.uploadProgress).toBeUndefined();
	});
});

describe('closing the picker from the keyboard', () => {
	// `onkeydown` sat on a `<div>` with no `tabindex` and nothing that focused
	// it, so Escape never reached the handler: the picker is opened from a
	// control outside its own subtree, and that control keeps focus. The
	// suppression comment on the markup was silencing the warning that says so.
	//
	// The same defect was found and fixed in `AttachmentPreviewModal` during this
	// pass. The picker was rewritten in the same pass and missed it.

	function mountPicker(props: Record<string, unknown> = {}) {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const trigger = document.createElement('button');
		document.body.appendChild(trigger);
		trigger.focus();

		const closed: number[] = [];
		const component = mount(ReactionPicker as never, {
			target,
			props: { open: true, onclose: () => closed.push(1), ...props }
		});
		flushSync();

		let mounted = true;
		const unmountPicker = () => {
			if (mounted) unmount(component);
			mounted = false;
		};
		// Registered separately from the element removal: asserting where focus
		// lands requires the trigger to still be in the document.
		cleanup.push(() => {
			unmountPicker();
			target.remove();
			trigger.remove();
		});
		return { target, trigger, closed, unmountPicker };
	}

	it('takes focus, so Escape reaches it', () => {
		const { target, closed } = mountPicker();
		const backdrop = target.querySelector('.reaction-picker-backdrop') as HTMLElement;

		expect(document.activeElement, 'the picker never took focus').toBe(backdrop);

		// Dispatched from wherever focus actually is, which is the point.
		document.activeElement!.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
		);
		flushSync();

		expect(closed, 'Escape did not close the picker').toHaveLength(1);
	});

	it('gives focus back to the control that opened it', () => {
		const { trigger, unmountPicker } = mountPicker();
		unmountPicker();
		flushSync();

		expect(document.activeElement).toBe(trigger);
	});
});
