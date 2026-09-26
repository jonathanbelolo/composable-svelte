import { it, expect } from 'vitest';
import { Effect } from '../../src/lib/effect.js';
import type { Reducer } from '../../src/lib/types.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import { destinationSlot, optionalSlot, ManagedIntegrationBuilder } from '../../src/lib/navigation/managed-integration.js';

type Child = { count: number };
type ChildAction = { type: 'increment' };
const child: Reducer<Child, ChildAction> = state => [state, Effect.none()];
const Destination = createDestination({ counter: child });
type Occupant = typeof Destination._types.State;
type CaseAction = typeof Destination._types.Action;
type State = { destination: Occupant | null };
type Action = { type: 'destination'; action: PresentationAction<CaseAction> };
const root: Reducer<State, Action> = state => [state, Effect.none()];

const unsafeOptional = (): unknown => Reflect.apply(optionalSlot<State, Action>(), undefined, ['destination']);
const unsafeAcknowledgedOptional = (): unknown => Reflect.apply(optionalSlot<State, Action>(), undefined, ['destination', { destinationShape: 'ordinary' }]);
const safe = destinationSlot<State, Action>()('destination', Destination);
const expected = 'Use destinationSlot for a createDestination-managed field';

it('rejects the generated reducer before registration and leaves the field available', () => {
    const builder = new ManagedIntegrationBuilder(root);
    expect(() => Reflect.apply(builder.with, builder, [unsafeOptional(), Destination.reducer])).toThrow(expected);
    expect(() => builder.with(safe)).not.toThrow();
});

it('rejects the branded destination result before registration and leaves the field available', () => {
    const builder = new ManagedIntegrationBuilder(root);
    expect(() => Reflect.apply(builder.with, builder, [unsafeOptional(), Destination])).toThrow(expected);
    expect(() => builder.with(safe)).not.toThrow();
});

it('does not let the ordinary-shape acknowledgement bypass the destination guard', () => {
    const builder = new ManagedIntegrationBuilder(root);
    expect(() => Reflect.apply(builder.with, builder, [unsafeAcknowledgedOptional(), Destination.reducer])).toThrow(expected);
    expect(() => builder.with(safe)).not.toThrow();
});

it('keeps ordinary reducers available to the optional branch', () => {
    const builder = new ManagedIntegrationBuilder(root);
    expect(() => Reflect.apply(builder.with, builder, [unsafeOptional(), child])).not.toThrow();
});

it('keeps ordinary nested compositions available to the optional branch', () => {
    type OptionalState = { child: Child | null };
    type OptionalAction = { type: 'child'; action: PresentationAction<ChildAction> };
    const optionalRoot: Reducer<OptionalState, OptionalAction> = state => [state, Effect.none()];
    const token = optionalSlot<OptionalState, OptionalAction>()('child');
    const nested = new ManagedIntegrationBuilder(child).build();
    expect(() => new ManagedIntegrationBuilder(optionalRoot).with(token, nested)).not.toThrow();
});

it('validates the ordinary-shape acknowledgement exactly at runtime', () => {
    const factory = optionalSlot<State, Action>();
    expect(() => Reflect.apply(factory, undefined, ['destination', {}])).toThrow("optionalSlot options must be exactly { destinationShape: 'ordinary' }");
    expect(() => Reflect.apply(factory, undefined, ['destination', { destinationShape: 'ordinary', extra: true }])).toThrow("optionalSlot options must be exactly { destinationShape: 'ordinary' }");
    expect(() => Reflect.apply(factory, undefined, ['destination', { destinationShape: 'destination' }])).toThrow("optionalSlot options must be exactly { destinationShape: 'ordinary' }");
    expect(() => Reflect.apply(factory, undefined, ['destination', { destinationShape: 'ordinary' }, 'extra'])).toThrow("optionalSlot options must be exactly { destinationShape: 'ordinary' }");
    expect(() => Reflect.apply(factory, undefined, ['destination', { destinationShape: 'ordinary' }])).not.toThrow();
});

it('records the unavoidable wrapper residual without claiming detection', () => {
    const wrapped: Reducer<Occupant, CaseAction> = (state, action, deps) => Destination.reducer(state, action, deps);
    const builder = new ManagedIntegrationBuilder(root);
    expect(() => Reflect.apply(builder.with, builder, [unsafeOptional(), wrapped])).not.toThrow();
});
