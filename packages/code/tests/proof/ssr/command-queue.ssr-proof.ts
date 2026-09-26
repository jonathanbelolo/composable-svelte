/**
 * B1 proof, Option A — server render with a non-empty command queue.
 *
 * The queue is plain serializable state. On the server nothing attaches, so
 * nothing executes and nothing is acknowledged: the pending entries survive into
 * the payload for the client's declared policy (default drop discards them and
 * counts it; buffer replays once — command-queue.managed.test.ts, "SSR state
 * replay"). Ids live in per-request state, so concurrent requests cannot collide;
 * correlation is by entry identity, which a JSON round trip deliberately breaks
 * (a hydrated client is a new attachment, never a continuation).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import { createStore } from '@composable-svelte/core';
import ProofHost from '../ProofHost.svelte';
import { queueViews } from '../proof-plans';
import { composition, initialProofRoot, log, resetProofInstrumentation, type ProofRoot } from '../proof-model';

beforeEach(() => resetProofInstrumentation());

function requestStore() {
	return createStore({ initialState: initialProofRoot(), ...composition, dependencies: {} });
}

const ids = (state: ProofRoot, id: string) =>
	state.editors.find((row) => row.id === id)?.state.commands.entries.map((entry) => entry.id);

describe('server render with pending commands', () => {
	it('renders the managed views, executes nothing, acknowledges nothing', () => {
		const store = requestStore();
		store.dispatch({ type: 'editors', id: 'a', action: { type: 'insertText', text: 'server' } });
		store.dispatch({ type: 'editors', id: 'a', action: { type: 'undo' } });
		const seen: string[] = [];
		const stop = store.subscribeToActions?.((action) => seen.push(action.type === 'editors' ? action.action.type : action.type));

		const { body } = render(ProofHost, { props: { store, definition: queueViews, visibility: { show: true } } });
		stop?.();

		expect(body).toContain('data-proof-editor="a"');
		expect(body).toContain('data-proof-editor="b"');
		expect(body).not.toContain('cm-editor');
		expect(log).toEqual([]);
		expect(seen).toEqual([]);
		expect(ids(store.state, 'a')).toEqual([1, 2]);
		expect(JSON.parse(JSON.stringify(store.state))).toEqual(store.state);
		store.destroy();
	});

	it('concurrent request stores keep independent id sequences', () => {
		const first = requestStore();
		const second = requestStore();
		first.dispatch({ type: 'editors', id: 'a', action: { type: 'selectAll' } });
		second.dispatch({ type: 'editors', id: 'a', action: { type: 'focus' } });
		first.dispatch({ type: 'editors', id: 'a', action: { type: 'selectAll' } });
		render(ProofHost, { props: { store: first, definition: queueViews, visibility: { show: true } } });
		render(ProofHost, { props: { store: second, definition: queueViews, visibility: { show: true } } });
		expect(ids(first.state, 'a')).toEqual([1, 2]);
		expect(ids(second.state, 'a')).toEqual([1]);
		first.destroy();
		second.destroy();
	});
});
