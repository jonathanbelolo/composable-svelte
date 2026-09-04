/**
 * `VideoEmbed` is loaded lazily, and must still actually render.
 *
 * `@composable-svelte/media` is an optional peer, so `ChatMessage` cannot import
 * `VideoEmbed` statically — a consumer without media installed would hit a hard
 * bundler resolution failure on a component the root barrel re-exports. It is
 * now a dynamic import held in `$state`, with the markup gated on it.
 *
 * That gate is easy to get wrong in a way nothing else here would catch: if the
 * import never resolves, or the component never lands in state, or the `{#if}`
 * never re-evaluates, videos simply stop rendering — silently, with no error and
 * no type failure. `svelte-check` cannot see it and neither can the build.
 *
 * These tests are also the first coverage of chat's video path at all.
 *
 * A note on what the second test pins. `markdown.ts` kicks off
 * `loadOptionalDependencies()` as a floating promise at module load, so
 * `extractVideosFromMarkdown` returns `[]` until it settles. `videos` is a
 * `$derived` returning a *function*, so it re-runs on each call rather than
 * memoising on `message.content` — which means the `onMount` write that
 * populates `VideoEmbed` also provides the invalidation that lets a
 * previously-empty extraction be retried. That interaction is incidental rather
 * than designed, so it is pinned here deliberately.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';
import ChatMessage from '../src/lib/streaming-chat/primitives/ChatMessage.svelte';
import {
	extractVideosFromMarkdown,
	optionalDependenciesReady
} from '../src/lib/streaming-chat/markdown.js';
import type { Message } from '../src/lib/streaming-chat/types';

const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

const assistantMessage: Message = {
	id: 'm1',
	role: 'assistant',
	content: `Here is a video: ${YOUTUBE}`,
	timestamp: 0
};

let cleanup: Array<() => void> = [];

afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

/**
 * Wait for the optional dependencies deterministically.
 *
 * Fixed sleeps are not enough and gave a false pass here once: the extractor
 * still returned [] in the first test of this file, while a later test further
 * into the same run happened to find media loaded. Awaiting the exported promise
 * is the whole reason it is exported.
 */
async function settle() {
	await optionalDependenciesReady;
	for (let i = 0; i < 3; i += 1) {
		flushSync();
		await tick();
		await new Promise((r) => setTimeout(r, 0));
	}
	flushSync();
}

/**
 * Poll for a condition rather than guessing a delay.
 *
 * The component's `onMount` awaits two promises before it writes `VideoEmbed`,
 * so the render lands a macrotask or two after `settle()` returns. Guessing that
 * number is how this test failed for the wrong reason once already.
 */
async function waitFor<T>(read: () => T | null, what: string, tries = 60): Promise<T> {
	for (let i = 0; i < tries; i += 1) {
		flushSync();
		await tick();
		const found = read();
		if (found) return found;
		await new Promise((r) => setTimeout(r, 25));
	}
	throw new Error(`timed out waiting for ${what}`);
}

function mountMessage(Component: unknown, props: Record<string, unknown>) {
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

describe('the optional media dependency', () => {
	it('loads, so the extractor returns real video data', async () => {
		await settle();

		const videos = extractVideosFromMarkdown(assistantMessage.content);
		expect(videos, 'media did not load — the rest of this file proves nothing').toHaveLength(1);
		// The lossy declaration this package used to carry named only url and
		// platform; embedUrl is what VideoEmbed actually renders from.
		expect(videos[0]!.embedUrl).toContain('dQw4w9WgXcQ');
	});
});

describe('ChatMessage video rendering', () => {
	it('renders an iframe for a detected video', async () => {
		const target = mountMessage(ChatMessage, {
			message: assistantMessage,
			isStreaming: false
		});

		const iframe = await waitFor(
			() => target.querySelector('iframe'),
			'the lazily-loaded VideoEmbed to render'
		);
		expect(iframe.getAttribute('src')).toContain('dQw4w9WgXcQ');
	});

	it('renders no video container while the message is still streaming', async () => {
		const target = mountMessage(ChatMessage, {
			message: assistantMessage,
			isStreaming: true
		});
		await settle();

		expect(target.querySelector('.chat-message__videos')).toBeNull();
	});

	it('renders no video container for a user message', async () => {
		const target = mountMessage(ChatMessage, {
			message: { ...assistantMessage, role: 'user' },
			isStreaming: false
		});
		await settle();

		expect(target.querySelector('.chat-message__videos')).toBeNull();
	});
});
