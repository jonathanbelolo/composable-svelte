/**
 * B1 proof, Option A — the ordered command queue driven through the real
 * managed path: ManagedIntegrationBuilder → defineViews → FeatureViews →
 * FeatureViewProps.store (a ChildView) → a live CodeMirror EditorView.
 *
 * Unmodified core 0.13 public APIs only. No `subscribeToActions`, no root store
 * handed to the view, no casts. Every assertion is on the live EditorView, the
 * store, or the ordered execution log. Revised after the independent review:
 * `drop` is the default, correlation is by entry identity, overflow rejects.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';
import { EditorView } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import { createStore } from '@composable-svelte/core';
import { defineViews } from '@composable-svelte/core/application';
import ProofHost from './ProofHost.svelte';
import ProofEditor from './ProofEditor.svelte';
import { createVisibility } from './visibility.svelte';
import { coalescingViews, queueViews, type ProofViews } from './proof-plans';
import {
	captured,
	composition,
	createProofComposition,
	creationGate,
	effectTrace,
	initialProofRoot,
	log,
	proofConfig,
	resetProofInstrumentation,
	type ProofRoot
} from './proof-model';
import { replayableEditorCommand, type ProofEditorAction, type ProofEditorState } from './editor-command-queue';

const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

let teardown: Array<() => void> = [];
beforeEach(() => resetProofInstrumentation());
afterEach(() => {
	for (const fn of teardown.splice(0).reverse()) fn();
});

function deferred() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => (release = resolve));
	return { promise, release };
}

async function setup(
	options: {
		initial?: ProofRoot;
		definition?: ProofViews;
		composed?: typeof composition;
	} = {}
) {
	const store = createStore({
		initialState: options.initial ?? initialProofRoot(),
		...(options.composed ?? composition),
		dependencies: {}
	});
	const visibility = createVisibility(true);
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(ProofHost, {
		target,
		props: { store, definition: options.definition ?? queueViews, visibility }
	});
	flushSync();
	teardown.push(() => {
		void unmount(component);
		store.destroy();
		target.remove();
	});
	const definition = options.definition ?? queueViews;
	if (!creationGate.hold && definition === queueViews && store.state?.editors?.length) {
		await vi.waitFor(() => {
			for (const ed of store.state.editors) {
				const element = target.querySelector(`[data-proof-editor="${ed.state.label}"] .cm-editor`);
				if (!element || !EditorView.findFromDOM(element as HTMLElement)) {
					throw new Error(`Waiting for editor ${ed.state.label} to attach`);
				}
			}
		}, { timeout: 5_000 });
	} else {
		await settle();
	}
	return { store, target, visibility };
}

const cmElement = (target: HTMLElement, attachment: string) =>
	target.querySelector<HTMLElement>(`[data-attachment="${attachment}"] .cm-editor`);

function editorOf(target: HTMLElement, attachment: string): EditorView {
	const element = cmElement(target, attachment);
	const view = element ? EditorView.findFromDOM(element) : null;
	if (!view) throw new Error(`no EditorView for ${attachment}`);
	return view;
}

const queueOf = (store: { state: ProofRoot }, id: string) => row(store, id).commands;
const ids = (store: { state: ProofRoot }, id: string) => queueOf(store, id).entries.map((entry) => entry.id);
const insert = (id: string, text: string) => toEditor(id, { type: 'insertText', text });
const buffer = () => (proofConfig.options = { unattached: 'buffer', replayable: replayableEditorCommand });

const row = (store: { state: ProofRoot }, id: string): ProofEditorState => {
	const found = store.state.editors.find((item) => item.id === id);
	if (!found) throw new Error(`no row ${id}`);
	return found.state;
};

const toEditor = (id: string, command: ProofEditorAction) =>
	({ type: 'editors', id, action: command }) as const;

const execs = (prefix = '') => log.filter((entry) => entry.startsWith(`exec:${prefix}`));

/** The most recent attachment name for a label, e.g. 'a#3'. */
function latestAttachment(label: string): string {
	const found = log.filter((entry) => entry.startsWith(`attach:${label}#`)).at(-1);
	if (!found) throw new Error(`no attachment for ${label}`);
	return found.slice('attach:'.length);
}

/**
 * Detach every editor view while its owner stays live. Core rejects a rendered
 * slot with no FeatureOutlet at startup ("Missing FeatureOutlet placement"), so
 * "no view yet" is reachable only after mount or during async creation.
 */
function detach(visibility: { show: boolean }) {
	visibility.show = false;
	flushSync();
}

describe('TC-CMD-1 repeated commands in one tick', () => {
	it('executes identical same-tick inserts in order, then trims the queue', async () => {
		const { store, target } = await setup();
		store.dispatch(insert('a', 'First '));
		store.dispatch(insert('a', 'Second '));
		store.dispatch(insert('a', 'x'));
		store.dispatch(insert('a', 'x'));
		expect(editorOf(target, 'a#1').state.doc.toString()).toBe('First Second xxA');
		expect(row(store, 'a').value).toBe('First Second xxA');
		expect(execs('a#1')).toEqual([
			'exec:a#1:1:insertText:First ',
			'exec:a#1:2:insertText:Second ',
			'exec:a#1:3:insertText:x',
			'exec:a#1:4:insertText:x'
		]);
		expect(ids(store, 'a')).toEqual([]);
	});

	it('executes two identical same-tick undos as two undos', async () => {
		const { store, target } = await setup();
		const editor = editorOf(target, 'a#1');
		editor.dispatch({ changes: { from: 1, insert: '1' }, annotations: isolateHistory.of('full') });
		editor.dispatch({ changes: { from: 2, insert: '2' }, annotations: isolateHistory.of('full') });
		store.dispatch(toEditor('a', { type: 'undo' }));
		store.dispatch(toEditor('a', { type: 'undo' }));
		expect(editor.state.doc.toString()).toBe('A');
		expect(row(store, 'a').value).toBe('A');
		expect(execs('a#1')).toEqual(['exec:a#1:1:undo', 'exec:a#1:2:undo']);
	});

	it('also holds when commands arrive through the captured ChildView, not the root', async () => {
		const { store, target } = await setup();
		const view = captured.find((candidate) => candidate.state?.label === 'b')!;
		view.dispatch({ type: 'insertText', text: 'p' });
		view.dispatch({ type: 'insertText', text: 'q' });
		expect(editorOf(target, 'b#2').state.doc.toString()).toBe('pqB');
		expect(ids(store, 'b')).toEqual([]);
	});

	it('a coalescing $effect consumer still sees every entry; a last-command read does not', async () => {
		const { store } = await setup({ definition: coalescingViews });
		const runsBefore = effectTrace.runs;
		store.dispatch(insert('a', '1'));
		store.dispatch(insert('a', '2'));
		store.dispatch(insert('a', '3'));
		flushSync();
		expect(effectTrace.runs - runsBefore).toBeLessThanOrEqual(2);
		expect(effectTrace.consumed).toEqual([1, 2, 3]);
		expect(effectTrace.lastSeen.filter((id) => id !== undefined)).toEqual([3]);
	});
});

describe('reentrant follow-ups and acknowledgement', () => {
	it('one reduction queuing two commands plus an effect follow-up executes all three in order', async () => {
		const { store, target } = await setup();
		store.dispatch({ type: 'editors', id: 'a', action: { type: 'snippetRequested', text: 'S' } });
		expect(execs('a#1')).toEqual(['exec:a#1:1:insertText:S', 'exec:a#1:2:focus', 'exec:a#1:3:selectAll']);
		const editor = editorOf(target, 'a#1');
		expect(editor.state.doc.toString()).toBe('SA');
		const { from, to } = editor.state.selection.main;
		expect([from, to]).toEqual([0, 2]);
		expect(ids(store, 'a')).toEqual([]);
	});

	it('commands dispatched from inside a notification are executed once each, in order', async () => {
		const { store } = await setup();
		const view = captured.find((candidate) => candidate.state?.label === 'a')!;
		let injected = false;
		const stop = view.subscribe((state) => {
			if (!injected && state?.commands.entries.some((entry) => entry.id === 1)) {
				injected = true;
				view.dispatch({ type: 'insertText', text: 'y' });
				view.dispatch({ type: 'insertText', text: 'z' });
			}
		});
		store.dispatch(insert('a', 'x'));
		stop();
		expect(execs('a#1')).toEqual(['exec:a#1:1:insertText:x', 'exec:a#1:2:insertText:y', 'exec:a#1:3:insertText:z']);
		expect(row(store, 'a').value).toBe('xyzA');
		expect(ids(store, 'a')).toEqual([]);
	});

	it('TC-CMD-5: acknowledgement does not loop — notifications stop once the queue is trimmed', async () => {
		const { store } = await setup();
		const acks: number[] = [];
		const stopActions = store.subscribeToActions?.((action) => {
			if (action.type === 'editors' && action.action.type === 'commandsAcknowledged') acks.push(action.action.through.id);
		});
		for (let i = 0; i < 20; i += 1) store.dispatch(toEditor('a', { type: 'selectAll' }));
		let notifications = 0;
		const stop = store.subscribe(() => (notifications += 1));
		const baseline = notifications;
		await settle(100);
		flushSync();
		stop();
		stopActions?.();
		expect(notifications).toBe(baseline);
		expect(acks).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
		expect(queueOf(store, 'a')).toMatchObject({ entries: [], rejected: 0, discarded: 0 });
	});
});

describe('TC-CMD-2 unattached policy: drop by default, buffer by opt-in', () => {
	it('default drop: commands during async creation never run, and are reported as discarded', async () => {
		const gate = deferred();
		creationGate.hold = gate.promise;
		const { store, target } = await setup();
		store.dispatch(insert('a', 'Dropped'));
		store.dispatch(toEditor('a', { type: 'focus' }));
		expect(ids(store, 'a')).toEqual([]);
		expect(queueOf(store, 'a').discarded).toBe(2);
		gate.release();
		await settle();
		expect(editorOf(target, 'a#1').state.doc.toString()).toBe('A');
		expect(execs()).toEqual([]);
		store.dispatch(insert('a', 'Live '));
		expect(editorOf(target, 'a#1').state.doc.toString()).toBe('Live A');
		expect(queueOf(store, 'a').discarded).toBe(2);
	});

	it('buffer opt-in: text commands replay at attach; focus is not replayed late and is reported', async () => {
		buffer();
		const gate = deferred();
		creationGate.hold = gate.promise;
		const { store, target } = await setup();
		store.dispatch(insert('a', 'Buffered '));
		store.dispatch(toEditor('a', { type: 'focus' }));
		store.dispatch(insert('a', 'Text '));
		expect(ids(store, 'a')).toEqual([1, 2, 3]);
		expect(execs()).toEqual([]);
		gate.release();
		await settle();
		expect(editorOf(target, 'a#1').state.doc.toString()).toBe('Buffered Text A');
		expect(execs('a#1').map((entry) => entry.split(':')[3])).toEqual(['insertText', 'insertText']);
		expect(queueOf(store, 'a')).toMatchObject({ entries: [], discarded: 1, rejected: 0 });
		// A focus issued after attach is live, not late, and runs.
		store.dispatch(toEditor('a', { type: 'focus' }));
		expect(execs('a#1').at(-1)).toMatch(/:focus$/);
	});

	it('core refuses to start a rendered slot with no placed view (no pre-mount window exists)', () => {
		const store = createStore({ initialState: initialProofRoot(), ...composition, dependencies: {} });
		const target = document.createElement('div');
		document.body.appendChild(target);
		teardown.push(() => {
			store.destroy();
			target.remove();
		});
		expect(() =>
			mount(ProofHost, { target, props: { store, definition: queueViews, visibility: createVisibility(false) } })
		).toThrow("Missing FeatureOutlet placement for 'editors'");
	});

	it('owner live, no view mounted: drop discards the backlog at remount, buffer runs it', async () => {
		for (const mode of ['drop', 'buffer'] as const) {
			resetProofInstrumentation();
			if (mode === 'buffer') buffer();
			const { store, target, visibility } = await setup();
			detach(visibility);
			store.dispatch(insert('a', 'early '));
			expect(ids(store, 'a')).toEqual([1]);
			visibility.show = true;
			flushSync();
			await settle();
			expect(editorOf(target, latestAttachment('a')).state.doc.toString()).toBe(mode === 'buffer' ? 'early A' : 'A');
			expect(queueOf(store, 'a')).toMatchObject({ entries: [], discarded: mode === 'drop' ? 1 : 0 });
			for (const fn of teardown.splice(0).reverse()) fn();
		}
	});
});

describe('capacity: honest rejection, never eviction', () => {
	const bounded = (capacity: number) => {
		const composed = createProofComposition(capacity);
		return { composed, definition: defineViews(composed, { editors: { render: ProofEditor }, panel: { render: ProofEditor } }) };
	};

	it('no view mounted: the first `capacity` commands are kept, the rest are refused and counted', async () => {
		buffer();
		const { composed, definition } = bounded(3);
		const { store, target, visibility } = await setup({ composed, definition });
		detach(visibility);
		for (let i = 1; i <= 5; i += 1) store.dispatch(insert('a', String(i)));
		expect(ids(store, 'a')).toEqual([1, 2, 3]);
		expect(queueOf(store, 'a').rejected).toBe(2);
		visibility.show = true;
		flushSync();
		await settle();
		expect(editorOf(target, latestAttachment('a')).state.doc.toString()).toBe('123A');
		expect(queueOf(store, 'a')).toMatchObject({ entries: [], rejected: 2, discarded: 0 });
	});

	it('review case — attached 6-command burst in one drain, capacity 3: the report matches what ran', async () => {
		const { composed, definition } = bounded(3);
		const { store, target } = await setup({ composed, definition });
		store.dispatch({ type: 'sequence', actions: ['1', '2', '3', '4', '5', '6'].map((text) => insert('a', text)) });
		// Acks lag behind the burst in the turn queue, so executed-but-unacknowledged
		// entries fill the capacity. The tail is refused — and reported as refused.
		expect(execs('a#1').map((entry) => entry.split(':').at(-1))).toEqual(['1', '2', '3']);
		expect(editorOf(target, 'a#1').state.doc.toString()).toBe('123A');
		expect(queueOf(store, 'a')).toMatchObject({ entries: [], rejected: 3, discarded: 0 });
	});

	it('the same burst with capacity >= burst runs all six and reports nothing', async () => {
		const { composed, definition } = bounded(6);
		const { store, target } = await setup({ composed, definition });
		store.dispatch({ type: 'sequence', actions: ['1', '2', '3', '4', '5', '6'].map((text) => insert('a', text)) });
		expect(editorOf(target, 'a#1').state.doc.toString()).toBe('123456A');
		expect(queueOf(store, 'a')).toMatchObject({ entries: [], rejected: 0, discarded: 0 });
	});
});

describe('detach / reattach with the same owner (buffer opt-in)', () => {
	it('a remounted view executes only what arrived while detached, never what its predecessor ran', async () => {
		buffer();
		const { store, target, visibility } = await setup();
		store.dispatch(insert('a', 'one '));
		const firstView = captured.find((candidate) => candidate.state?.label === 'a')!;
		detach(visibility);
		expect(log).toContain('destroy:a#1');
		firstView.dispatch({ type: 'insertText', text: 'two ' });
		store.dispatch(insert('a', 'three '));
		expect(ids(store, 'a')).toEqual([2, 3]);
		visibility.show = true;
		flushSync();
		await settle();
		const attachment = latestAttachment('a');
		expect(attachment).not.toBe('a#1');
		expect(captured.filter((candidate) => candidate === firstView)).toHaveLength(2);
		expect(execs(attachment)).toEqual([`exec:${attachment}:2:insertText:two `, `exec:${attachment}:3:insertText:three `]);
		expect(editorOf(target, attachment).state.doc.toString()).toBe('two three one A');
	});
});

describe('TC-CMD-3 same-ID replacement, same-key reset, sibling isolation', () => {
	it('siblings: interleaved same-tick commands reach only their own editor', async () => {
		const { store, target } = await setup();
		store.dispatch(insert('a', 'Alpha '));
		store.dispatch(insert('b', 'Beta '));
		store.dispatch(toEditor('a', { type: 'undo' }));
		store.dispatch(insert('b', 'Gamma '));
		expect(editorOf(target, 'a#1').state.doc.toString()).toBe('A');
		expect(editorOf(target, 'b#2').state.doc.toString()).toBe('Beta Gamma B');
		expect(execs('b#2')).toEqual(['exec:b#2:1:insertText:Beta ', 'exec:b#2:2:insertText:Gamma ']);
	});

	it('review case — same key, fresh state, NO replaceOn: ids restart but the same attachment still runs them', async () => {
		const { store, target } = await setup();
		store.dispatch(insert('a', 'x'));
		store.dispatch({ type: 'resetEditor', id: 'a' });
		expect(ids(store, 'a')).toEqual([]);
		store.dispatch(insert('a', 'y'));
		// Same owner, same attachment: the new entry reuses id 1.
		expect(latestAttachment('a')).toBe('a#1');
		expect(execs('a#1')).toEqual(['exec:a#1:1:insertText:x', 'exec:a#1:1:insertText:y']);
		const doc = editorOf(target, 'a#1').state.doc.toString();
		expect(doc).toBe(row(store, 'a').value);
		expect(doc).toContain('fresh');
		expect(doc).toContain('y');
		expect(queueOf(store, 'a')).toMatchObject({ entries: [], rejected: 0, discarded: 0 });
	});

	it('review case — ack lag across a same-key reset in one drain: the stale ack trims nothing new', async () => {
		const { store, target } = await setup();
		const acks: Array<{ id: number; trimmed: boolean }> = [];
		const stopActions = store.subscribeToActions?.((action, state) => {
			if (action.type !== 'editors' || action.action.type !== 'commandsAcknowledged') return;
			const through = action.action.through;
			acks.push({ id: through.id, trimmed: !state.editors[0]!.state.commands.entries.includes(through) });
		});
		store.dispatch({
			type: 'sequence',
			actions: [insert('a', 'x'), { type: 'resetEditor', id: 'a' }, insert('a', 'y'), insert('a', 'z')]
		});
		stopActions?.();
		expect(execs('a#1')).toEqual(['exec:a#1:1:insertText:x', 'exec:a#1:1:insertText:y', 'exec:a#1:2:insertText:z']);
		// ack(x) is reduced after y and z were queued under colliding ids 1 and 2.
		expect(acks[0]!.id).toBe(1);
		const doc = editorOf(target, 'a#1').state.doc.toString();
		expect(doc).toBe(row(store, 'a').value);
		expect(doc).not.toContain('x');
		expect(doc).toMatch(/yz/);
		expect(queueOf(store, 'a')).toMatchObject({ entries: [], rejected: 0, discarded: 0 });
	});

	it('fresh-state replacement: a retired owner cannot trim or feed the successor queue, even naming its entry', async () => {
		buffer();
		const { store, target } = await setup();
		store.dispatch(insert('a', 'old '));
		const oldView = captured.find((candidate) => candidate.state?.label === 'a')!;
		const bEditor = editorOf(target, 'b#2');
		const gate = deferred();
		creationGate.hold = gate.promise;
		store.dispatch({ type: 'replaceEditor', id: 'a', keepState: false });
		flushSync();
		await settle();
		expect(oldView.state).toBeUndefined();
		store.dispatch(insert('a', 'new '));
		const successorEntry = queueOf(store, 'a').entries[0]!;
		// The id collides with the predecessor's acknowledged id 1.
		expect(successorEntry.id).toBe(1);
		// Worst case: the retired owner holds the successor's exact entry. Core refuses the dispatch.
		oldView.dispatch({ type: 'commandsAcknowledged', through: successorEntry, discarded: 0 });
		oldView.dispatch({ type: 'insertText', text: 'Late' });
		expect(queueOf(store, 'a').entries).toEqual([successorEntry]);
		gate.release();
		await settle();
		const successor = latestAttachment('a');
		expect(successor).not.toBe('a#1');
		expect(editorOf(target, successor).state.doc.toString()).toBe('new fresh');
		expect(execs('a#1')).toEqual(['exec:a#1:1:insertText:old ']);
		expect(bEditor.state.doc.toString()).toBe('B');
		expect(editorOf(target, 'b#2')).toBe(bEditor);
	});

	it('same drain: command, replacement, command — drop discards the successor backlog and says so; buffer runs it', async () => {
		for (const mode of ['drop', 'buffer'] as const) {
			resetProofInstrumentation();
			if (mode === 'buffer') buffer();
			const { store, target } = await setup();
			store.dispatch({
				type: 'sequence',
				actions: [insert('a', 'x'), { type: 'replaceEditor', id: 'a', keepState: false }, insert('a', 'y')]
			});
			flushSync();
			await settle();
			const successor = latestAttachment('a');
			expect(execs('a#1')).toEqual(['exec:a#1:1:insertText:x']);
			expect(editorOf(target, successor).state.doc.toString()).toBe(mode === 'buffer' ? 'yfresh' : 'fresh');
			expect(queueOf(store, 'a')).toMatchObject({ entries: [], discarded: mode === 'drop' ? 1 : 0 });
			for (const fn of teardown.splice(0).reverse()) fn();
		}
	});

	it('same-state replacement: acked entries are not replayed; the pending one follows the policy once', async () => {
		buffer();
		const { store, target } = await setup();
		store.dispatch(insert('a', 'ran '));
		const gate = deferred();
		creationGate.hold = gate.promise;
		store.dispatch({ type: 'replaceEditor', id: 'a', keepState: true });
		flushSync();
		store.dispatch(insert('a', 'pending '));
		expect(ids(store, 'a')).toEqual([2]);
		gate.release();
		await settle();
		const successor = latestAttachment('a');
		expect(successor).not.toBe('a#1');
		expect(execs(successor)).toEqual([`exec:${successor}:2:insertText:pending `]);
		expect(editorOf(target, successor).state.doc.toString()).toBe('pending ran A');
	});
});

describe('state-driven value writes and commands', () => {
	it('a value reduced before a command in one drain is in the document when the command runs', async () => {
		const { store, target } = await setup();
		store.dispatch({ type: 'editors', id: 'a', action: { type: 'loadThenInsert', value: 'Loaded', text: '!' } });
		const doc = editorOf(target, 'a#1').state.doc.toString();
		expect(doc).toBe(row(store, 'a').value);
		expect(doc).toContain('Loaded');
		expect(doc).toContain('!');
	});

	it('formerly PINNED HAZARD: a command echo reduced after a later external write no longer overwrites it', async () => {
		// Fixed in the shipped reducer, not in this queue: `createEditorView`'s
		// reports now name the document they edited (`baseValue`) and
		// `codeEditorReducer` drops a report state has moved past. The same fix
		// covers the shipped CodeEditor (tests/managed, CODE-MIGRATION.md).
		const { store, target } = await setup();
		store.dispatch({ type: 'sequence', actions: [insert('a', '!'), toEditor('a', { type: 'valueChanged', value: 'Y' })] });
		const doc = editorOf(target, 'a#1').state.doc.toString();
		expect(doc).toBe(row(store, 'a').value);
		expect(doc).toBe('Y');
	});
});

describe('TC-CMD-4 retirement', () => {
	it('closing a panel with pending commands executes nothing and refuses late work, without errors', async () => {
		const errors = vi.spyOn(console, 'error');
		buffer();
		const gate = deferred();
		creationGate.hold = gate.promise;
		const { store, target } = await setup();
		store.dispatch({ type: 'openPanel' });
		flushSync();
		await settle();
		const panel = captured.find((candidate) => candidate.state?.label === 'panel')!;
		panel.dispatch({ type: 'insertText', text: 'never' });
		const pending = store.state.panel!.commands.entries[0]!;
		store.dispatch({ type: 'closePanel' });
		flushSync();
		panel.dispatch({ type: 'undo' });
		panel.dispatch({ type: 'commandsAcknowledged', through: pending, discarded: 0 });
		gate.release();
		await settle();
		expect(store.state.panel).toBeNull();
		expect(panel.state).toBeUndefined();
		expect(log.some((entry) => entry.startsWith('abandoned:panel#'))).toBe(true);
		expect(execs('panel')).toEqual([]);
		expect(target.querySelector('[data-proof-editor="panel"]')).toBeNull();
		expect(errors).not.toHaveBeenCalled();
		errors.mockRestore();
	});
});

describe('SSR state replay (state-level; the server render itself is in ssr/)', () => {
	it('a serialized queue replays exactly once under buffer, and is discarded under the default drop', async () => {
		for (const mode of ['drop', 'buffer'] as const) {
			resetProofInstrumentation();
			if (mode === 'buffer') buffer();
			const server = createStore({ initialState: initialProofRoot(), ...composition, dependencies: {} });
			server.dispatch(insert('a', 'from-server '));
			const payload = JSON.stringify(server.state);
			server.destroy();
			const hydrated: ProofRoot = JSON.parse(payload);
			const { store, target } = await setup({ initial: hydrated });
			expect(editorOf(target, 'a#1').state.doc.toString()).toBe(mode === 'buffer' ? 'from-server A' : 'A');
			expect(queueOf(store, 'a')).toMatchObject({ entries: [], discarded: mode === 'drop' ? 1 : 0 });
			expect(execs()).toHaveLength(mode === 'buffer' ? 1 : 0);
			await tick();
			for (const fn of teardown.splice(0).reverse()) fn();
		}
	});
});
