/** Compile-only C4 atomic public transition contract. */
import {
  destinationSlot,
  optionalSlot,
  ManagedIntegrationBuilder,
  type DestinationSlot,
  type DestinationSlotSchema,
  type CaseSchema
} from '../../src/lib/application/index.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';
import type { Reducer } from '../../src/lib/types.js';
import { Effect } from '../../src/lib/effect.js';
import * as RootPublic from '../../src/lib/index.js';
import * as NavigationPublic from '../../src/lib/navigation/index.js';

type Counter = { count: number };
type CounterAction = { type: 'increment' };
const counter: Reducer<Counter, CounterAction> = state => [state, Effect.none()];
const reducers = { counter };
const Destination = createDestination(reducers);
type DestinationState = typeof Destination._types.State;
type DestinationAction = typeof Destination._types.Action;
type State = { destination: DestinationState | null };
type Action = { type: 'destination'; action: PresentationAction<DestinationAction> };
const reducer: Reducer<State, Action> = state => [state, Effect.none()];

const slot = destinationSlot<State, Action>()('destination', Destination);
const publicSlot: DestinationSlot<State, Action, typeof reducers, 'destination'> = slot;
type PublicSchema = DestinationSlotSchema<typeof reducers>;
const schemaCase: CaseSchema<Counter, CounterAction> = null as unknown as PublicSchema['cases']['counter'];
new ManagedIntegrationBuilder(reducer).with(slot).build();
slot.case('counter').wrap({ type: 'increment' });
void publicSlot;
void schemaCase;
// @ts-expect-error Exact destination fields must use destinationSlot after C4.
optionalSlot<State, Action>()('destination');
// @ts-expect-error Case keys remain exact through the public facade.
slot.case('missing');

type WizardState = { wizard: { type: 'editing'; state: { step: number } } | null };
type WizardAction = { type: 'wizard'; action: PresentationAction<{ type: 'advance' }> };
optionalSlot<WizardState, WizardAction>()('wizard');
// @ts-expect-error Acknowledgement is available only for the exact both-shape collision subset.
optionalSlot<WizardState, WizardAction>()('wizard', { destinationShape: 'ordinary' });

type OrdinaryState = {
  flow: { type: 'editing'; state: { step: number } } | { type: 'reviewing'; state: { summary: string } } | null;
};
type OrdinaryAction = { type: 'flow'; action: PresentationAction<
  | { type: 'editing'; action: { type: 'advance' } }
  | { type: 'reviewing'; action: { type: 'approve' } }
> };
// @ts-expect-error The default remains fail-closed for a structurally destination-shaped field.
optionalSlot<OrdinaryState, OrdinaryAction>()('flow');
// Explicit ordinary-shape acknowledgement is the narrow compatibility escape.
optionalSlot<OrdinaryState, OrdinaryAction>()('flow', { destinationShape: 'ordinary' });
// The type system is structural; the runtime child guard still protects a genuine Destination.
optionalSlot<State, Action>()('destination', { destinationShape: 'ordinary' });
// @ts-expect-error The acknowledgement spelling is exact.
optionalSlot<OrdinaryState, OrdinaryAction>()('flow', { destinationShape: 'destination' });
// @ts-expect-error C4 exports destination construction from application, not package root.
RootPublic.destinationSlot;
// @ts-expect-error C4 does not widen the navigation entry.
NavigationPublic.destinationSlot;
