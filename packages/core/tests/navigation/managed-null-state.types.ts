/** Compile-only DEF-021 contract; never invoked. */
import type { SlotHandle } from '../../src/lib/navigation/managed-integration.js';
import { optionalSlot, keyedSlot, destinationSlot } from '../../src/lib/navigation/managed-integration.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import { Effect } from '../../src/lib/effect.js';
import type { Reducer } from '../../src/lib/types.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';

export function managedNullStateTypeContract() {
  // 1. Generic SlotHandle contract
  // A null child domain keeps null through C, resulting in C | undefined -> null | undefined
  type NullChildHandle = SlotHandle<unknown, unknown, null, unknown>;
  type NullChildRead = ReturnType<NullChildHandle['read']>;
  const liveNull: NullChildRead = null;
  const liveUndefined: NullChildRead = undefined;
  void liveNull;
  void liveUndefined;

  // An ordinary non-null child reader adds only undefined (C | undefined), never null
  type NonNullChildHandle = SlotHandle<unknown, unknown, { count: number }, unknown>;
  type NonNullChildRead = ReturnType<NonNullChildHandle['read']>;
  const validValue: NonNullChildRead = { count: 1 };
  const validUndefined: NonNullChildRead = undefined;
  void validValue;
  void validUndefined;

  // @ts-expect-error Ordinary non-null child read does not include null
  const illegalNull: NonNullChildRead = null;
  void illegalNull;

  // 2. Concrete KeyedSlot with null state
  type KeyedState = { rows: Array<{ id: number; state: null }> };
  type KeyedAction = { type: 'rows'; id: number; action: { type: 'noop' } };
  const rows = keyedSlot<KeyedState, KeyedAction>()('rows');
  const rowHandle = rows.at(1);
  type KeyedRead = ReturnType<typeof rowHandle.read>;
  const keyedNull: KeyedRead = null;
  const keyedUndefined: KeyedRead = undefined;
  void keyedNull;
  void keyedUndefined;

  // 3. Concrete OptionalSlot: C is NonNullable<S[K]>; read returns C | undefined, never null
  type OptState = { panel: { value: number } | null };
  type OptAction = { type: 'panel'; action: PresentationAction<{ type: 'act' }> };
  const panel = optionalSlot<OptState, OptAction>()('panel');
  type OptRead = ReturnType<typeof panel.read>;
  const optValue: OptRead = { value: 1 };
  const optUndefined: OptRead = undefined;
  void optValue;
  void optUndefined;

  // @ts-expect-error OptionalSlot read returns undefined for absent field, not null
  const optNull: OptRead = null;
  void optNull;

  // 4. Concrete DestinationSlot with null case state
  const dest = createDestination({
    nullCase: ((state: null) => [state, Effect.none()]) as Reducer<null, { type: 'ping' }>,
    valueCase: ((state: { val: number }) => [state, Effect.none()]) as Reducer<{ val: number }, { type: 'pong' }>
  });
  type DestState = { dest: typeof dest._types.State | null };
  type DestAction = { type: 'dest'; action: PresentationAction<typeof dest._types.Action> };
  const destSlot = destinationSlot<DestState, DestAction>()('dest', dest);

  const nullCaseHandle = destSlot.case('nullCase');
  type NullCaseRead = ReturnType<typeof nullCaseHandle.read>;
  const caseNull: NullCaseRead = null;
  const caseUndefined: NullCaseRead = undefined;
  void caseNull;
  void caseUndefined;

  const valueCaseHandle = destSlot.case('valueCase');
  type ValueCaseRead = ReturnType<typeof valueCaseHandle.read>;
  const caseVal: ValueCaseRead = { val: 42 };
  const caseValUndefined: ValueCaseRead = undefined;
  void caseVal;
  void caseValUndefined;

  // @ts-expect-error Non-null destination case read does not include null
  const illegalCaseNull: ValueCaseRead = null;
  void illegalCaseNull;
}
