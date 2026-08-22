/**
 * The attachment preview modal animates out, so it must outlive its own state.
 *
 * It faded in with a one-shot `@keyframes` and vanished instantly — animating
 * one half of a gesture and not the other. Animating out means the element has
 * to stay mounted after the thing that renders it says "closed", which is
 * exactly what a store-owned `PresentationState` is for. This is chat's first.
 *
 * Two orderings carry the whole design:
 *
 * 1. **Remove is deferred.** `removeAttachment` revokes the blob URL in an
 *    effect. Fire it when the button is clicked and the `<img>` still on screen
 *    spends the entire exit animation pointed at a revoked URL — a blank box
 *    fading out. The reducer holds the intent and performs it once the exit
 *    finishes.
 * 2. **Interactions are refused until `presented`.** A dismiss arriving during
 *    the entrance would leave the machine in `dismissing` with an entrance
 *    animation still running against it.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import AttachmentPreviewModal from '../src/lib/streaming-chat/attachment-components/AttachmentPreviewModal.svelte';
import FullStreamingChat from '../src/lib/streaming-chat/variants/FullStreamingChat.svelte';
import type { PresentationState } from '@composable-svelte/core';
import { streamingChatReducer } from '../src/lib/streaming-chat/reducer.js';
import { createInitialStreamingChatState } from '../src/lib/streaming-chat/types.js';
import type {
	MessageAttachment,
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

const attachment: MessageAttachment = {
	id: 'a1',
	type: 'image',
	filename: 'photo.png',
	url: 'blob:fake',
	size: 128,
	mimeType: 'image/png'
};

function makeStore() {
	const store = createStore<StreamingChatState, StreamingChatAction>({
		initialState: createInitialStreamingChatState(),
		reducer: streamingChatReducer,
		dependencies: {
			streamMessage: () => {}
		} satisfies StreamingChatDependencies
	});
	cleanup.push(() => store.destroy?.());
	store.dispatch({ type: 'addAttachment', attachment });
	return store;
}

const preview = (s: StreamingChatState) => s.attachmentPreview.presentation;

describe('the preview lifecycle', () => {
	it('starts idle', () => {
		expect(preview(makeStore().state).status).toBe('idle');
	});

	it('opens into presenting, carrying the attachment itself', () => {
		const store = makeStore();
		store.dispatch({ type: 'attachmentPreviewOpened', attachment });

		const p = preview(store.state);
		expect(p.status).toBe('presenting');
		// The attachment object, not its id: anything that empties
		// `pendingAttachments` mid-exit would leave an id resolving to nothing and
		// blank the modal while it fades.
		expect(p.status !== 'idle' && p.content).toEqual(attachment);
	});

	it('refuses a dismiss until the entrance has finished', () => {
		const store = makeStore();
		store.dispatch({ type: 'attachmentPreviewOpened', attachment });
		store.dispatch({ type: 'attachmentPreviewDismissed' });

		expect(preview(store.state).status, 'dismissed mid-entrance').toBe('presenting');
	});

	it('runs the full lifecycle and lands back at idle', () => {
		const store = makeStore();
		store.dispatch({ type: 'attachmentPreviewOpened', attachment });
		store.dispatch({
			type: 'attachmentPreviewPresentation',
			event: { type: 'presentationCompleted' }
		});
		expect(preview(store.state).status).toBe('presented');

		store.dispatch({ type: 'attachmentPreviewDismissed' });
		expect(preview(store.state).status).toBe('dismissing');

		store.dispatch({
			type: 'attachmentPreviewPresentation',
			event: { type: 'dismissalCompleted' }
		});
		expect(preview(store.state).status).toBe('idle');
	});
});

describe('removing from the preview', () => {
	function openAndPresent() {
		const store = makeStore();
		store.dispatch({ type: 'attachmentPreviewOpened', attachment });
		store.dispatch({
			type: 'attachmentPreviewPresentation',
			event: { type: 'presentationCompleted' }
		});
		return store;
	}

	it('does not remove the attachment while the exit is still running', () => {
		const store = openAndPresent();
		store.dispatch({ type: 'attachmentPreviewRemoveRequested' });

		expect(preview(store.state).status).toBe('dismissing');
		// The load-bearing assertion. Removing here revokes the blob URL the
		// <img> is still displaying.
		expect(
			store.state.pendingAttachments,
			'the attachment was removed while its image was still on screen'
		).toHaveLength(1);
	});

	it('removes it once the exit finishes', async () => {
		const store = openAndPresent();
		store.dispatch({ type: 'attachmentPreviewRemoveRequested' });
		store.dispatch({
			type: 'attachmentPreviewPresentation',
			event: { type: 'dismissalCompleted' }
		});
		await wait(20);

		expect(store.state.pendingAttachments, 'the deferred removal never happened').toHaveLength(0);
		expect(preview(store.state).status).toBe('idle');
	});

	it('leaves the attachment alone on a plain close', async () => {
		const store = openAndPresent();
		store.dispatch({ type: 'attachmentPreviewDismissed' });
		store.dispatch({
			type: 'attachmentPreviewPresentation',
			event: { type: 'dismissalCompleted' }
		});
		await wait(20);

		expect(store.state.pendingAttachments, 'closing the preview deleted the file').toHaveLength(1);
	});
});

describe('the modal element through the lifecycle', () => {
	function render(props: Record<string, unknown>) {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(AttachmentPreviewModal as never, { target, props });
		flushSync();
		cleanup.push(() => {
			unmount(component);
			target.remove();
		});
		return target;
	}

	const dialog = (t: HTMLElement) => t.querySelector('[role="dialog"]');

	it('stays mounted while dismissing, and goes once idle', () => {
		// The whole reason for a store-owned lifecycle: `open` is already false
		// here, and the element has to outlive it to have an exit at all.
		const dismissing: PresentationState<typeof attachment> = {
			status: 'dismissing',
			content: attachment
		};
		const t = render({ attachment, open: false, presentation: dismissing, onclose: () => {} });
		expect(dialog(t), 'the exit had nothing to animate').not.toBeNull();

		const idle = render({
			attachment,
			open: false,
			presentation: { status: 'idle' } as PresentationState<typeof attachment>,
			onclose: () => {}
		});
		expect(dialog(idle)).toBeNull();
	});

	it('refuses interaction until presented', () => {
		let closed = 0;
		const t = render({
			attachment,
			open: true,
			presentation: { status: 'presenting', content: attachment } as PresentationState<
				typeof attachment
			>,
			onclose: () => (closed += 1)
		});

		(dialog(t) as HTMLElement).dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
		);
		flushSync();

		expect(closed, 'Escape closed the modal mid-entrance').toBe(0);
	});

	it('a modal hydrated already presented can still be dismissed', async () => {
		// Invariant 2, driven through the store the way it actually happens: a page
		// server-rendered with the preview open hydrates at `presented` without ever
		// having animated in. A guard keyed on "have I animated yet" rather than on
		// the (status, content) pair refuses the dismissing branch, so
		// `dismissalCompleted` never fires and the reducer's own
		// `status !== 'presented'` guard then rejects every later dismiss —
		// a permanent deadlock with no error.
		const store = createStore<StreamingChatState, StreamingChatAction>({
			initialState: {
				...createInitialStreamingChatState(),
				pendingAttachments: [attachment],
				attachmentPreview: {
					presentation: { status: 'presented', content: attachment },
					removeOnDismiss: false
				}
			},
			reducer: streamingChatReducer,
			dependencies: { streamMessage: () => {} } satisfies StreamingChatDependencies
		});
		cleanup.push(() => store.destroy?.());

		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(FullStreamingChat as never, { target, props: { store } });
		flushSync();
		cleanup.push(() => {
			unmount(component);
			target.remove();
		});

		expect(preview(store.state).status, 'precondition: mounted presented').toBe('presented');

		store.dispatch({ type: 'attachmentPreviewDismissed' });
		flushSync();
		await wait(900);

		expect(
			preview(store.state).status,
			'a preview mounted at `presented` never completed its dismissal'
		).toBe('idle');
	});
});
