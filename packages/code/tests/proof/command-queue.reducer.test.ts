/**
 * B1 proof, Option A — pure contract of the ordered command queue (revised
 * after independent review). No view, no DOM.
 */

import { describe, it, expect } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { acknowledgeCommands, emptyCommandQueue, enqueueCommands } from './command-queue';
import {
	createProofEditorState,
	proofEditorReducer,
	type EditorCommand,
	type ProofEditorAction,
	type ProofEditorState
} from './editor-command-queue';

const reduce = proofEditorReducer();
const step = (state: ProofEditorState, action: ProofEditorAction) => reduce(state, action, {})[0];

describe('ordered command queue — reducer', () => {
	it('keeps repeated identical commands as distinct, ordered entries', () => {
		let state = createProofEditorState('a');
		for (const action of [
			{ type: 'insertText', text: 'x' },
			{ type: 'insertText', text: 'x' },
			{ type: 'undo' },
			{ type: 'undo' }
		] satisfies ProofEditorAction[]) {
			state = step(state, action);
		}
		expect(state.commands.entries.map((entry) => [entry.id, entry.command.type])).toEqual([
			[1, 'insertText'],
			[2, 'insertText'],
			[3, 'undo'],
			[4, 'undo']
		]);
		expect(state.commands.nextId).toBe(5);
	});

	it('an ack trims through the exact entry it names, and only those', () => {
		let state = createProofEditorState('a');
		for (let i = 0; i < 4; i += 1) state = step(state, { type: 'selectAll' });
		const second = state.commands.entries[1]!;
		state = step(state, { type: 'commandsAcknowledged', through: second, discarded: 0 });
		expect(state.commands.entries.map((entry) => entry.id)).toEqual([3, 4]);
		expect(state.commands.nextId).toBe(5);
	});

	it('an ack naming an entry that is not queued returns the identical state, whatever its id', () => {
		let state = createProofEditorState('a');
		for (let i = 0; i < 3; i += 1) state = step(state, { type: 'focus' });
		const first = state.commands.entries[0]!;
		state = step(state, { type: 'commandsAcknowledged', through: first, discarded: 0 });
		// Identity is the loop-freedom guarantee: an identical state notifies nobody.
		expect(step(state, { type: 'commandsAcknowledged', through: first, discarded: 0 })).toBe(state);
		// A structurally equal entry from another queue instance (a reset or a
		// predecessor with colliding ids) is not this queue's entry.
		const lookalike = { id: 2, command: { type: 'focus' } as EditorCommand };
		expect(step(state, { type: 'commandsAcknowledged', through: lookalike, discarded: 0 })).toBe(state);
		const fresh = step(createProofEditorState('a'), { type: 'blur' });
		expect(acknowledgeCommands(fresh.commands, { type: 'commandsAcknowledged', through: first, discarded: 0 })).toBe(fresh.commands);
	});

	it('a full queue refuses new commands and counts them; queued entries are never evicted', () => {
		const bounded = proofEditorReducer(3);
		let state = createProofEditorState('a');
		for (let i = 1; i <= 5; i += 1) state = bounded(state, { type: 'insertText', text: String(i) }, {})[0];
		expect(state.commands.entries.map((entry) => entry.command.type === 'insertText' && entry.command.text)).toEqual(['1', '2', '3']);
		expect(state.commands).toMatchObject({ rejected: 2, discarded: 0, nextId: 4 });
		// Space frees only through an acknowledgement.
		state = bounded(state, { type: 'commandsAcknowledged', through: state.commands.entries[0]!, discarded: 0 }, {})[0];
		state = bounded(state, { type: 'insertText', text: '6' }, {})[0];
		expect(state.commands.entries.map((entry) => entry.id)).toEqual([2, 3, 4]);
	});

	it('discard counts come from the consumer and are clamped to what the ack trimmed', () => {
		let queue = enqueueCommands(emptyCommandQueue<string>(), ['a', 'b', 'c'], 8);
		queue = acknowledgeCommands(queue, { type: 'commandsAcknowledged', through: queue.entries[1]!, discarded: 99 });
		expect(queue).toMatchObject({ discarded: 2, rejected: 0 });
		expect(queue.entries.map((entry) => entry.command)).toEqual(['c']);
	});

	it('one business reduction can queue several commands, and its effect a follow-up, in order', () => {
		const store = createStore({ initialState: createProofEditorState('a'), reducer: proofEditorReducer(), dependencies: {} });
		store.dispatch({ type: 'snippetRequested', text: 'hello' });
		expect(store.state.commands.entries.map((entry) => entry.command.type)).toEqual(['insertText', 'focus', 'selectAll']);
		store.destroy();
	});

	it('delegates non-command actions to the shipped reducer unchanged', () => {
		let state = createProofEditorState('a', { value: 'v0' });
		state = step(state, { type: 'valueChanged', value: 'v1' });
		expect(state.hasUnsavedChanges).toBe(true);
		const before = state;
		expect(step(before, { type: 'historyChanged', canUndo: false, canRedo: false })).toBe(before);
		state = step(state, { type: 'save' });
		expect(state.isSaving).toBe(true);
		expect(state.commands.entries).toEqual([]);
	});
});
