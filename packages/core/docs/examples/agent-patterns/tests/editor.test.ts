import { afterEach, expect, it } from 'vitest';
import { createStore, Effect, type Reducer, type PresentationAction } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, optionalSlot } from '@composable-svelte/core/application';
import { composition, editorSlot, initialState, route, noteURL, reducer } from '../src/application';
import { editorReducer, newEditor, type EditorState, type EditorAction, type EditorDependencies, type Note } from '../src/editor';
import { emptyCollection, merge, type Collection, type Item } from '../src/collection';
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(clean => clean()));
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture(fail = false, comp = composition) {
  let resolve!: (note: Note) => void;
  let signal: AbortSignal | undefined;
  const dependencies: EditorDependencies = { save: (_note, incoming) => { signal = incoming; return fail ? Promise.reject(new Error('conflict')) : new Promise(yes => { resolve = yes; }); } };
  const store = createStore({ initialState: initialState('/notes/welcome'), ...comp, dependencies, ssr: { deferEffects: false } });
  cleanups.push(() => store.destroy()); store.dispatch({ type: 'edit' });
  const view = comp.bind(store, editorSlot)!;
  return { store, view, resolve: (note: Note) => resolve(note), signal: () => signal };
}
it('dirty dismissal requires authorization; repeated requests never discard', () => {
  const { store, view } = fixture(); view.dispatch({ type: 'change', text: 'draft' }); view.dismiss(); view.dismiss();
  expect(store.state.editor?.confirmDiscard).toBe(true); expect(store.state.editor?.draft).toBe('draft');
  view.dispatch({ type: 'keepEditing' }); expect(store.state.editor?.confirmDiscard).toBe(false);
  view.dismiss(); view.dispatch({ type: 'discard' }); expect(store.state.editor).toBeNull();
});
it('pending save vetoes dismissal and commits the server result', async () => {
  const { store, view, resolve } = fixture(); view.dispatch({ type: 'change', text: 'draft' }); view.dispatch({ type: 'save' }); view.dismiss();
  expect(store.state.editor?.save).toBe('pending');
  resolve({ id: 'welcome', revision: 2, text: 'server normalized' }); await flush();
  expect(store.state.editor).toBeNull(); expect(store.state.note.text).toBe('server normalized');
});
it('failure retains draft and permits retry or dismissal', async () => {
  const { store, view } = fixture(true); view.dispatch({ type: 'change', text: 'draft' }); view.dispatch({ type: 'save' }); await flush();
  expect(store.state.editor).toMatchObject({ draft: 'draft', save: 'failed' });
  view.dismiss(); expect(store.state.editor?.confirmDiscard).toBe(true);
});
it('navigation cancels save; late completion cannot mutate a same-ID successor', async () => {
  const { store, view, resolve, signal } = fixture(); view.dispatch({ type: 'save' });
  store.dispatch({ type: 'navigate', id: null }); store.dispatch({ type: 'navigate', id: 'welcome' }); store.dispatch({ type: 'edit' });
  const successor = store.state.editor;
  expect(signal()?.aborted).toBe(true);
  resolve({ id: 'welcome', revision: 2, text: 'obsolete' }); await flush();
  expect(store.state.editor).toBe(successor); expect(store.state.note.revision).toBe(1);
  view.dispatch({ type: 'change', text: 'stale handle' }); view.dismiss();
  expect(store.state.editor).toBe(successor);
});
it('explicit same-ID replacement retires the prior view without confusing ordinary edits with replacement', () => {
  const { store, view } = fixture(); view.dispatch({ type: 'change', text: 'first' });
  expect(view.state?.draft).toBe('first'); store.dispatch({ type: 'edit' }); const next = store.state.editor;
  view.dispatch({ type: 'change', text: 'late' }); expect(store.state.editor).toBe(next);
});
it('sibling editors with the same local save key run independently', async () => {
  type S = { left: EditorState | null; right: EditorState | null };
  type A = { type: 'left'; action: PresentationAction<EditorAction> } | { type: 'right'; action: PresentationAction<EditorAction> };
  const reducer: Reducer<S, A, EditorDependencies> = state => [state, Effect.none()];
  const left = optionalSlot<S, A>()('left'); const right = optionalSlot<S, A>()('right');
  const pair = new ManagedIntegrationBuilder(reducer).with(left, editorReducer).with(right, editorReducer).build();
  const signals: (AbortSignal | undefined)[] = [];
  const finishes: ((note: Note) => void)[] = [];
  const store = createStore({ initialState: { left: newEditor({ id: 'same', text: '', revision: 1 }), right: newEditor({ id: 'same', text: '', revision: 1 }) }, ...pair,
    dependencies: { save: (_note: Note, signal: AbortSignal | undefined) => { signals.push(signal); return new Promise<Note>(resolve => finishes.push(resolve)); } } });
  cleanups.push(() => store.destroy()); const a = pair.bind(store, left)!; const b = pair.bind(store, right)!;
  a.dispatch({ type: 'save' }); b.dispatch({ type: 'save' }); expect(signals.every(s => !s?.aborted)).toBe(true);
  a.dismiss(); expect(signals[0]?.aborted).toBe(true); expect(signals[1]?.aborted).toBe(false);
  finishes.forEach(resolve => resolve({ id: 'same', revision: 2, text: 'done' })); await flush();
  expect(store.state.right).not.toBeNull();
});
it.each(['/notes/a%20b', '/notes', '/unrelated', '/notes/%ZZ'])('routing round trips and shares initial-state decisions: %s', url => {
  const decision = route(url); expect(initialState(url).selectedId).toBe(decision.action.id);
  expect(decision.expectedURL).toBe(noteURL(decision.action.id));
  expect(route(decision.expectedURL)).toEqual(decision);
});

it('background refresh preserves draft and original revision for conflict detection', async () => {
  type S = { collection: Collection; editor: EditorState | null };
  type A = { type: 'refresh'; items: readonly Item[] } | { type: 'editor'; action: PresentationAction<EditorAction> };
  const reducer: Reducer<S, A, EditorDependencies> = (state, action) => [action.type === 'refresh'
    ? { ...state, collection: merge(state.collection, action.items) } : state, Effect.none()];
  const slot = optionalSlot<S, A>()('editor');
  const feature = new ManagedIntegrationBuilder(reducer).with(slot, editorReducer).build();
  const original = { id: 'a', text: 'original', revision: 1, flagged: false };
  let sent: Note | undefined;
  const store = createStore({ initialState: { collection: merge(emptyCollection(), [original]), editor: newEditor(original) }, ...feature,
    dependencies: { save: async (note: Note) => { sent = note; throw new Error('Revision conflict'); } } });
  cleanups.push(() => store.destroy()); const view = feature.bind(store, slot)!;
  view.dispatch({ type: 'change', text: 'local draft' });
  store.dispatch({ type: 'refresh', items: [{ ...original, revision: 2, text: 'remote edit' }] });
  expect(store.state.collection.entities.a!.revision).toBe(2);
  expect(view.state?.draft).toBe('local draft');
  view.dispatch({ type: 'save' }); await flush();
  expect(sent).toMatchObject({ id: 'a', revision: 1, text: 'local draft' });
  expect(view.state).toMatchObject({ draft: 'local draft', save: 'failed' });
});

it('a rejected open preserves the pending owner', async () => {
  const { store, view, resolve, signal } = fixture();
  view.dispatch({ type: 'change', text: 'draft' });
  view.dispatch({ type: 'save' });
  expect(signal()).toBeDefined();
  expect(signal()?.aborted).toBe(false);
  const pendingEditor = store.state.editor;
  store.dispatch({ type: 'edit' });
  expect(store.state.editor).toBe(pendingEditor);
  expect(signal()?.aborted).toBe(false);
  resolve({ id: 'welcome', revision: 2, text: 'server normalized' });
  await flush();
  expect(store.state.editor).toBeNull();
  expect(store.state.note.revision).toBe(2);

  const unguarded = new ManagedIntegrationBuilder(reducer).with(editorSlot, editorReducer, {
    dismissal: 'deferred',
    replaceOn: action => action.type === 'edit',
  }).build();
  const control = fixture(false, unguarded);
  control.view.dispatch({ type: 'change', text: 'draft' });
  control.view.dispatch({ type: 'save' });
  expect(control.signal()).toBeDefined();
  expect(control.signal()?.aborted).toBe(false);
  control.store.dispatch({ type: 'edit' });
  expect(control.signal()?.aborted).toBe(true);
  control.resolve({ id: 'welcome', revision: 2, text: 'server normalized' });
  await flush();
  expect(control.store.state.note.revision).toBe(1);
});

it('an idle saved is not a completion', async () => {
  const { store, view, resolve, signal } = fixture();
  view.dispatch({ type: 'change', text: 'draft' });
  const note = store.state.note;
  const editor = store.state.editor;
  view.dispatch({ type: 'saved', note: { id: 'welcome', revision: 2, text: 'forged' } });
  expect(store.state.note).toBe(note);
  expect(store.state.editor).toBe(editor);
  view.dispatch({ type: 'save' });
  expect(signal()).toBeDefined();
  expect(signal()?.aborted).toBe(false);
  resolve({ id: 'welcome', revision: 2, text: 'genuine server text' });
  await flush();
  expect(store.state.editor).toBeNull();
  expect(store.state.note.text).toBe('genuine server text');
});
