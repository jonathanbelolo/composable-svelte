/**
 * A server-rendered message must be visible.
 *
 * The message renderers used a one-shot `@keyframes` to fade in, which worked
 * with JavaScript disabled because it was pure CSS on server HTML. Replacing it
 * with Motion One moves the animation into an `$effect` — and `$effect` never
 * runs on the server.
 *
 * So the resting state must be "visible", and the animation must supply its own
 * start value rather than the stylesheet parking the element at `opacity: 0`. If
 * that were reversed, every server-rendered message would be invisible until
 * hydration, and permanently invisible on an SSG page or with JS off.
 *
 * The existing SSR test here asserts with `toContain` on the HTML string, which
 * cannot see an invisible element — that is exactly why this needs its own
 * assertion rather than trusting the suite to stay green.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import ChatMessage from '../../src/lib/streaming-chat/primitives/ChatMessage.svelte';
import SimpleChatMessage from '../../src/lib/streaming-chat/primitives/SimpleChatMessage.svelte';
import type { Message } from '../../src/lib/streaming-chat/types.js';

const message: Message = { id: 'm1', role: 'user', content: 'hello', timestamp: 0 };

describe('server-rendered messages', () => {
	// One typed helper rather than casting at each call site: `render`'s generic
	// collapses to `never` when given a union of two component types, which makes
	// the props object unassignable and tempts a cast that would hide a real
	// signature change.
	const renderMessage = (Component: typeof ChatMessage) =>
		render(Component, { props: { message, animateIn: true } });

	it.each([
		['ChatMessage', ChatMessage],
		['SimpleChatMessage', SimpleChatMessage as typeof ChatMessage]
	])('%s emits no opacity that only an effect could raise', (_name, Component) => {
		const { body } = renderMessage(Component);

		expect(body, 'the control failed — nothing rendered').toContain('hello');
		// Even asked to animate, the server must emit a visible element: the start
		// value belongs to the animation, which only runs on the client.
		expect(body).not.toMatch(/opacity:\s*0/);
	});
});
