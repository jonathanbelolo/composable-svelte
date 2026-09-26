import { Effect, type PresentationAction, type Reducer } from '@composable-svelte/core';
import { defineApplication, ManagedIntegrationBuilder, optionalSlot } from '@composable-svelte/core/application';
import { editorReducer, isDirty, newEditor, type Note, type EditorAction, type EditorState, type EditorDependencies } from './editor';
export interface State { readonly selectedId: string | null; readonly note: Note; readonly editor: EditorState | null }
export type Action = { type: 'navigate'; id: string | null } | { type: 'edit' }
  | { type: 'editor'; action: PresentationAction<EditorAction> };
export const noteURL = (id: string | null): string => id === null ? '/notes' : `/notes/${encodeURIComponent(id)}`;
export function route(url: string): { action: Extract<Action, { type: 'navigate' }>; expectedURL: string } {
  let id: string | null = null;
  try {
    const match = /^\/notes\/([^/]+)$/.exec(new URL(url, 'https://notes.invalid').pathname);
    if (match) id = decodeURIComponent(match[1]!);
  } catch { /* malformed input canonicalizes to the index */ }
  return { action: { type: 'navigate', id }, expectedURL: noteURL(id) };
}
export const initialState = (url: string): State => ({ selectedId: route(url).action.id,
  note: { id: 'welcome', revision: 1, text: 'A notebook example.' }, editor: null });
export const reducer: Reducer<State, Action, EditorDependencies> = (state, action) => {
  switch (action.type) {
    case 'navigate':
      return action.id === state.selectedId ? [state, Effect.none()]
        : [{ ...state, selectedId: action.id, editor: null }, Effect.none()];
    case 'edit':
      return state.selectedId === state.note.id && state.editor?.save !== 'pending'
        ? [{ ...state, editor: newEditor(state.note) }, Effect.none()] : [state, Effect.none()];
    case 'editor': {
      const editor = state.editor;
      if (!editor) return [state, Effect.none()];
      if (action.action.type === 'dismiss') {
        if (editor.save === 'pending') return [state, Effect.none()];
        return [{ ...state, editor: isDirty(editor) ? { ...editor, confirmDiscard: true } : null }, Effect.none()];
      }
      const child = action.action.action;
      if (child.type === 'discard' && editor.confirmDiscard && editor.save !== 'pending') {
        return [{ ...state, editor: null }, Effect.none()];
      }
      if (child.type === 'saved' && editor.save === 'pending' && child.note.id === editor.original.id
        && child.note.revision > editor.original.revision) {
        return [{ ...state, note: child.note, editor: null }, Effect.none()];
      }
      return [state, Effect.none()];
    }
  }
};
export const editorSlot = optionalSlot<State, Action>()('editor');
export const composition = new ManagedIntegrationBuilder(reducer).with(editorSlot, editorReducer, {
  dismissal: 'deferred',
  replaceOn: (action, before, after) => action.type === 'edit' && before.editor !== after.editor
}).build();
export const application = defineApplication(composition, {
  initialState,
  routing: { fragment: 'native', serialize: state => noteURL(state.selectedId), request: route }
});
