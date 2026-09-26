/**
 * A managed root around the SHIPPED `codeEditorReducer`, for mounting the real
 * `CodeEditor` through `ManagedIntegrationBuilder` → `defineViews` →
 * `FeatureViews` / `FeatureOutlet` → `FeatureViewProps.store`.
 *
 * Every import from core is the package's public entry, which resolves to the
 * built `dist` through the workspace link. There is no source alias, so the
 * views and the components share one captured-view registry exactly as an
 * installed app does.
 */
import { createStore, Effect, type PresentationAction, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, keyedSlot, optionalSlot } from '@composable-svelte/core/application';
import { codeEditorReducer } from '../../src/lib/code-editor/code-editor.reducer';
import {
	createInitialState,
	type CodeEditorAction,
	type CodeEditorDependencies,
	type CodeEditorState
} from '../../src/lib/code-editor/code-editor.types';

export interface EditorRoot {
	editors: Array<{ id: string; state: CodeEditorState }>;
	panel: CodeEditorState | null;
}

export type EditorRootAction =
	| { type: 'editors'; id: string; action: CodeEditorAction }
	| { type: 'panel'; action: PresentationAction<CodeEditorAction> }
	/** Same-ID replacement: a new owner, fresh state. */
	| { type: 'replaceEditor'; id: string; value: string }
	/** Several root actions as consecutive turns of one drain. */
	| { type: 'sequence'; actions: EditorRootAction[] }
	| { type: 'openPanel'; value: string }
	| { type: 'closePanel' };

export const editorsSlot = keyedSlot<EditorRoot, EditorRootAction>()('editors');
export const panelSlot = optionalSlot<EditorRoot, EditorRootAction>()('panel');

const root: Reducer<EditorRoot, EditorRootAction, CodeEditorDependencies> = (state, action) => {
	switch (action.type) {
		case 'replaceEditor':
			return [
				{
					...state,
					editors: state.editors.map((row) =>
						row.id === action.id ? { id: row.id, state: createInitialState({ value: action.value }) } : row
					)
				},
				Effect.none()
			];
		case 'sequence':
			return [state, Effect.run<EditorRootAction>((dispatch) => action.actions.forEach((next) => dispatch(next)))];
		case 'openPanel':
			return [{ ...state, panel: createInitialState({ value: action.value }) }, Effect.none()];
		case 'closePanel':
			return [{ ...state, panel: null }, Effect.none()];
		default:
			return [state, Effect.none()];
	}
};

export const editorComposition = new ManagedIntegrationBuilder(root)
	.forEach(editorsSlot, codeEditorReducer, {
		replaceOn: (action, id) => action.type === 'replaceEditor' && action.id === id
	})
	.with(panelSlot, codeEditorReducer)
	.build();

export function createEditorRoot(dependencies: CodeEditorDependencies = {}, values: Record<string, string> = { a: 'A', b: 'B' }) {
	return createStore({
		initialState: {
			editors: Object.entries(values).map(([id, value]) => ({ id, state: createInitialState({ value }) })),
			panel: null
		} satisfies EditorRoot,
		...editorComposition,
		dependencies
	});
}

export const to = (id: string, action: CodeEditorAction): EditorRootAction => ({ type: 'editors', id, action });
export const insert = (id: string, text: string): EditorRootAction => to(id, { type: 'insertText', text });
export const valueOf = (state: EditorRoot, id: string) => state.editors.find((row) => row.id === id)?.state.value;
export const rowOf = (state: EditorRoot, id: string) => state.editors.find((row) => row.id === id)?.state;
