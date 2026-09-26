/**
 * `bindViewSource`, the package-internal choice between a managed view's
 * `observeChildActions` and a standalone store's `subscribeToActions`.
 *
 * Core comes from its public entries (built `dist`), so the registry that
 * recognises managed views is the one an installed app uses.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { createStore, Effect, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, keyedSlot, type ChildView } from '@composable-svelte/core/application';
import { bindViewSource, type ViewSource } from '../src/lib/internal/view-source';

type Cmd = { type: 'poke'; n: number } | { type: 'bump' };
interface Row {
	hits: number;
}
interface Root {
	rows: Array<{ id: string; state: Row }>;
}
type RootAction = { type: 'rows'; id: string; action: Cmd } | { type: 'replace'; id: string };

const rows = keyedSlot<Root, RootAction>()('rows');
const child: Reducer<Row, Cmd> = (state, action) =>
	action.type === 'bump' ? [{ hits: state.hits + 1 }, Effect.none()] : [state, Effect.none()];
const composition = new ManagedIntegrationBuilder<Root, RootAction, undefined>((state, action) =>
	action.type === 'replace'
		? [{ rows: state.rows.map((row) => (row.id === action.id ? { id: row.id, state: { hits: 0 } } : row)) }, Effect.none()]
		: [state, Effect.none()]
)
	.forEach(rows, child, { replaceOn: (action, id) => action.type === 'replace' && action.id === id })
	.build();

const destroyers: Array<() => void> = [];
let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
	warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
	destroyers.splice(0).forEach((fn) => fn());
	vi.restoreAllMocks();
});

function managed() {
	const store = createStore({ initialState: { rows: [{ id: 'a', state: { hits: 0 } }, { id: 'b', state: { hits: 0 } }] } satisfies Root, ...composition });
	destroyers.push(() => store.destroy());
	return { store, view: (id: string) => composition.bind(store, rows.at(id))! };
}

const identity = { component: 'Probe', loses: 'probe commands are lost' };

function record<S, A>(source: ViewSource<S, A>) {
	const log: string[] = [];
	const stop = bindViewSource(source, identity, {
		onState: (state) => log.push(`state:${JSON.stringify(state)}`),
		onAction: (action) => log.push(`action:${JSON.stringify(action)}`)
	});
	return { log, stop };
}

describe('a managed view', () => {
	it('observes only its own owner, unwrapped, with state before the action of the same turn', () => {
		const { store, view } = managed();
		const { log, stop } = record(view('a'));
		store.dispatch({ type: 'rows', id: 'b', action: { type: 'bump' } });
		store.dispatch({ type: 'rows', id: 'a', action: { type: 'bump' } });
		store.dispatch({ type: 'rows', id: 'a', action: { type: 'poke', n: 1 } });
		stop();
		store.dispatch({ type: 'rows', id: 'a', action: { type: 'poke', n: 2 } });
		expect(log).toEqual([
			'state:{"hits":0}',
			'state:{"hits":1}',
			'action:{"type":"bump"}',
			'action:{"type":"poke","n":1}'
		]);
		expect(warn).not.toHaveBeenCalled();
	});

	it('goes quiet when its owner retires: state reads undefined, and nothing throws or warns', () => {
		const { store, view } = managed();
		const { log } = record(view('a'));
		store.dispatch({ type: 'replace', id: 'a' });
		store.dispatch({ type: 'rows', id: 'a', action: { type: 'poke', n: 1 } });
		expect(log).toEqual(['state:{"hits":0}', 'state:undefined']);
		expect(warn).not.toHaveBeenCalled();
	});

	it('binding a view that has already retired is inert', () => {
		const { store, view } = managed();
		const retired = view('a');
		store.dispatch({ type: 'replace', id: 'a' });
		const { log, stop } = record(retired);
		store.dispatch({ type: 'rows', id: 'a', action: { type: 'poke', n: 1 } });
		expect(() => stop()).not.toThrow();
		expect(log).toEqual(['state:undefined']);
		expect(warn).not.toHaveBeenCalled();
	});
});

describe('a standalone store', () => {
	it('uses subscribeToActions, state first', () => {
		const store = createStore({ initialState: { hits: 0 }, reducer: child });
		destroyers.push(() => store.destroy());
		const { log, stop } = record(store);
		store.dispatch({ type: 'bump' });
		stop();
		store.dispatch({ type: 'bump' });
		expect(log).toEqual(['state:{"hits":0}', 'state:{"hits":1}', 'action:{"type":"bump"}']);
		expect(warn).not.toHaveBeenCalled();
	});
});

describe('unsupported sources warn once and keep working', () => {
	it('a structural wrapper of a managed view is not recognised: warned once per component, state still flows', () => {
		const { store, view } = managed();
		const inner = view('a');
		const wrapper: ChildView<Row, Cmd> = {
			get state() {
				return inner.state;
			},
			dispatch: (action) => inner.dispatch(action),
			select: (selector) => inner.select(selector),
			subscribe: (listener) => inner.subscribe(listener)
		};
		const first = record(wrapper);
		record(wrapper);
		bindViewSource(wrapper, { component: 'Other', loses: 'x' }, { onAction: () => {} });
		store.dispatch({ type: 'rows', id: 'a', action: { type: 'bump' } });
		expect(first.log).toEqual(['state:{"hits":0}', 'state:{"hits":1}']);
		const messages = warn.mock.calls.map((call) => String(call[0]));
		expect(messages.filter((m) => m.startsWith('[Probe]'))).toHaveLength(1);
		expect(messages.filter((m) => m.startsWith('[Other]'))).toHaveLength(1);
		expect(messages[0]).toContain('probe commands are lost');
		expect(messages[0]).toContain('wrapper or copy of a managed view');
		expect(messages[0]).toContain('two copies of @composable-svelte/core');
		// An ApplicationStore projection takes this same branch (it is not a
		// captured view and has no subscribeToActions); the remedy is named.
		expect(messages[0]).toContain('an ApplicationStore (render the feature through FeatureViews or FeatureOutlet');
	});
});
