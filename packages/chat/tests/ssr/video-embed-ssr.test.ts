/**
 * Video embeds must survive a *server* render.
 *
 * This exists because of a regression I shipped and then cleared incorrectly.
 * Moving `VideoEmbed` from a static import to a lazy one fixed a real bundler
 * failure for consumers without the optional media peer — but it resolved the
 * component in `onMount`, which does not run on the server. Server HTML lost its
 * embeds entirely.
 *
 * I first dismissed that as harmless by reasoning that the extractor is a
 * floating promise and therefore always empty during SSR. That is only true on a
 * COLD module graph. A server evaluates the module once at boot and then serves
 * many requests, so from the second request onward the optional dependencies
 * have loaded and the extractor returns real data. Measured, before the fix:
 *
 *   REQ1 (cold)  videosBlock=false  iframe=false
 *   REQ2 (warm)  videosBlock=false  iframe=false   <- used to be true
 *
 * The fix reads the component synchronously at init from markdown.ts's
 * module-scope cache, so a warm server render has it. Hence the two requests
 * below: one render proves nothing.
 *
 * Nothing else in this repo can catch this — browser mode never exercises the
 * server build, and the build, svelte-check and tsc are all blind to it.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import ChatMessage from '../../src/lib/streaming-chat/primitives/ChatMessage.svelte';
import { optionalDependenciesReady } from '../../src/lib/streaming-chat/markdown.js';

const message = {
	id: 'm1',
	role: 'assistant' as const,
	content: 'Look: https://www.youtube.com/watch?v=dQw4w9WgXcQ',
	timestamp: 0
};


describe('server-rendered video embeds', () => {
	it('renders the embed once the process is warm', async () => {
		// Request 1: the module graph is cold, the optional deps have not landed.
		// Asserting on this render would pass with the bug present.
		render(ChatMessage, { props: { message, isStreaming: false } });

		// Boot completes — exactly what happens between a server's first and
		// second request.
		await optionalDependenciesReady;

		const warm = render(ChatMessage, { props: { message, isStreaming: false } });
		expect(warm.body, 'no video block in server HTML on a warm render').toContain(
			'chat-message__videos'
		);
		expect(warm.body, 'no iframe in server HTML on a warm render').toContain('<iframe');
		expect(warm.body).toContain('dQw4w9WgXcQ');
	});

	it('emits no video block for a streaming message', async () => {
		await optionalDependenciesReady;
		const { body } = render(ChatMessage, { props: { message, isStreaming: true } });
		expect(body).not.toContain('chat-message__videos');
	});

	it('emits no video block for a user message', async () => {
		await optionalDependenciesReady;
		const { body } = render(ChatMessage, {
			props: { message: { ...message, role: 'user' as const }, isStreaming: false }
		});
		expect(body).not.toContain('chat-message__videos');
	});
});
