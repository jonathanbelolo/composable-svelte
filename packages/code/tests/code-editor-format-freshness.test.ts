/**
 * Format results are applied only while they are fresh; stale editor reports
 * are ignored.
 *
 * Replaces `code-editor-format-freshness.probe.test.ts`, which pinned the two
 * data-loss behaviours this policy removes:
 * - a late format result overwrote an edit made while the formatter ran;
 * - the first of two overlapping formats replaced the newer result.
 *
 * Policy: the latest request wins, and only over the text it was asked to
 * format. Results that code dispatches itself, without `attemptId`, keep the
 * old unconditional behaviour.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { codeEditorReducer } from '../src/lib/code-editor/code-editor.reducer.js';
import { createInitialState } from '../src/lib/code-editor/code-editor.types.js';
import type { CodeEditorDependencies } from '../src/lib/code-editor/code-editor.types.js';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

const stores: Array<{ destroy(): void }> = [];
afterEach(() => {
	stores.splice(0).forEach((store) => store.destroy());
});

function editorStore(value: string, dependencies: CodeEditorDependencies) {
	const store = createStore({
		initialState: createInitialState({ value }),
		reducer: codeEditorReducer,
		dependencies,
		ssr: { deferEffects: false }
	});
	stores.push(store);
	return store;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('format freshness', () => {
	it('a late result does not overwrite an edit made while the formatter ran', async () => {
		const pending = deferred<string>();
		const formatter = vi.fn(() => pending.promise);
		const store = editorStore('original', { formatter });

		store.dispatch({ type: 'format' });
		expect(formatter).toHaveBeenCalledWith('original', 'javascript');
		store.dispatch({ type: 'valueChanged', value: 'new user edit' });
		pending.resolve('formatted original');
		await flush();

		expect(store.state.value).toBe('new user edit');
		expect(store.state.formatError).toBeNull();
	});

	it('the first of overlapping formats cannot replace the newer result when it resolves last', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const formatter = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		const store = editorStore('first input', { formatter });

		store.dispatch({ type: 'format' });
		store.dispatch({ type: 'valueChanged', value: 'second input' });
		store.dispatch({ type: 'format' });
		second.resolve('second result');
		await flush();
		expect(store.state.value).toBe('second result');
		first.resolve('stale first result');
		await flush();
		expect(store.state.value).toBe('second result');
	});

	it('a superseded request resolving first is dropped; the latest then applies', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const formatter = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		const store = editorStore('same', { formatter });

		store.dispatch({ type: 'format' });
		store.dispatch({ type: 'format' });
		expect(store.state.formatAttempt).toBe(2);
		first.resolve('from the first');
		await flush();
		expect(store.state.value).toBe('same');
		second.resolve('from the second');
		await flush();
		expect(store.state.value).toBe('from the second');
		expect(store.state.hasUnsavedChanges).toBe(true);
	});

	it('a superseded failure does not raise an error over a newer request', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const formatter = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		const store = editorStore('x', { formatter });

		store.dispatch({ type: 'format' });
		store.dispatch({ type: 'format' });
		first.reject(new Error('old failure'));
		await flush();
		expect(store.state.formatError).toBeNull();
		second.reject(new Error('current failure'));
		await flush();
		expect(store.state.formatError).toBe('current failure');
	});

	it('an untagged `formatted` dispatched by application code still applies unconditionally', () => {
		const store = editorStore('mine', {});
		store.dispatch({ type: 'formatted', value: 'external' });
		expect(store.state.value).toBe('external');
		store.dispatch({ type: 'formatFailed', error: 'external failure' });
		expect(store.state.formatError).toBe('external failure');
	});

	it('read-only refuses a format and takes no attempt', () => {
		const formatter = vi.fn(async (code: string) => code);
		const store = createStore({
			initialState: createInitialState({ value: 'x', readOnly: true }),
			reducer: codeEditorReducer,
			dependencies: { formatter }
		});
		stores.push(store);
		store.dispatch({ type: 'format' });
		expect(formatter).not.toHaveBeenCalled();
		expect(store.state.formatAttempt).toBe(0);
	});
});

describe('stale editor reports', () => {
	const reduce = (value: string, action: Parameters<typeof codeEditorReducer>[1]) =>
		codeEditorReducer(createInitialState({ value }), action, {});

	it('an editor report whose base is no longer the value is ignored', () => {
		const state = createInitialState({ value: 'external write' });
		const [next] = codeEditorReducer(state, { type: 'valueChanged', value: '!A', baseValue: 'A' }, {});
		expect(next).toBe(state);
	});

	it('an editor report from the current value applies', () => {
		const [next] = reduce('A', { type: 'valueChanged', value: '!A', baseValue: 'A' });
		expect(next.value).toBe('!A');
		expect(next.hasUnsavedChanges).toBe(true);
	});

	it('line-break style is not a difference: CodeMirror reads CRLF back as LF', () => {
		const [next] = reduce('one\r\ntwo', { type: 'valueChanged', value: 'one\ntwo!', baseValue: 'one\ntwo' });
		expect(next.value).toBe('one\ntwo!');
	});

	it('an external write without a base always applies', () => {
		const [next] = reduce('A', { type: 'valueChanged', value: 'loaded' });
		expect(next.value).toBe('loaded');
	});

	it('an accepted write moves valueRevision on by one; a stale report does not', () => {
		const start = createInitialState({ value: 'A' });
		expect(start.valueRevision).toBe(0);
		const [edited] = codeEditorReducer(start, { type: 'valueChanged', value: '!A', baseValue: 'A', baseRevision: 0 }, {});
		expect(edited.valueRevision).toBe(1);
		const [formatted] = codeEditorReducer(edited, { type: 'formatted', value: '! A' }, {});
		expect(formatted.valueRevision).toBe(2);
		const [same] = codeEditorReducer(formatted, { type: 'valueChanged', value: 'x', baseValue: '! A', baseRevision: 1 }, {});
		expect(same).toBe(formatted);
	});

	it('a report from before a write that restored the same text is stale (value ABA)', () => {
		// State "A" at revision 0; the editor reports "!A" from revision 0; an
		// external write of "A" is reduced first, moving to revision 1.
		const [restored] = reduce('A', { type: 'valueChanged', value: 'A' });
		expect(restored.valueRevision).toBe(1);
		const [next] = codeEditorReducer(restored, { type: 'valueChanged', value: '!A', baseValue: 'A', baseRevision: 0 }, {});
		expect(next).toBe(restored);
	});

	it('state without valueRevision counts as revision zero', () => {
		const { valueRevision: _omitted, ...legacy } = createInitialState({ value: 'A' });
		const [next] = codeEditorReducer(legacy, { type: 'valueChanged', value: 'AB', baseValue: 'A', baseRevision: 0 }, {});
		expect(next.value).toBe('AB');
		expect(next.valueRevision).toBe(1);
	});
});
