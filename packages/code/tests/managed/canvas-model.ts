/**
 * A managed root of keyed `NodeCanvas` rows around the shipped reducer. The
 * parent WRAPS canvas actions (`{ type: 'canvases', id, action }`) and owns
 * same-named actions of its own; the canvas's managed view sees only its own
 * unwrapped `NodeCanvasAction`s, so no `unliftAction` is involved.
 */
import { createStore, Effect, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, keyedSlot } from '@composable-svelte/core/application';
import { nodeCanvasReducer } from '../../src/lib/node-canvas/reducer';
import {
	createInitialNodeCanvasState,
	type NodeCanvasAction,
	type NodeCanvasDependencies,
	type NodeCanvasState
} from '../../src/lib/node-canvas/types';

export interface CanvasRoot {
	canvases: Array<{ id: string; state: NodeCanvasState }>;
}
export type CanvasRootAction =
	| { type: 'canvases'; id: string; action: NodeCanvasAction }
	| { type: 'zoomIn' }
	| { type: 'setViewport'; to: string }
	| { type: 'remove'; id: string }
	| { type: 'sequence'; actions: CanvasRootAction[] };

export const canvasesSlot = keyedSlot<CanvasRoot, CanvasRootAction>()('canvases');

const root: Reducer<CanvasRoot, CanvasRootAction, NodeCanvasDependencies> = (state, action) => {
	switch (action.type) {
		case 'remove':
			return [{ canvases: state.canvases.filter((row) => row.id !== action.id) }, Effect.none()];
		case 'sequence':
			return [state, Effect.run<CanvasRootAction>((dispatch) => action.actions.forEach((next) => dispatch(next)))];
		default:
			return [state, Effect.none()];
	}
};

export const canvasComposition = new ManagedIntegrationBuilder(root)
	.forEach(canvasesSlot, nodeCanvasReducer)
	.build();

/** Two spread-out nodes, so a fit does not land on `maxZoom` and zooming is observable. */
export const canvasState = () =>
	createInitialNodeCanvasState({
		nodes: {
			a: { id: 'a', type: 'default', position: { x: 0, y: 0 }, data: { label: 'A' } },
			b: { id: 'b', type: 'default', position: { x: 400, y: 300 }, data: { label: 'B' } }
		}
	});

export function createCanvasRoot() {
	return createStore({
		initialState: {
			canvases: [
				{ id: 'one', state: canvasState() },
				{ id: 'two', state: canvasState() }
			]
		} satisfies CanvasRoot,
		...canvasComposition,
		dependencies: {}
	});
}

export const toCanvas = (id: string, action: NodeCanvasAction): CanvasRootAction => ({ type: 'canvases', id, action });
