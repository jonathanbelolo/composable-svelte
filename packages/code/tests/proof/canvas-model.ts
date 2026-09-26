/**
 * B1 NodeCanvas feasibility, Option A: the shipped `nodeCanvasReducer` with its
 * four no-op viewport commands carried in a state queue instead. Two keyed
 * canvases, so every command reaches its canvas through a WRAPPED parent action
 * (`{ type: 'canvases', id, action }`) and no `unliftAction` exists anywhere.
 * TEST-ONLY.
 */
import { Effect, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, keyedSlot } from '@composable-svelte/core/application';
import { nodeCanvasReducer } from '../../src/lib/node-canvas/reducer';
import {
	createInitialNodeCanvasState,
	type NodeCanvasAction,
	type NodeCanvasDependencies,
	type NodeCanvasState
} from '../../src/lib/node-canvas/types';
import { acknowledgeCommands, emptyCommandQueue, enqueueCommands, type CommandAck, type CommandQueue } from './command-queue';

export type ViewportCommand = Extract<NodeCanvasAction, { type: 'zoomIn' | 'zoomOut' | 'fitView' | 'centerView' }>;
export type ACanvasState = NodeCanvasState & { readonly viewportCommands: CommandQueue<ViewportCommand>; readonly label: string };
export type ACanvasAction = NodeCanvasAction | CommandAck<ViewportCommand>;

const isViewportCommand = (action: ACanvasAction): action is ViewportCommand =>
	action.type === 'zoomIn' || action.type === 'zoomOut' || action.type === 'fitView' || action.type === 'centerView';

export const aCanvasReducer: Reducer<ACanvasState, ACanvasAction, NodeCanvasDependencies> = (state, action, deps) => {
	if (isViewportCommand(action)) {
		return [{ ...state, viewportCommands: enqueueCommands(state.viewportCommands, [action], 16) }, Effect.none()];
	}
	if (action.type === 'commandsAcknowledged') {
		const queue = acknowledgeCommands(state.viewportCommands, action);
		return [queue === state.viewportCommands ? state : { ...state, viewportCommands: queue }, Effect.none()];
	}
	const [next, effect] = nodeCanvasReducer(state, action, deps);
	return [next === state ? state : { ...state, ...next }, effect];
};

export interface CanvasRoot {
	canvases: Array<{ id: string; state: ACanvasState }>;
}
export type CanvasRootAction = { type: 'canvases'; id: string; action: ACanvasAction };

export const canvasesSlot = keyedSlot<CanvasRoot, CanvasRootAction>()('canvases');
export const aCanvasComposition = new ManagedIntegrationBuilder<CanvasRoot, CanvasRootAction, NodeCanvasDependencies>((s) => [s, Effect.none()])
	.forEach(canvasesSlot, aCanvasReducer)
	.build();

export const canvasNodes = () =>
	createInitialNodeCanvasState({
		nodes: {
			a: { id: 'a', type: 'default', position: { x: 0, y: 0 }, data: { label: 'A' } },
			b: { id: 'b', type: 'default', position: { x: 400, y: 300 }, data: { label: 'B' } }
		}
	});

export const initialCanvasRoot = (): CanvasRoot => ({
	canvases: ['a', 'b'].map((id) => ({ id, state: { ...canvasNodes(), viewportCommands: emptyCommandQueue<ViewportCommand>(), label: id } }))
});
