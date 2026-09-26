import { Effect, type Reducer, type Store } from '@composable-svelte/core';
import { defineViews, destinationSlot, keyedSlot, nestedSlot, optionalSlot, ManagedIntegrationBuilder, isManagedChildView, observeChildActions, type ChildView, type ManagedChildViewBrand } from '@composable-svelte/core/application';
import { createDestination, type PresentationAction } from '@composable-svelte/core/navigation';

type Child = { value: number };
type ChildAction = { type: 'inc' };
type Panel = { child: Child | null };
type PanelAction = { type: 'child'; action: PresentationAction<ChildAction> };
type Modal = { value: string };
type ModalAction = { type: 'close' };
type DestinationState = { type: 'modal'; state: Modal };
type DestinationAction = { type: 'modal'; action: ModalAction };
type State = { panel: Panel | null; rows: Array<{ id: number; state: Child }>; destination: DestinationState | null };
type Action =
  | { type: 'panel'; action: PresentationAction<PanelAction> }
  | { type: 'rows'; id: number; action: ChildAction }
  | { type: 'destination'; action: PresentationAction<DestinationAction> };
const childReducer: Reducer<Child, ChildAction> = (state) => [state, Effect.none()];
const panelReducer: Reducer<Panel, PanelAction> = (state) => [state, Effect.none()];
const modalReducer: Reducer<Modal, ModalAction> = (state) => [state, Effect.none()];
const root: Reducer<State, Action> = (state) => [state, Effect.none()];
export const optionalFactory = optionalSlot<State, Action>();
export const destinationFactory = destinationSlot<State, Action>();
export const keyedFactory = keyedSlot<State, Action>();
export const panel = optionalFactory('panel');
export const destination = destinationFactory('destination', createDestination({ modal: modalReducer }));
export const child = optionalSlot<Panel, PanelAction>()('child');
export const rows = keyedFactory('rows');
export const rowOne = rows.at(1);
export const nested = nestedSlot(panel, child);
const panelBuilder = new ManagedIntegrationBuilder(panelReducer).with(child, childReducer);
export const panelComposition = panelBuilder.build();
const builder = new ManagedIntegrationBuilder(root).with(panel, panelComposition).forEach(rows, childReducer);
export const composition = builder.build();
export const panelViews = defineViews(panelComposition, { child: { headless: true } });
export const views = defineViews(composition, { panel: { headless: true }, rows: { headless: true } });
// @ts-expect-error every exact composed slot is required
export const missing = defineViews(composition, { panel: { headless: true } });
// @ts-expect-error an undeclared slot is rejected
export const extra = defineViews(composition, { panel: { headless: true }, rows: { headless: true }, extra: { headless: true } });

// isManagedChildView narrows by intersection: the true branch keeps the declared
// action type, the false branch keeps the declared input rather than never.
type Command = { type: 'focus' } | { type: 'format'; tabSize: number };
type IsNever<T> = [T] extends [never] ? true : false;
type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
declare const run: (command: Command) => void;
/** The listener's parameter is exactly `Command`: not any, not unknown. */
const exactly = <T>(command: T, same: Equals<T, Command>): void => void same;
export function viaUnion(source: Store<Child, Command> | ChildView<Child, Command>): () => void {
  if (isManagedChildView(source)) return observeChildActions(source, command => exactly(command, true));
  const kept: IsNever<typeof source> = false;
  void kept;
  // A non-managed ChildView has no subscribeToActions; a helper checks the capability.
  return 'subscribeToActions' in source && typeof source.subscribeToActions === 'function'
    ? source.subscribeToActions(action => run(action))
    : () => {};
}
export function viaStore(source: Store<Child, Command>): () => void {
  if (isManagedChildView(source)) return observeChildActions(source, command => exactly(command, true));
  return source.subscribeToActions?.(action => exactly(action, true)) ?? (() => {});
}
export function viaUnknown(source: unknown): ManagedChildViewBrand | undefined {
  if (!isManagedChildView(source)) return undefined;
  // @ts-expect-error an unknown input narrows to the brand alone; no action type is invented
  observeChildActions(source, () => {});
  return source;
}
// @ts-expect-error the brand is type-only and cannot be written
export const forged: ManagedChildViewBrand = {};
