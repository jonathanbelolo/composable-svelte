import { Effect } from '../../src/lib/effect.js';
import {
  ManagedIntegrationBuilder,
  destinationSlot,
  optionalSlot,
  type ChildPolicy
} from '../../src/lib/navigation/managed-integration.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import type { Reducer } from '../../src/lib/types.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';

type Child = { count: number };
type ChildAction = { type: 'inc' };
type State = { child: Child | null };
type Action = { type: 'child'; action: PresentationAction<ChildAction> };

const childSlot = optionalSlot<State, Action>()('child');
const childReducer: Reducer<Child, ChildAction, unknown> = (s) => [s, Effect.none()];
const coreReducer: Reducer<State, Action, unknown> = (s) => [s, Effect.none()];

const Destination = createDestination({ alpha: childReducer });
type DestOccupant = typeof Destination._types.State;
type DestAction = typeof Destination._types.Action;
type DestState = { destination: DestOccupant | null };
type DestParentAction = { type: 'destination'; action: PresentationAction<DestAction> };
const destSlot = destinationSlot<DestState, DestParentAction>()('destination', Destination);
const destCoreReducer: Reducer<DestState, DestParentAction, unknown> = (s) => [s, Effect.none()];

type AssertTrue<T extends true> = T;
type ExactDismissalType = NonNullable<ChildPolicy<State, Action, Child, ChildAction, unknown>['dismissal']>;
type _DismissalUnionCheck = AssertTrue<
  [ExactDismissalType] extends ['immediate' | 'deferred']
    ? ['immediate' | 'deferred'] extends [ExactDismissalType]
      ? true
      : false
    : false
>;

// 1. Positive compile pins for ChildPolicy
const _policyOmitted: ChildPolicy<State, Action, Child, ChildAction, unknown> = {};
const _policyUndefined: ChildPolicy<State, Action, Child, ChildAction, unknown> = { dismissal: undefined };
const _policyImmediate: ChildPolicy<State, Action, Child, ChildAction, unknown> = { dismissal: 'immediate' };
const _policyDeferred: ChildPolicy<State, Action, Child, ChildAction, unknown> = { dismissal: 'deferred' };

// 2. Negative compile pins for ChildPolicy
// @ts-expect-error - 'bad' literal is rejected
const _policyBadLiteral: ChildPolicy<State, Action, Child, ChildAction, unknown> = { dismissal: 'bad' };

// @ts-expect-error - numeric literal is rejected
const _policyBadNumber: ChildPolicy<State, Action, Child, ChildAction, unknown> = { dismissal: 123 };

// @ts-expect-error - boolean literal is rejected
const _policyBadBoolean: ChildPolicy<State, Action, Child, ChildAction, unknown> = { dismissal: true };

// 3. Positive compile pins for optional slot builder.with
new ManagedIntegrationBuilder(coreReducer).with(childSlot, childReducer);
new ManagedIntegrationBuilder(coreReducer).with(childSlot, childReducer, {});
new ManagedIntegrationBuilder(coreReducer).with(childSlot, childReducer, { dismissal: undefined });
new ManagedIntegrationBuilder(coreReducer).with(childSlot, childReducer, { dismissal: 'immediate' });
new ManagedIntegrationBuilder(coreReducer).with(childSlot, childReducer, { dismissal: 'deferred' });

// 4. Negative compile pins for optional slot builder.with
// @ts-expect-error - invalid dismissal literal rejected in optional slot policy
new ManagedIntegrationBuilder(coreReducer).with(childSlot, childReducer, { dismissal: 'bad' });

// @ts-expect-error - invalid dismissal type rejected in optional slot policy
new ManagedIntegrationBuilder(coreReducer).with(childSlot, childReducer, { dismissal: 123 });

// 5. Positive compile pins for destination slot builder.with
new ManagedIntegrationBuilder(destCoreReducer).with(destSlot);
new ManagedIntegrationBuilder(destCoreReducer).with(destSlot, {});
new ManagedIntegrationBuilder(destCoreReducer).with(destSlot, { dismissal: undefined });
new ManagedIntegrationBuilder(destCoreReducer).with(destSlot, { dismissal: 'immediate' });
new ManagedIntegrationBuilder(destCoreReducer).with(destSlot, { dismissal: 'deferred' });

// 6. Negative compile pins for destination slot builder.with
// @ts-expect-error - invalid dismissal literal rejected in destination slot policy
new ManagedIntegrationBuilder(destCoreReducer).with(destSlot, { dismissal: 'bad' });

// @ts-expect-error - invalid dismissal type rejected in destination slot policy
new ManagedIntegrationBuilder(destCoreReducer).with(destSlot, { dismissal: 123 });
