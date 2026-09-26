/**
 * B1 proof: a managed root with two sibling editors (keyed) and one optional
 * editor panel, composed only through core 0.13's public `application` entry.
 */

import { Effect, type PresentationAction, type Reducer } from '@composable-svelte/core';
import {
	ManagedIntegrationBuilder,
	keyedSlot,
	optionalSlot,
	type ChildView
} from '@composable-svelte/core/application';
import type { CodeEditorDependencies } from '../../src/lib/code-editor/code-editor.types';
import type { CommandQueueOptions } from './command-queue';
import {
	createProofEditorState,
	proofEditorReducer,
	type EditorCommand,
	type ProofEditorAction,
	type ProofEditorState
} from './editor-command-queue';

export interface ProofRoot {
	editors: Array<{ id: string; state: ProofEditorState }>;
	panel: ProofEditorState | null;
}

export type ProofRootAction =
	| { type: 'editors'; id: string; action: ProofEditorAction }
	| { type: 'panel'; action: PresentationAction<ProofEditorAction> }
	/** Same-ID replacement (`replaceOn`). `keepState` carries the old queue to the successor. */
	| { type: 'replaceEditor'; id: string; keepState: boolean }
	/** Same key, same owner, fresh state: NOT a replacement. The review's lost-command case. */
	| { type: 'resetEditor'; id: string }
	/** Dispatch these in order from one effect, so they share one drain. */
	| { type: 'sequence'; actions: ProofRootAction[] }
	| { type: 'openPanel' }
	| { type: 'closePanel' };

export const editorsSlot = keyedSlot<ProofRoot, ProofRootAction>()('editors');
export const panelSlot = optionalSlot<ProofRoot, ProofRootAction>()('panel');

const freshRow = (id: string) => ({ id, state: createProofEditorState(id, { value: 'fresh' }) });

const root: Reducer<ProofRoot, ProofRootAction, CodeEditorDependencies> = (state, action) => {
	switch (action.type) {
		case 'replaceEditor':
			if (action.keepState) return [state, Effect.none()];
			return [{ ...state, editors: state.editors.map((row) => (row.id === action.id ? freshRow(row.id) : row)) }, Effect.none()];
		case 'resetEditor':
			return [{ ...state, editors: state.editors.map((row) => (row.id === action.id ? freshRow(row.id) : row)) }, Effect.none()];
		case 'sequence':
			return [state, Effect.run<ProofRootAction>((dispatch) => action.actions.forEach((next) => dispatch(next)))];
		case 'openPanel':
			return state.panel ? [state, Effect.none()] : [{ ...state, panel: createProofEditorState('panel') }, Effect.none()];
		case 'closePanel':
			return [{ ...state, panel: null }, Effect.none()];
		default:
			return [state, Effect.none()];
	}
};

export function createProofComposition(capacity?: number) {
	const child = proofEditorReducer(capacity);
	return new ManagedIntegrationBuilder(root)
		.forEach(editorsSlot, child, {
			replaceOn: (action, id) => action.type === 'replaceEditor' && action.id === id
		})
		.with(panelSlot, child)
		.build();
}

export const composition = createProofComposition();

export function initialProofRoot(): ProofRoot {
	return {
		editors: [
			{ id: 'a', state: createProofEditorState('a', { value: 'A' }) },
			{ id: 'b', state: createProofEditorState('b', { value: 'B' }) }
		],
		panel: null
	};
}

// ---- Test instrumentation (module-level, reset per test) ----

/** Ordered event log: mount/attach/exec/destroy per attachment. */
export const log: string[] = [];
/** Every view a rendered probe captured at mount, in mount order. */
export const captured: ChildView<ProofEditorState, ProofEditorAction>[] = [];
/** Queue options for probes mounted after it is set. Default: the binding's default (`drop`). */
export const proofConfig: { options: Omit<CommandQueueOptions<ProofEditorState, EditorCommand>, 'beforeCommands'> } = { options: {} };
/** When set, native view creation awaits this before building the EditorView. */
export const creationGate: { hold: Promise<void> | null } = { hold: null };
/** Coalescing probe instrumentation. */
export const effectTrace: { runs: number; consumed: number[]; lastSeen: Array<number | undefined> } = {
	runs: 0,
	consumed: [],
	lastSeen: []
};

let attachmentSequence = 0;
export function nextAttachment(label: string): string {
	attachmentSequence += 1;
	return `${label}#${attachmentSequence}`;
}

export function resetProofInstrumentation(): void {
	log.length = 0;
	captured.length = 0;
	proofConfig.options = {};
	creationGate.hold = null;
	effectTrace.runs = 0;
	effectTrace.consumed.length = 0;
	effectTrace.lastSeen.length = 0;
	attachmentSequence = 0;
}
