// Everything from the INSTALLED tarballs: no workspace link, no source alias.
import { createStore, Effect, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, keyedSlot } from '@composable-svelte/core/application';
import {
	codeEditorReducer,
	codeHighlightReducer,
	nodeCanvasReducer,
	createInitialCodeEditorState,
	createInitialCodeHighlightState,
	createInitialNodeCanvasState,
	type CodeEditorAction,
	type CodeEditorState,
	type CodeHighlightAction,
	type CodeHighlightState,
	type NodeCanvasAction,
	type NodeCanvasState
} from '@composable-svelte/code';

export interface Root {
	editors: Array<{ id: string; state: CodeEditorState }>;
	snippets: Array<{ id: string; state: CodeHighlightState }>;
	canvases: Array<{ id: string; state: NodeCanvasState }>;
}
export type RootAction =
	| { type: 'editors'; id: string; action: CodeEditorAction }
	| { type: 'snippets'; id: string; action: CodeHighlightAction }
	| { type: 'canvases'; id: string; action: NodeCanvasAction }
	| { type: 'sequence'; actions: RootAction[] };

export const editors = keyedSlot<Root, RootAction>()('editors');
export const snippets = keyedSlot<Root, RootAction>()('snippets');
export const canvases = keyedSlot<Root, RootAction>()('canvases');

const root: Reducer<Root, RootAction, any> = (state, action) =>
	action.type === 'sequence'
		? [state, Effect.run<RootAction>((dispatch) => action.actions.forEach((next) => dispatch(next)))]
		: [state, Effect.none()];

export const composition = new ManagedIntegrationBuilder(root)
	.forEach(editors, codeEditorReducer)
	.forEach(snippets, codeHighlightReducer)
	.forEach(canvases, nodeCanvasReducer)
	.build();

export const createRoot = () =>
	createStore({
		initialState: {
			editors: [{ id: 'e', state: createInitialCodeEditorState({ value: 'A' }) }],
			snippets: [{ id: 's', state: createInitialCodeHighlightState({ code: 'const x = 1;' }) }],
			canvases: [
				{
					id: 'c',
					state: createInitialNodeCanvasState({
						nodes: {
							a: { id: 'a', type: 'default', position: { x: 0, y: 0 }, data: { label: 'A' } },
							b: { id: 'b', type: 'default', position: { x: 400, y: 300 }, data: { label: 'B' } }
						}
					})
				}
			]
		} satisfies Root,
		...composition,
		dependencies: { highlightCode: async (code: string) => `<b>${code}</b>` }
	});
