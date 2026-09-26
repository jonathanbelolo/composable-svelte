/**
 * A1 (B1-CONTRACT-REVIEW): the real CodeEditor / CodeHighlight / NodeCanvas from
 * the PACKED @composable-svelte/code dist, fed FeatureViewProps stores from the
 * PACKED core application entry. The managed path must be taken: commands run,
 * and nothing warns (a second core copy or a missed registry would warn).
 */
import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { isManagedChildView } from '@composable-svelte/core/application';
import Host from './Host.svelte';
import { canvases, composition, createRoot, editors } from './model';

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(read: () => T | null | undefined | false, what: string): Promise<T> {
	for (let i = 0; i < 160; i += 1) {
		const v = read();
		if (v) return v;
		await settle(25);
	}
	throw new Error(`timed out waiting for ${what}`);
}
const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).reverse().forEach((fn) => fn()));

it('installed CodeEditor, CodeHighlight and NodeCanvas take the managed path with no warning', async () => {
	const warn = vi.spyOn(console, 'warn');
	const error = vi.spyOn(console, 'error');
	const store = createRoot();
	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(Host, { target, props: { store } });
	flushSync();
	cleanup.push(() => { void unmount(app); store.destroy(); target.remove(); });

	expect(isManagedChildView(composition.bind(store, editors.at('e')))).toBe(true);

	const element = await waitFor(() => target.querySelector<HTMLElement>('[data-outlet="editors"] .cm-editor'), 'editor');
	const text = () => [...element.querySelectorAll('.cm-line')].map((line) => line.textContent).join('\n');
	store.dispatch({ type: 'sequence', actions: [
		{ type: 'editors', id: 'e', action: { type: 'valueChanged', value: 'Loaded' } },
		{ type: 'editors', id: 'e', action: { type: 'insertText', text: '!' } },
		{ type: 'editors', id: 'e', action: { type: 'insertText', text: '!' } }
	] });
	expect(text()).toBe('!!Loaded');
	expect(store.state.editors[0]!.state.value).toBe('!!Loaded');

	await waitFor(() => target.querySelector('[data-outlet="snippets"] .code-highlight__code b'), 'highlight');

	const viewport = await waitFor(() => target.querySelector<HTMLElement>('[data-outlet="canvases"] .svelte-flow__viewport'), 'canvas');
	await settle(600);
	store.dispatch({ type: 'canvases', id: 'c', action: { type: 'setViewport', viewport: { x: 10, y: 20, zoom: 1 } } });
	store.dispatch({ type: 'canvases', id: 'c', action: { type: 'zoomIn' } });
	await settle(600);
	// setViewport then zoomIn, in order: zoomIn scales about the pane centre from zoom 1.
	expect(viewport.style.transform).toMatch(/scale\(1\.2\)$/);
	expect(viewport.style.transform).not.toContain('translate(10px, 20px)');
	expect(composition.bind(store, canvases.at('c'))!.state?.viewport.zoom).toBeCloseTo(1.2, 5);

	expect(warn).not.toHaveBeenCalled();
	expect(error).not.toHaveBeenCalled();
});
