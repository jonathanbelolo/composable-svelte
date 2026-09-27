/** Component-owned managed applications with framework-owned browser routing. */
export { defineApplication, type ApplicationDefinition, type ApplicationDefinitionOptions, type RoutedApplicationDefinitionOptions } from './definition.js';
export { useApplication, type ApplicationOptions } from './use-application.js';
export type { ApplicationInstance, ApplicationOwner, ApplicationStore } from './instance.svelte.js';
export { default as ApplicationRoot } from './ApplicationRoot.svelte';
export { default as ApplicationHost } from './PublicApplicationHost.svelte';

// Managed composition and typed projections share the existing owner runtime.
export { optionalSlot, destinationSlot, nestedSlot, ManagedIntegrationBuilder } from '../navigation/managed-integration.js';
export type { SlotHandle, ChildView, PresentationView, PresentationSlotHandle, OptionalSlot, OptionalSlotFactory, KeyedSlot, DestinationSlot, DestinationSlotFactory, DestinationSlotSchema, CaseSchema, SlotSchema, ManagedComposition } from '../navigation/managed-integration.js';
export { scopeTo } from '../navigation/scope.js';
export { managedDismissDependency } from '../navigation/dismiss-dependency.js';
export type { DismissDependency } from '../navigation/dismiss-dependency.js';

export type { ApplicationRouting, ApplicationRouteRequest, ApplicationStaging, StagedRouteRequester } from './routing.js';
// Prospective staged navigation (candidate public, not finalized).
export { useStagedRoute } from './routing.js';
export type { RouteFallbackProps, RenderFailureSummary } from './renderer/route-render.js';
// Scroll ownership vocabulary (backend owned by the scroll author; requested exports).
export type { ScrollPolicy, ApplicationScrollOwnership } from './routing.js';
export type { RequestHandle as StagedRequestHandle, RequestResult as StagedRequestResult, TransactionOutcome as StagedTransactionOutcome, StagedRequestOptions } from '../routing/staged/types.js';

export { defineViews } from './view-definition.js';
export type { ViewDefinition, ViewDeclarations, FeatureViewProps, PresentationFeatureViewProps, FeatureViewPropsOf } from './view-definition.js';
export type { FeatureView, ViewHandles } from './view-binding.js';
export { default as FeatureViews } from './FeatureViews.svelte';
export { default as FeatureOutlet } from './FeatureOutlet.svelte';
export { keyedSlot } from '../navigation/managed-integration.js';

// Owner-scoped native commands: observe what one captured owner reduces.
export { observeChildActions, isManagedChildView, type ManagedChildViewBrand } from './owner-actions.js';
