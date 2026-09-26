/** A managed root of keyed `CodeHighlight` rows around the shipped reducer. */
import { createStore, Effect, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, keyedSlot } from '@composable-svelte/core/application';
import { codeHighlightReducer } from '../../src/lib/code-highlight/code-highlight.reducer';
import {
	createInitialState,
	type CodeHighlightAction,
	type CodeHighlightDependencies,
	type CodeHighlightState
} from '../../src/lib/code-highlight/code-highlight.types';

export interface HighlightRoot {
	snippets: Array<{ id: string; state: CodeHighlightState }>;
}
export type HighlightRootAction =
	| { type: 'snippets'; id: string; action: CodeHighlightAction }
	/** The parent writes `code` directly, without `codeChanged`. */
	| { type: 'overwrite'; id: string; code: string }
	| { type: 'remove'; id: string };

export const snippetsSlot = keyedSlot<HighlightRoot, HighlightRootAction>()('snippets');

const root: Reducer<HighlightRoot, HighlightRootAction, CodeHighlightDependencies> = (state, action) => {
	switch (action.type) {
		case 'overwrite':
			return [
				{
					snippets: state.snippets.map((row) =>
						row.id === action.id ? { id: row.id, state: { ...row.state, code: action.code } } : row
					)
				},
				Effect.none()
			];
		case 'remove':
			return [{ snippets: state.snippets.filter((row) => row.id !== action.id) }, Effect.none()];
		default:
			return [state, Effect.none()];
	}
};

export const highlightComposition = new ManagedIntegrationBuilder(root)
	.forEach(snippetsSlot, codeHighlightReducer)
	.build();

export function createHighlightRoot(dependencies: CodeHighlightDependencies) {
	return createStore({
		initialState: {
			snippets: [
				{ id: 'a', state: createInitialState({ code: 'const a = 1;' }) },
				{ id: 'b', state: createInitialState({ code: 'const b = 2;' }) }
			]
		} satisfies HighlightRoot,
		...highlightComposition,
		dependencies
	});
}
