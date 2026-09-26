import ManagedDestinationCaseLeaf from './ManagedDestinationCaseLeaf.svelte';
import { defineApplication, defineViews } from '../../src/lib/application/index.js';
import { destinationSlot, ManagedIntegrationBuilder } from '../../src/lib/navigation/managed-integration.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';
import { Effect } from '../../src/lib/effect.js';
import type { Reducer } from '../../src/lib/types.js';

export interface HostedCounter { count: number }
export type HostedCounterAction = { type: 'inc' };
export interface HostedEditor { text: string }
export type HostedEditorAction = { type: 'write'; text: string };
const counter: Reducer<HostedCounter, HostedCounterAction, {}> = (state, action) => [
  action.type === 'inc' ? { count: state.count + 1 } : state,
  Effect.none()
];
const editor: Reducer<HostedEditor, HostedEditorAction, {}> = (state, action) => [
  action.type === 'write' ? { text: action.text } : state,
  Effect.none()
];
export const hostedDestination = createDestination({ counter, editor });
export interface HostedState {
  dest: typeof hostedDestination._types.State | null;
}
export type HostedAction =
  | { type: 'openCounter'; count: number }
  | { type: 'openEditor'; text: string }
  | { type: 'dest'; action: PresentationAction<typeof hostedDestination._types.Action> };
const root: Reducer<HostedState, HostedAction, {}> = (state, action) => {
  if (action.type === 'openCounter') return [{ dest: hostedDestination.initial('counter', { count: action.count }) }, Effect.none()];
  if (action.type === 'openEditor') return [{ dest: hostedDestination.initial('editor', { text: action.text }) }, Effect.none()];
  return [state, Effect.none()];
};
export const hostedSlot = destinationSlot<HostedState, HostedAction>()('dest', hostedDestination);
export const hostedComposition = new ManagedIntegrationBuilder(root)
  .with(hostedSlot, { replaceOn: action => action.type === 'openCounter' })
  .build();
export const hostedPlan = defineViews(hostedComposition, {
  dest: {
    cases: {
      counter: { render: ManagedDestinationCaseLeaf },
      editor: { render: ManagedDestinationCaseLeaf }
    }
  }
});
export const hostedApplication = defineApplication(hostedComposition, {
  initialState: (input: number): HostedState => ({ dest: hostedDestination.initial('counter', { count: input }) })
});
