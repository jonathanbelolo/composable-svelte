/**
 * URL Serialization - State → URL Path
 *
 * This module provides functions to serialize destination state to URL paths.
 * Part of Phase 7: URL Synchronization (Browser History Integration)
 *
 * @module routing/serializer
 */
/**
 * Configuration for URL serialization.
 *
 * Maps destination types to serializer functions that convert
 * destination state to URL paths.
 *
 * @example
 * ```typescript
 * const config: SerializerConfig<InventoryDestination> = {
 *   basePath: '/inventory',
 *   serializers: {
 *     detailItem: (state) => `/inventory/item-${state.itemId}`,
 *     editItem: (state) => `/inventory/item-${state.itemId}/edit`,
 *     addItem: () => '/inventory/add'
 *   }
 * };
 * ```
 */
export interface SerializerConfig<Dest extends {
    type: string;
    state: any;
}> {
    /**
     * Base path for all routes.
     * @default '/'
     */
    basePath?: string;
    /**
     * Serializers for each destination type.
     *
     * Maps destination.type → serializer function.
     * Each serializer receives the destination's state and returns a URL path.
     */
    serializers: {
        [K in Dest['type']]?: (state: Extract<Dest, {
            type: K;
        }>['state']) => string;
    };
}
/**
 * Serialize destination state to URL path.
 *
 * Converts a destination state object to a URL path string using
 * the provided serializer configuration. This is a pure function
 * with no side effects.
 *
 * @param destination - The destination state to serialize, or null for root
 * @param config - Serializer configuration with base path and type-specific serializers
 * @returns URL path representing the destination state
 *
 * @example
 * ```typescript
 * // Null destination returns base path
 * serializeDestination(null, config);
 * // → '/inventory'
 *
 * // Simple destination with params
 * serializeDestination(
 *   { type: 'detailItem', state: { itemId: '123' } },
 *   config
 * );
 * // → '/inventory/item-123'
 *
 * // Different destination type
 * serializeDestination(
 *   { type: 'addItem', state: {} },
 *   config
 * );
 * // → '/inventory/add'
 * ```
 */
export declare function serializeDestination<Dest extends {
    type: string;
    state: any;
}>(destination: Dest | null, config: SerializerConfig<Dest>): string;
/**
 * Helper to create path segments.
 *
 * Concatenates a base path with a segment, ensuring proper slash handling.
 * Strips trailing slashes from base and ensures segment starts with slash.
 *
 * @param base - Base path (e.g., '/inventory')
 * @param segment - Path segment to append (e.g., 'item-123')
 * @returns Concatenated path
 *
 * @example
 * ```typescript
 * pathSegment('/inventory', 'item-123');
 * // → '/inventory/item-123'
 *
 * pathSegment('/inventory/', 'item-123');
 * // → '/inventory/item-123' (trailing slash stripped)
 *
 * pathSegment('/', 'items');
 * // → '/items'
 * ```
 */
export declare function pathSegment(base: string, segment: string): string;
//# sourceMappingURL=serializer.d.ts.map