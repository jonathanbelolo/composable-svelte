/**
 * B1 proof, Option A: CodeEditor's seven imperative commands carried in state
 * through the generic queue in `command-queue.ts`. TEST-ONLY PROTOTYPE.
 *
 * The shipped `codeEditorReducer` returns the identical state for a command.
 * Here a command appends to `commands` instead, and every other action is
 * delegated to the shipped reducer unchanged.
 */

import { Effect, type Reducer } from '@composable-svelte/core';
import {
	createInitialState,
	type CodeEditorAction,
	type CodeEditorDependencies,
	type CodeEditorState
} from '../../src/lib/code-editor/code-editor.types';
import { codeEditorReducer } from '../../src/lib/code-editor/code-editor.reducer';
import {
	DEFAULT_COMMAND_CAPACITY,
	acknowledgeCommands,
	emptyCommandQueue,
	enqueueCommands,
	type CommandAck,
	type CommandQueue
} from './command-queue';

/** The seven actions the view performs rather than reduces. */
export type EditorCommand = Extract<
	CodeEditorAction,
	{ type: 'undo' | 'redo' | 'focus' | 'blur' | 'insertText' | 'deleteSelection' | 'selectAll' }
>;

/** Proof-only business action: one reduction that queues several commands plus an effect follow-up. */
export type SnippetAction = { type: 'snippetRequested'; text: string };
/** Proof-only: a value write and a command from one business event, as two turns of one drain. */
export type LoadThenInsertAction = { type: 'loadThenInsert'; value: string; text: string };

export type ProofEditorState = CodeEditorState & {
	readonly commands: CommandQueue<EditorCommand>;
	readonly label: string;
};
export type ProofEditorAction = CodeEditorAction | CommandAck<EditorCommand> | SnippetAction | LoadThenInsertAction;

export function isEditorCommand(action: ProofEditorAction): action is EditorCommand {
	switch (action.type) {
		case 'undo':
		case 'redo':
		case 'focus':
		case 'blur':
		case 'insertText':
		case 'deleteSelection':
		case 'selectAll':
			return true;
		default:
			return false;
	}
}

/** Focus/blur are about "now"; replaying them after a late attach steals focus. */
export const replayableEditorCommand = (command: EditorCommand) => command.type !== 'focus' && command.type !== 'blur';

const withCommands = (state: ProofEditorState, commands: CommandQueue<EditorCommand>): ProofEditorState =>
	commands === state.commands ? state : { ...state, commands };

export function proofEditorReducer(
	capacity: number = DEFAULT_COMMAND_CAPACITY
): Reducer<ProofEditorState, ProofEditorAction, CodeEditorDependencies> {
	return (state, action, deps) => {
		if (isEditorCommand(action)) return [withCommands(state, enqueueCommands(state.commands, [action], capacity)), Effect.none()];
		switch (action.type) {
			case 'commandsAcknowledged':
				return [withCommands(state, acknowledgeCommands(state.commands, action)), Effect.none()];
			case 'snippetRequested':
				return [
					withCommands(state, enqueueCommands(state.commands, [{ type: 'insertText', text: action.text }, { type: 'focus' }], capacity)),
					Effect.run<ProofEditorAction>((dispatch) => dispatch({ type: 'selectAll' }))
				];
			case 'loadThenInsert':
				return [
					state,
					Effect.run<ProofEditorAction>((dispatch) => {
						dispatch({ type: 'valueChanged', value: action.value });
						dispatch({ type: 'insertText', text: action.text });
					})
				];
			default: {
				const [next, effect] = codeEditorReducer(state, action, deps);
				return [next === state ? state : { ...state, ...next }, effect];
			}
		}
	};
}

export function createProofEditorState(
	label: string,
	config: { value?: string; readOnly?: boolean } = {}
): ProofEditorState {
	return { ...createInitialState(config), commands: emptyCommandQueue<EditorCommand>(), label };
}
