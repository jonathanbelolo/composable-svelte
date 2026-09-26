import { Effect, type Reducer } from '@composable-svelte/core';
export interface Note { readonly id: string; readonly revision: number; readonly text: string }
export interface EditorState {
  readonly original: Note;
  readonly draft: string;
  readonly save: 'idle' | 'pending' | 'failed';
  readonly confirmDiscard: boolean;
}
export type EditorAction =
  | { type: 'change'; text: string } | { type: 'save' }
  | { type: 'saved'; note: Note } | { type: 'failed' }
  | { type: 'discard' } | { type: 'keepEditing' };
export interface EditorDependencies {
  save(note: Note, signal: AbortSignal | undefined): Promise<Note>;
}
export const newEditor = (note: Note): EditorState => ({ original: note, draft: note.text, save: 'idle', confirmDiscard: false });
export const isDirty = (state: EditorState): boolean => state.draft !== state.original.text;
export const editorReducer: Reducer<EditorState, EditorAction, EditorDependencies> = (state, action, deps) => {
  switch (action.type) {
    case 'change':
      return state.save === 'pending' ? [state, Effect.none()]
        : [{ ...state, draft: action.text, save: 'idle', confirmDiscard: false }, Effect.none()];
    case 'keepEditing':
      return [{ ...state, confirmDiscard: false }, Effect.none()];
    case 'save':
      if (state.save === 'pending') return [state, Effect.none()];
      return [{ ...state, save: 'pending', confirmDiscard: false }, Effect.cancellable('save', async (dispatch, signal) => {
        try {
          const note = await deps.save({ ...state.original, text: state.draft }, signal);
          if (note.id !== state.original.id || note.revision <= state.original.revision) throw new Error('Invalid save response');
          dispatch({ type: 'saved', note });
        } catch { dispatch({ type: 'failed' }); }
      })];
    case 'failed':
      return state.save === 'pending' ? [{ ...state, save: 'failed' }, Effect.none()] : [state, Effect.none()];
    // Parent owns the commit and removal; these arrive through the captured child.
    case 'saved':
    case 'discard':
      return [state, Effect.none()];
  }
};
