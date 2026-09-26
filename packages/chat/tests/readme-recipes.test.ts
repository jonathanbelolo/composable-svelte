/// <reference types="vite/client" />
/**
 * The README's managed recipe is this file, quoted verbatim.
 *
 * `svelte-check` typechecks it against the built package declarations; here it
 * is mounted against source (vitest.config.ts aliases the package name), so a
 * documented prop or action that does not exist fails the gate, not a reader.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import readme from '../README.md?raw';
import managedChat from './recipes/ManagedChat.svelte?raw';
import ManagedChat from './recipes/ManagedChat.svelte';
import { fakeTransport } from './fixtures/managed-chat.js';

const blocks = [...readme.matchAll(/```svelte\n([\s\S]*?)```/g)].map((match) => match[1]);

afterEach(() => vi.restoreAllMocks());

describe('README managed recipe', () => {
	it('quotes ManagedChat.svelte verbatim', () => {
		expect(blocks).toContain(managedChat);
	});

	it('archives each completed reply in the parent and aborts the stream on close', async () => {
		const errors = vi.spyOn(console, 'error');
		const warnings = vi.spyOn(console, 'warn');
		const { dependencies, streams } = fakeTransport();
		const target = document.createElement('div');
		document.body.append(target);
		const app = mount(ManagedChat, { target, props: { dependencies } });
		try {
			await vi.waitFor(() => expect(target.textContent).toContain('Open chat'));
			const button = (label: string) =>
				[...target.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;

			button('Open chat').click();
			await vi.waitFor(() => expect(target.querySelector('.full-streaming-chat')).not.toBeNull());

			const input = target.querySelector('textarea') as HTMLTextAreaElement;
			input.value = 'How do I reset my password?';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			flushSync();
			(target.querySelector('[aria-label="Send message"]') as HTMLButtonElement).click();
			flushSync();
			expect(streams.map((s) => s.message)).toEqual(['How do I reset my password?']);

			streams[0]!.chunk('Use the link on the sign-in page.');
			streams[0]!.complete();
			flushSync();
			expect(target.textContent).toContain('1 replies archived');

			// A second question, closed mid-reply.
			input.value = 'And my username?';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			flushSync();
			(target.querySelector('[aria-label="Send message"]') as HTMLButtonElement).click();
			flushSync();
			streams[1]!.chunk('Your user');
			flushSync();

			button('Close chat').click();
			flushSync();
			expect(streams[1]!.abort).toHaveBeenCalledTimes(1);
			await vi.waitFor(() => expect(target.querySelector('.full-streaming-chat')).toBeNull());
			streams[1]!.complete();
			flushSync();
			expect(target.textContent).toContain('1 replies archived');

			// Reopening is a new owner with an empty conversation.
			button('Open chat').click();
			await vi.waitFor(() => expect(target.querySelector('.full-streaming-chat')).not.toBeNull());
			expect(target.textContent).toContain('No messages yet');
			expect(errors).not.toHaveBeenCalled();
			expect(warnings).not.toHaveBeenCalled();
		} finally {
			void unmount(app);
			target.remove();
		}
	});
});
