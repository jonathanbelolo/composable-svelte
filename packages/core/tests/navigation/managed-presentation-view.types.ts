import type { Component } from 'svelte';
import {
  ManagedIntegrationBuilder,
  destinationSlot,
  keyedSlot,
  nestedSlot,
  optionalSlot,
  type ChildView,
  type ManagedComposition,
  type PresentationView
} from '../../src/lib/navigation/managed-integration.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import { scopeTo } from '../../src/lib/navigation/scope.js';
import type { ManagedProjection } from '../../src/lib/execution/store-access.js';
import type {
  FeatureViewProps,
  PresentationFeatureViewProps,
  ViewDeclarations
} from '../../src/lib/application/index.js';
import { Effect } from '../../src/lib/effect.js';
import type { Reducer } from '../../src/lib/types.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';

type Leaf = { value: number };
type LeafAction = { type: 'increment' };
const leaf: Reducer<Leaf, LeafAction> = (state) => [state, Effect.none()];
const Destination = createDestination({ detail: leaf });
type DestinationState = typeof Destination._types.State;
type DestinationAction = typeof Destination._types.Action;
type State = {
  panel: Leaf | null;
  rows: Array<{ id: number; state: Leaf }>;
  destination: DestinationState | null;
};
type Action =
  | { type: 'panel'; action: PresentationAction<LeafAction> }
  | { type: 'rows'; id: number; action: LeafAction }
  | { type: 'destination'; action: PresentationAction<DestinationAction> };
const panel = optionalSlot<State, Action>()('panel');
const rows = keyedSlot<State, Action>()('rows');
const destination = destinationSlot<State, Action>()('destination', Destination);
const composition = new ManagedIntegrationBuilder<State, Action, undefined>((state) => [state, Effect.none()])
  .with(panel, leaf)
  .forEach(rows, leaf)
  .with(destination)
  .build();

declare const projection: ManagedProjection<State, Action>;
declare const rootStore: Parameters<typeof composition.bind>[0];
const optionalView: PresentationView<Leaf, LeafAction> | undefined = composition.bind(rootStore, panel);
const caseView: PresentationView<Leaf, LeafAction> | undefined = composition.bind(rootStore, destination.case('detail'));
const projected: PresentationView<Leaf, LeafAction> | undefined = scopeTo(projection, panel);
const keyedView: ChildView<Leaf, LeafAction> | undefined = composition.bind(rootStore, rows.at(1));
const projectedKeyed: ChildView<Leaf, LeafAction> | undefined = scopeTo(projection, rows.at(1));
type Container = { child: Leaf | null };
type ContainerAction = { type: 'child'; action: PresentationAction<LeafAction> };
type NestedRoot = { container: Container | null };
type NestedAction = { type: 'container'; action: PresentationAction<ContainerAction> };
const container = optionalSlot<NestedRoot, NestedAction>()('container');
const child = optionalSlot<Container, ContainerAction>()('child');
const childComposition = new ManagedIntegrationBuilder<Container, ContainerAction, undefined>((state) => [state, Effect.none()])
  .with(child, leaf)
  .build();
const nestedComposition = new ManagedIntegrationBuilder<NestedRoot, NestedAction, undefined>((state) => [state, Effect.none()])
  .with(container, childComposition)
  .build();
declare const nestedStore: Parameters<typeof nestedComposition.bind>[0];
const nested: PresentationView<Leaf, LeafAction> | undefined = nestedComposition.bind(nestedStore, nestedSlot(container, child));
void [optionalView, caseView, projected, keyedView, projectedKeyed, nested];

// @ts-expect-error Keyed rows do not expose presentation dismissal.
keyedView?.dismiss();
// @ts-expect-error Keyed projection scoping does not expose presentation dismissal.
projectedKeyed?.dismiss();
declare const ordinaryProps: FeatureViewProps<Leaf, LeafAction>;
// @ts-expect-error Ordinary feature props carry only ChildView authority.
ordinaryProps.store.dismiss();
declare const presentationProps: PresentationFeatureViewProps<Leaf, LeafAction>;
presentationProps.store.dismiss();
const structuralLegacyView = {
  state: undefined as Leaf | undefined,
  dispatch(_action: LeafAction): void {},
  select<T>(_selector: (state: Leaf | undefined) => T): T {
    throw new Error('type-only fixture');
  },
  subscribe(_listener: (state: Leaf | undefined) => void): () => void {
    return () => {};
  },
  dismiss(): void {}
};
// @ts-expect-error PresentationView authority is nominal, not structural.
const structurallyForgedPresentation: PresentationView<Leaf, LeafAction> = structuralLegacyView;
void structurallyForgedPresentation;

type CatalogOf<T> = T extends ManagedComposition<any, any, any, infer Catalog> ? Catalog : never;
type Catalog = CatalogOf<typeof composition>;
declare const presentationComponent: Component<PresentationFeatureViewProps<Leaf, LeafAction>>;
declare const keyedComponent: Component<FeatureViewProps<Leaf, LeafAction>>;
declare const destinationComponent: Component<PresentationFeatureViewProps<Leaf, LeafAction>>;
const declarations = {
  panel: { render: presentationComponent },
  rows: { render: keyedComponent },
  destination: { cases: { detail: { render: destinationComponent } } }
} satisfies ViewDeclarations<Catalog>;
const invalidKeyedDeclaration = {
  // @ts-expect-error Keyed slots cannot render a component requiring presentation authority.
  rows: { render: presentationComponent }
} satisfies Pick<ViewDeclarations<Catalog>, 'rows'>;
void [declarations, invalidKeyedDeclaration];
