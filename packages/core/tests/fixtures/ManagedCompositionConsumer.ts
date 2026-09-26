/** Generic demonstration only: business decisions, content, and typed assembly. */
import { integrate } from '../../src/lib/navigation/integrate.js';
import { optionalSlot } from '../../src/lib/navigation/managed-integration.js';
import { createStore } from '../../src/lib/store.svelte.js';
import { Effect } from '../../src/lib/effect.js';
import type { Reducer } from '../../src/lib/types.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';

type Draft = { title: string };
type DraftAction = { type: 'rename'; title: string };
type Workspace = { draft: Draft | null; publishedTitle: string };
type WorkspaceAction =
  | { type: 'openDraft' }
  | { type: 'publish' }
  | { type: 'draft'; action: PresentationAction<DraftAction> };

const draftReducer: Reducer<Draft, DraftAction> = (state, action) => [
  action.type === 'rename' ? { ...state, title: action.title } : state,
  Effect.none()
];
const workspaceReducer: Reducer<Workspace, WorkspaceAction> = (state, action) => {
  if (action.type === 'openDraft') return [{ ...state, draft: { title: '' } }, Effect.none()];
  if (action.type === 'publish' && state.draft) {
    return [{ draft: null, publishedTitle: state.draft.title }, Effect.none()];
  }
  return [state, Effect.none()];
};
export const draftSlot = optionalSlot<Workspace, WorkspaceAction>()('draft');
export const workspace = integrate(workspaceReducer).managed().with(draftSlot, draftReducer).build();
export function createDemonstrationWorkspace() {
  return createStore({ initialState: { draft: null, publishedTitle: '' }, ...workspace });
}
