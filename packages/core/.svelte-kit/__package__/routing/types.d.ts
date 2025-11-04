/**
 * Type Definitions for URL Routing
 *
 * This module provides TypeScript types for the routing system.
 * Part of Phase 7: URL Synchronization (Browser History Integration)
 *
 * @module routing/types
 */
import type { SerializerConfig } from './serializer';
import type { ParserConfig } from './parser';
/**
 * Complete route configuration combining serialization and parsing.
 *
 * This is a convenience type that combines both serializer and parser
 * configurations for a destination type, along with action mapping.
 *
 * @template Dest - Destination state type (must have `type` and `state` fields)
 * @template Action - Application action type
 *
 * @example
 * ```typescript
 * type InventoryDestination =
 *   | { type: 'detailItem'; state: { itemId: string } }
 *   | { type: 'editItem'; state: { itemId: string } }
 *   | { type: 'addItem'; state: {} };
 *
 * type InventoryAction =
 *   | { type: 'itemSelected'; itemId: string }
 *   | { type: 'editItemTapped'; itemId: string }
 *   | { type: 'addItemTapped' }
 *   | { type: 'closeDestination' };
 *
 * const routeConfig: RouteConfig<InventoryDestination, InventoryAction> = {
 *   basePath: '/inventory',
 *   serializers: {
 *     detailItem: (state) => `/inventory/item-${state.itemId}`,
 *     editItem: (state) => `/inventory/item-${state.itemId}/edit`,
 *     addItem: () => '/inventory/add'
 *   },
 *   parsers: [
 *     (path) => {
 *       const params = matchPath('/item-:id/edit', path);
 *       return params ? { type: 'editItem', state: { itemId: params.id } } : null;
 *     },
 *     (path) => {
 *       const params = matchPath('/item-:id', path);
 *       return params ? { type: 'detailItem', state: { itemId: params.id } } : null;
 *     }
 *   ],
 *   destinationToAction: (dest) => {
 *     if (!dest) return { type: 'closeDestination' };
 *     if (dest.type === 'detailItem') {
 *       return { type: 'itemSelected', itemId: dest.state.itemId };
 *     }
 *     // ... other mappings
 *   }
 * };
 * ```
 */
export interface RouteConfig<Dest extends {
    type: string;
    state: any;
}, Action> {
    /**
     * Base path for all routes.
     * @default '/'
     */
    basePath?: string;
    /**
     * Serializers for each destination type.
     * Maps destination.type → URL path.
     */
    serializers: SerializerConfig<Dest>['serializers'];
    /**
     * List of parsers to try in order.
     * Each parser attempts to match a URL path to a destination.
     */
    parsers: ParserConfig<Dest>['parsers'];
    /**
     * Convert destination state to action.
     *
     * This function is called when the browser navigates (back/forward button)
     * and needs to update application state from the URL.
     *
     * @param destination - The parsed destination state, or null for root
     * @returns Action to dispatch, or null to skip
     */
    destinationToAction: (destination: Dest | null) => Action | null;
}
/**
 * Pattern matcher function type.
 *
 * A function that attempts to match a URL path against a pattern
 * and extract parameters.
 *
 * @param path - The URL path to match
 * @returns Object with extracted parameters, or null if no match
 *
 * @example
 * ```typescript
 * const matcher: RouteMatcher = (path) => {
 *   const params = matchPath('/item-:id', path);
 *   return params; // { id: '123' } or null
 * };
 * ```
 */
export type RouteMatcher = (path: string) => Record<string, string> | null;
/**
 * Path parameters extracted from URL.
 *
 * A record mapping parameter names to their string values.
 * All values are strings - conversion to other types is user's responsibility.
 *
 * @example
 * ```typescript
 * const params: PathParams = { id: '123', action: 'edit' };
 *
 * // Convert to appropriate types
 * const itemId: string = params.id;
 * const numericId: number = parseInt(params.id, 10);
 * ```
 */
export type PathParams = Record<string, string>;
/**
 * Extract all destination types from a destination union.
 *
 * Utility type to get the literal union of all `type` fields.
 *
 * @template Dest - Destination state union type
 *
 * @example
 * ```typescript
 * type MyDestination =
 *   | { type: 'detailItem'; state: { itemId: string } }
 *   | { type: 'editItem'; state: { itemId: string } }
 *   | { type: 'addItem'; state: {} };
 *
 * type Types = DestinationType<MyDestination>;
 * // Types = 'detailItem' | 'editItem' | 'addItem'
 * ```
 */
export type DestinationType<Dest extends {
    type: string;
    state: any;
}> = Dest['type'];
/**
 * Extract destination state for a specific type.
 *
 * Utility type to get the state shape for a particular destination type.
 *
 * @template Dest - Destination state union type
 * @template Type - Specific destination type to extract
 *
 * @example
 * ```typescript
 * type MyDestination =
 *   | { type: 'detailItem'; state: { itemId: string } }
 *   | { type: 'editItem'; state: { itemId: string; field: string } }
 *   | { type: 'addItem'; state: {} };
 *
 * type DetailState = DestinationState<MyDestination, 'detailItem'>;
 * // DetailState = { itemId: string }
 *
 * type EditState = DestinationState<MyDestination, 'editItem'>;
 * // EditState = { itemId: string; field: string }
 * ```
 */
export type DestinationState<Dest extends {
    type: string;
    state: any;
}, Type extends DestinationType<Dest>> = Extract<Dest, {
    type: Type;
}>['state'];
/**
 * Helper type for serializer function signature.
 *
 * @template Dest - Destination state union type
 * @template Type - Specific destination type
 *
 * @example
 * ```typescript
 * const detailSerializer: Serializer<MyDestination, 'detailItem'> = (state) => {
 *   // state is correctly typed as { itemId: string }
 *   return `/inventory/item-${state.itemId}`;
 * };
 * ```
 */
export type Serializer<Dest extends {
    type: string;
    state: any;
}, Type extends DestinationType<Dest>> = (state: DestinationState<Dest, Type>) => string;
/**
 * Helper type for parser function signature.
 *
 * @template Dest - Destination state union type
 *
 * @example
 * ```typescript
 * const itemParser: Parser<MyDestination> = (path) => {
 *   const params = matchPath('/item-:id', path);
 *   if (params) {
 *     return { type: 'detailItem', state: { itemId: params.id } };
 *   }
 *   return null;
 * };
 * ```
 */
export type Parser<Dest extends {
    type: string;
    state: any;
}> = (path: string) => Dest | null;
/**
 * Helper type for destination-to-action mapper function signature.
 *
 * @template Dest - Destination state union type
 * @template Action - Application action type
 *
 * @example
 * ```typescript
 * const mapper: DestinationToActionMapper<MyDestination, MyAction> = (dest) => {
 *   if (!dest) return { type: 'closeDestination' };
 *   switch (dest.type) {
 *     case 'detailItem':
 *       return { type: 'itemSelected', itemId: dest.state.itemId };
 *     case 'editItem':
 *       return { type: 'editItemTapped', itemId: dest.state.itemId };
 *     case 'addItem':
 *       return { type: 'addItemTapped' };
 *     default:
 *       return null;
 *   }
 * };
 * ```
 */
export type DestinationToActionMapper<Dest extends {
    type: string;
    state: any;
}, Action> = (destination: Dest | null) => Action | null;
//# sourceMappingURL=types.d.ts.map