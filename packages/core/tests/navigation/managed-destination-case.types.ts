/** Compile-only C2 contract; never invoked. */
import { Effect } from '../../src/lib/effect.js';
import type { Reducer } from '../../src/lib/types.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import type { DestinationState, DestinationAction, PresentationAction } from '../../src/lib/navigation/types.js';
import { destinationSlot, ManagedIntegrationBuilder, type ManagedComposition, type SlotHandle } from '../../src/lib/navigation/managed-integration.js';
import * as RootPublic from '../../src/lib/index.js';
import * as ApplicationPublic from '../../src/lib/application/index.js';
import * as NavigationPublic from '../../src/lib/navigation/index.js';

export function destinationCaseTypeContract() {
    const first: Reducer<{ count: number }, { type: 'increment' }, {}> = state => [state, Effect.none()];
    const second: Reducer<{ text: string }, { type: 'rename'; text: string }, {}> = state => [state, Effect.none()];
    const routes = { first, second };
    const destination = createDestination(routes);
    type State = { destination: DestinationState<typeof routes> | null; count: number };
    type Action = { type: 'destination'; action: PresentationAction<DestinationAction<typeof routes>> } | { type: 'clear' };
    const slot = destinationSlot<State, Action>()('destination', destination);
    const firstHandle: SlotHandle<State, Action, { count: number }, { type: 'increment' }> = slot.case('first');
    const secondHandle: SlotHandle<State, Action, { text: string }, { type: 'rename'; text: string }> = slot.case('second');
    firstHandle.wrap({ type: 'increment' });
    secondHandle.wrap({ type: 'rename', text: 'ok' });
    // @ts-expect-error Case keys come only from the destination catalog.
    slot.case('missing');
    // @ts-expect-error A first-case view cannot dispatch a second-case action.
    firstHandle.wrap({ type: 'rename', text: 'no' });
    // @ts-expect-error Nonnullable unrelated fields cannot be destination slots.
    destinationSlot<State, Action>()('count', destination);
    type WrongState = { destination: { type: 'first'; state: { count: string } } | null };
    // @ts-expect-error Destination state union must exactly match the declared parent field.
    destinationSlot<WrongState, Action>()('destination', destination);
    type WrongAction = { type: 'destination'; action: PresentationAction<{ type: 'first'; action: { type: 'wrong' } }> };
    // @ts-expect-error Destination action union must exactly match the declared parent route.
    destinationSlot<State, WrongAction>()('destination', destination);
    const reducer: Reducer<State, Action, {}> = state => [state, Effect.none()];
    const builder = new ManagedIntegrationBuilder(reducer);
    builder.with(slot, {
        onCreate(value) {
            if (value.type === 'first') value.state.count.toFixed();
            else value.state.text.toUpperCase();
            return Effect.run(dispatch => dispatch({ type: 'first', action: { type: 'increment' } }));
        },
        startup: () => ({ type: 'second', action: { type: 'rename', text: 'ready' } })
    });
    // @ts-expect-error Destination registration cannot accept an extra reducer.
    new ManagedIntegrationBuilder(reducer).with(slot, first);
    // @ts-expect-error Destination registration has two arguments, never three.
    new ManagedIntegrationBuilder(reducer).with(slot, {}, {});
    // @ts-expect-error Inline policy typos must not be admitted by const inference.
    new ManagedIntegrationBuilder(reducer).with(slot, { startup: () => undefined, startupp: () => undefined });
    // @ts-expect-error Startup action must belong to the selected destination catalog.
    new ManagedIntegrationBuilder(reducer).with(slot, { startup: () => ({ type: 'second', action: { type: 'increment' } }) });
    const typedComposition = new ManagedIntegrationBuilder(reducer).with(slot, {}).build();
    type Catalog = typeof typedComposition extends ManagedComposition<any, any, any, infer C> ? C : never;
    const firstState: Catalog['destination']['cases']['first']['state'] = { count: 1 };
    const firstAction: Catalog['destination']['cases']['first']['action'] = { type: 'increment' };
    firstState.count.toFixed();
    firstAction.type satisfies 'increment';
    // @ts-expect-error Catalog state is not widened to an arbitrary value.
    const wrongCatalogState: Catalog['destination']['cases']['first']['state'] = { count: 'wrong' };
    // @ts-expect-error Catalog action remains the exact first-case action.
    const wrongCatalogAction: Catalog['destination']['cases']['first']['action'] = { type: 'rename', text: 'wrong' };
    void wrongCatalogState; void wrongCatalogAction;
    // @ts-expect-error Destination catalog preserves exact case keys.
    type MissingCase = Catalog['destination']['cases']['missing'];
    // @ts-expect-error C4 keeps destination construction absent from the package root.
    RootPublic.destinationSlot;
    ApplicationPublic.destinationSlot satisfies typeof destinationSlot;
    // @ts-expect-error C4 keeps destination construction absent from the navigation entry.
    NavigationPublic.destinationSlot;
    return { firstHandle, secondHandle };
}
