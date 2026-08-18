/**
 * DestinationRouter Type Definitions
 *
 * Declared in their own module rather than inside the component: a generic
 * `<script generics=...>` component cannot reference a locally-declared
 * interface from its emitted declaration file.
 *
 * @packageDocumentation
 */

import type { Component } from 'svelte';
import type { Store } from '../types.js';

/**
 * Configuration for a single route.
 */
export interface RouteConfig {
	/**
	 * The Svelte component to render for this destination case.
	 *
	 * Component will receive a `store` prop with the scoped store.
	 */
	component: Component;

	/**
	 * The presentation style to use.
	 *
	 * - `modal`: Full-screen overlay with backdrop
	 * - `sheet`: Bottom sheet (mobile) or side panel (desktop)
	 * - `drawer`: Side drawer that pushes content
	 */
	presentation: 'modal' | 'sheet' | 'drawer';

	/**
	 * Additional props to pass to the presentation component.
	 *
	 * @example
	 * ```typescript
	 * {
	 *   presentationProps: {
	 *     unstyled: true,
	 *     disableClickOutside: true
	 *   }
	 * }
	 * ```
	 */
	presentationProps?: Record<string, any> | undefined;

	/**
	 * Additional props to pass to the child component.
	 *
	 * @example
	 * ```typescript
	 * {
	 *   componentProps: {
	 *     showAdvanced: true,
	 *     theme: 'dark'
	 *   }
	 * }
	 * ```
	 */
	componentProps?: Record<string, any> | undefined;
}

/**
 * Props for `DestinationRouter`.
 */
export interface DestinationRouterProps<State, Action> {
	/**
	 * The parent store containing destination state.
	 */
	store: Store<State, Action>;

	/**
	 * The field name in state that contains the destination.
	 *
	 * Must be a discriminated union with `{ type: string; state: any }` structure.
	 */
	field: keyof State & string;

	/**
	 * Map of destination case types to route configurations.
	 *
	 * Keys must match the `type` values in the destination union.
	 */
	routes: Record<string, RouteConfig>;
}
