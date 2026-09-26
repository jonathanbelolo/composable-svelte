/** Shared helpers for the mounted managed/standalone regressions. */
import { mount, unmount, flushSync, type Component } from 'svelte';
import { EditorView } from '@codemirror/view';

export const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitFor<T>(read: () => T | null | undefined | false, what: string, tries = 120): Promise<T> {
	for (let i = 0; i < tries; i += 1) {
		const found = read();
		if (found) return found;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(`timed out waiting for ${what}`);
}

const teardown: Array<() => void> = [];

/** Runs every registered teardown, newest first. Call from `afterEach`. */
export function runTeardown(): void {
	for (const fn of teardown.splice(0).reverse()) fn();
}

export function onTeardown(fn: () => void): void {
	teardown.push(fn);
}

/** Mount into a fresh element attached to the document; unmounted by `runTeardown`. */
export function mountInto<Props extends Record<string, unknown>>(
	component: Component<Props>,
	props: Props
): HTMLElement {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(component, { target, props });
	flushSync();
	teardown.push(() => {
		void unmount(instance);
		target.remove();
	});
	return target;
}

/** The live EditorViews under `root`, in document order. */
export function editorViews(root: ParentNode): EditorView[] {
	return [...root.querySelectorAll<HTMLElement>('.cm-editor')]
		.map((element) => EditorView.findFromDOM(element))
		.filter((view): view is EditorView => view !== null);
}

/** The live EditorView inside the `index`-th rendered CodeEditor under `root`, if created yet. */
export function editorAt(root: ParentNode, index: number): EditorView | null {
	const editor = root.querySelectorAll<HTMLElement>('.code-editor')[index];
	const element = editor?.querySelector<HTMLElement>('.cm-editor');
	return element ? EditorView.findFromDOM(element) : null;
}

export const doc = (view: EditorView) => view.state.doc.toString();
