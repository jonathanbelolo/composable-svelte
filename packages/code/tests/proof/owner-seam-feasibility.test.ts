/**
 * B1 proof, Option B — can an owner-scoped action/effect seam be built on
 * unmodified core 0.13 public APIs? (Runs against the built core `dist`.)
 *
 * Each test pins one existing channel and shows why it is not an owner-scoped
 * command delivery. None of them fakes a ChildView capability. The additive
 * seam these motivated is now public (`observeChildActions` from
 * `@composable-svelte/core/application`), and the shipped components use it:
 * see tests/managed/ and CODE-MIGRATION.md. These baseline facts still hold —
 * the seam added no ChildView member.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createStore, Effect, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, keyedSlot } from '@composable-svelte/core/application';
import { codeEditorReducer } from '../../src/lib/code-editor/code-editor.reducer';
import {
	createInitialState,
	type CodeEditorAction,
	type CodeEditorState
} from '../../src/lib/code-editor/code-editor.types';

interface Root {
	rows: Array<{ id: string; state: CodeEditorState }>;
}
type RootAction =
	| { type: 'rows'; id: string; action: CodeEditorAction }
	| { type: 'replaceRow'; id: string };

interface SinkDeps {
	/** A root-scoped dependency: the only thing an effect can reach besides dispatch. */
	sink: (label: string, command: CodeEditorAction) => void;
}

const rowsSlot = keyedSlot<Root, RootAction>()('rows');

const rootReducer: Reducer<Root, RootAction, SinkDeps> = (state, action) =>
	action.type === 'replaceRow'
		? [
				{
					rows: state.rows.map((row) =>
						row.id === action.id ? { id: row.id, state: createInitialState({ value: 'fresh' }) } : row
					)
				},
				Effect.none()
			]
		: [state, Effect.none()];

/** The shipped reducer, plus one effect that forwards `undo` to a dependency after a delay. */
const effectfulChild: Reducer<CodeEditorState, CodeEditorAction, SinkDeps> = (state, action, deps) => {
	if (action.type === 'undo') {
		return [
			state,
			Effect.run(async () => {
				await new Promise((resolve) => setTimeout(resolve, 20));
				// Ignores the abort signal, as a naive seam would.
				deps.sink('a', action);
			})
		];
	}
	return codeEditorReducer(state, action, {});
};

function setup(child: Reducer<CodeEditorState, CodeEditorAction, SinkDeps> = (s, a) => codeEditorReducer(s, a, {})) {
	const composition = new ManagedIntegrationBuilder(rootReducer)
		.forEach(rowsSlot, child, { replaceOn: (action, id) => action.type === 'replaceRow' && action.id === id })
		.build();
	const delivered: Array<{ label: string; command: CodeEditorAction }> = [];
	const store = createStore({
		initialState: {
			rows: [
				{ id: 'a', state: createInitialState({ value: 'A' }) },
				{ id: 'b', state: createInitialState({ value: 'B' }) }
			]
		},
		...composition,
		dependencies: { sink: (label: string, command: CodeEditorAction) => delivered.push({ label, command }) }
	});
	stores.push(store);
	const bind = (id: string) => {
		const view = composition.bind(store, rowsSlot.at(id));
		if (!view) throw new Error(`no owner for ${id}`);
		return view;
	};
	return { store, bind, delivered };
}

const stores: Array<{ destroy(): void }> = [];
afterEach(() => {
	for (const store of stores.splice(0)) store.destroy();
});

describe('Option B on existing core: no owner-scoped command channel', () => {
	it('a ChildView exposes state, dispatch, select and subscribe — no action stream', () => {
		const { bind } = setup();
		const view = bind('a');
		expect(Object.keys(view).sort()).toEqual(['dispatch', 'select', 'state', 'subscribe']);
		expect('subscribeToActions' in view).toBe(false);
	});

	it('the shipped command markers are invisible through ChildView.subscribe', () => {
		const { bind } = setup();
		const view = bind('a');
		let notifications = 0;
		const stop = view.subscribe(() => (notifications += 1));
		const before = view.state;
		const afterSubscribe = notifications;
		for (const command of [
			{ type: 'undo' },
			{ type: 'undo' },
			{ type: 'insertText', text: 'x' },
			{ type: 'focus' }
		] satisfies CodeEditorAction[]) {
			view.dispatch(command);
		}
		stop();
		// The reducer returns the identical child state for a command, so the view
		// is never told. With today's reducer a managed view cannot observe a
		// command at all; it must be carried in state (Option A) or core must add
		// a seam (Option B).
		expect(notifications).toBe(afterSubscribe);
		expect(view.state).toBe(before);
	});

	it('root action-stream tunnelling misdelivers across same-ID replacement', () => {
		const { store, bind } = setup();
		const first = bind('a');
		// What a view would have to do with the root store (which FeatureViewProps
		// does not give it): filter the root stream by the row key.
		const receivedByFirstAttachment: string[] = [];
		const stop = store.subscribeToActions?.((action) => {
			if (action.type === 'rows' && action.id === 'a') receivedByFirstAttachment.push(action.action.type);
		});
		expect(stop).toBeDefined();

		store.dispatch({ type: 'replaceRow', id: 'a' });
		expect(first.state).toBeUndefined();
		const successor = bind('a');
		expect(successor).not.toBe(first);

		successor.dispatch({ type: 'insertText', text: 'meant for the successor' });
		stop?.();
		// The key is the same; the owner is not. The stream carries no owner, so the
		// retired attachment's filter matches the successor's command.
		expect(receivedByFirstAttachment).toEqual(['insertText']);
	});

	it('an effect can reach only dispatch and root-scoped dependencies — a retired owner still reaches the sink', async () => {
		const { store, bind, delivered } = setup(effectfulChild);
		bind('a').dispatch({ type: 'undo' });
		store.dispatch({ type: 'replaceRow', id: 'a' });
		await new Promise((resolve) => setTimeout(resolve, 50));
		// Core aborted the retired owner's signal, but a dependency call is outside
		// core's authority: nothing binds it to the owner. Only cooperative signal
		// checks prevent this, and the sink cannot tell predecessor from successor.
		expect(delivered).toEqual([{ label: 'a', command: { type: 'undo' } }]);
	});
});
