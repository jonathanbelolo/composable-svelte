/**
 * Every PDF opened blank.
 *
 * `loadPDF` awaited `renderPage(currentPage)` and *then* set `isLoading = false`.
 * `renderPage` bails on `!canvasRef`, and the `<canvas>` renders behind
 * `{#if !isLoading && !error}` — so at the moment of the call the canvas did not
 * exist, the render returned immediately, and nothing re-triggered it. There is
 * no `$effect` watching the page; the only other calls are the prev/next/zoom
 * handlers. So the component mounted showing "Page 1 of 3" over an empty canvas
 * and painted only once the reader pressed a control.
 *
 * Nothing in the package tested `PDFViewer` at all.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PDFViewer from '../src/lib/streaming-chat/attachment-components/PDFViewer.svelte';
import type { MessageAttachment } from '../src/lib/streaming-chat/types.js';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

const pdf: MessageAttachment = {
	id: 'p1',
	type: 'pdf',
	filename: 'report.pdf',
	url: 'data:application/pdf;base64,JVBERi0=',
	size: 1024,
	mimeType: 'application/pdf'
};

function render() {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(PDFViewer as never, { target, props: { attachment: pdf } });
	flushSync();
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	return target;
}

async function waitFor<T>(read: () => T | null, what: string, tries = 60): Promise<T> {
	for (let i = 0; i < tries; i += 1) {
		flushSync();
		const found = read();
		if (found) return found;
		await new Promise((r) => setTimeout(r, 25));
	}
	throw new Error(`timed out waiting for ${what}`);
}

describe('PDFViewer', () => {
	it('paints the first page on mount, with no interaction', async () => {
		// The canvas keeps its 300×150 default until `renderPage` gets past its
		// `!canvasRef` guard and applies the viewport — so its dimensions are the
		// observable difference between "rendered" and "returned early". A spy on
		// the mock would be neater, but the mock is externalised in
		// `vitest.config.ts` and does not re-export reliably.
		const target = render();
		const canvas = await waitFor(
			() => target.querySelector('canvas') as HTMLCanvasElement | null,
			'the canvas'
		);
		await waitFor(() => (canvas.width !== 300 ? canvas : null), 'the first page to paint');

		expect(canvas.width).toBe(800);
		expect(canvas.height).toBe(600);
	});

	it('has stopped loading by the time the page is on screen', async () => {
		const target = render();
		await waitFor(() => target.querySelector('canvas'), 'the canvas');

		expect(target.querySelector('.pdf-viewer-loading')).toBeNull();
		expect(target.textContent).toContain('Page 1 of 3');
	});
});
