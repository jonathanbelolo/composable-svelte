/**
 * A managed root whose editor rows run a PARENT-COMPOSED reducer around the
 * shipped `codeEditorReducer`: it declines any `valueChanged` longer than
 * three characters and delegates everything else. The shape a parent uses to
 * enforce a limit, ignore edits while saving, or validate.
 */
import { createStore, Effect, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, keyedSlot } from '@composable-svelte/core/application';
import { codeEditorReducer } from '../../src/lib/code-editor/code-editor.reducer';
import {
	createInitialState,
	type CodeEditorAction,
	type CodeEditorDependencies,
	type CodeEditorState
} from '../../src/lib/code-editor/code-editor.types';

export const MAX_LENGTH = 3;

/** Declines a value write longer than `MAX_LENGTH`; otherwise the shipped reducer. */
export const limitedEditorReducer: Reducer<CodeEditorState, CodeEditorAction, CodeEditorDependencies> = (
	state,
	action,
	deps
) =>
	action.type === 'valueChanged' && action.value.length > MAX_LENGTH
		? [state, Effect.none()]
		: codeEditorReducer(state, action, deps);

export interface VetoRoot {
	editors: Array<{ id: string; state: CodeEditorState }>;
}

export type VetoRootAction =
	| { type: 'editors'; id: string; action: CodeEditorAction }
	/** Several root actions as consecutive turns of one drain. */
	| { type: 'sequence'; actions: VetoRootAction[] };

export const vetoSlot = keyedSlot<VetoRoot, VetoRootAction>()('editors');

const root: Reducer<VetoRoot, VetoRootAction, CodeEditorDependencies> = (state, action) =>
	action.type === 'sequence'
		? [state, Effect.run<VetoRootAction>((dispatch) => action.actions.forEach((next) => dispatch(next)))]
		: [state, Effect.none()];

export const vetoComposition = new ManagedIntegrationBuilder(root).forEach(vetoSlot, limitedEditorReducer).build();

export function createVetoRoot(value: string, dependencies: CodeEditorDependencies = {}) {
	return createStore({
		initialState: { editors: [{ id: 'a', state: createInitialState({ value }) }] } satisfies VetoRoot,
		...vetoComposition,
		dependencies
	});
}

export const toVeto = (action: CodeEditorAction): VetoRootAction => ({ type: 'editors', id: 'a', action });
export const vetoRow = (state: VetoRoot) => state.editors[0]?.state;
