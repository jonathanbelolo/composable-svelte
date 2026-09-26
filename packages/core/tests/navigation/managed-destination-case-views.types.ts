import type { Component, Snippet } from 'svelte';
import { defineViews, type FeatureViewProps } from '../../src/lib/application/view-definition.js';
import type { ViewHandles, FeatureView } from '../../src/lib/application/view-binding.js';
import {
    destinationSlot,
    optionalSlot,
    ManagedIntegrationBuilder
} from '../../src/lib/navigation/managed-integration.js';
import type { PresentationAction, DestinationState, DestinationAction } from '../../src/lib/navigation/types.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import { Effect } from '../../src/lib/effect.js';
import type { Reducer } from '../../src/lib/types.js';

interface CounterState { count: number; }
type CounterAction = { type: 'inc' };
const counterReducer: Reducer<CounterState, CounterAction, any> = (state) => [state, Effect.none()];

interface EditorState { text: string; }
type EditorAction = { type: 'write'; text: string };
const editorReducer: Reducer<EditorState, EditorAction, any> = (state) => [state, Effect.none()];

const destination = createDestination({
    counter: counterReducer,
    editor: editorReducer
});

interface RootState {
    dest: { type: 'counter'; state: CounterState } | { type: 'editor'; state: EditorState } | null;
    panel: { flag: boolean } | null;
}
type RootAction =
    | { type: 'dest'; action: PresentationAction<
          | { type: 'counter'; action: CounterAction }
          | { type: 'editor'; action: EditorAction }
      > }
    | { type: 'panel'; action: PresentationAction<{ type: 'toggle' }> };

const rootReducer: Reducer<RootState, RootAction, any> = s => [s, Effect.none()];
const destSlot = destinationSlot<RootState, RootAction>()('dest', destination);
const panelSlot = optionalSlot<RootState, RootAction>()('panel');
const composition = new ManagedIntegrationBuilder(rootReducer)
    .with(destSlot)
    .with(panelSlot, ((s: any) => [s, Effect.none()]) as any)
    .build();

declare const CounterComp: Component<FeatureViewProps<CounterState, CounterAction>>;
declare const EditorSnip: Snippet<[FeatureViewProps<EditorState, EditorAction>]>;
declare const WrongComp: Component<FeatureViewProps<CounterState, { type: 'wrong' }>>;

const valid1 = defineViews(composition, {
    dest: { cases: { counter: { render: CounterComp }, editor: { content: EditorSnip } } },
    panel: { headless: true }
});
const valid2 = defineViews(composition, {
    dest: { headless: true },
    panel: { headless: true }
});
const valid3 = defineViews(composition, {
    dest: { cases: { counter: { headless: true }, editor: { content: EditorSnip } } },
    panel: { headless: true }
});
void valid1; void valid2; void valid3;

// @ts-expect-error missing editor case
defineViews(composition, { dest: { cases: { counter: { render: CounterComp } } }, panel: { headless: true } });
// @ts-expect-error extra case key
defineViews(composition, { dest: { cases: { counter: { render: CounterComp }, editor: { content: EditorSnip }, extra: { headless: true } } }, panel: { headless: true } });
// @ts-expect-error entry-level render forbidden on destination slot
defineViews(composition, { dest: { render: CounterComp }, panel: { headless: true } });
// @ts-expect-error entry-level content forbidden on destination slot
defineViews(composition, { dest: { content: EditorSnip }, panel: { headless: true } });
// @ts-expect-error entry-level children forbidden on destination slot
defineViews(composition, { dest: { children: {} as any }, panel: { headless: true } });
// @ts-expect-error mixed headless and cases forbidden on destination slot
defineViews(composition, { dest: { headless: true, cases: { counter: { render: CounterComp }, editor: { content: EditorSnip } } }, panel: { headless: true } });
// @ts-expect-error per-case children forbidden
defineViews(composition, { dest: { cases: { counter: { render: CounterComp, children: {} as any }, editor: { content: EditorSnip } } }, panel: { headless: true } });
// @ts-expect-error per-case cases forbidden
defineViews(composition, { dest: { cases: { counter: { render: CounterComp, cases: {} as any }, editor: { content: EditorSnip } } }, panel: { headless: true } });
// @ts-expect-error per-case both headless and render forbidden
defineViews(composition, { dest: { cases: { counter: { render: CounterComp, headless: true }, editor: { content: EditorSnip } } }, panel: { headless: true } });
// @ts-expect-error incompatible component action
defineViews(composition, { dest: { cases: { counter: { render: WrongComp }, editor: { content: EditorSnip } } }, panel: { headless: true } });
// @ts-expect-error non-destination slot cannot declare cases
defineViews(composition, { dest: { headless: true }, panel: { cases: { a: { headless: true } } } });
