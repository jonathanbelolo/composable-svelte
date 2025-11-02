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
export interface SerializerConfig<Dest extends { type: string; state: any }> {
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
		[K in Dest['type']]?: (state: Extract<Dest, { type: K }>['state']) => string;
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
export function serializeDestination<Dest extends { type: string; state: any }>(
	destination: Dest | null,
	config: SerializerConfig<Dest>
): string {
	// Null destination → return base path (root)
	if (!destination) {
		return config.basePath ?? '/';
	}

	// Find serializer for this destination type
	const serializer = config.serializers[destination.type as Dest['type']];
	if (!serializer) {
		// No serializer found - warn and return base path
		console.warn(
			`[Composable Svelte] No serializer found for destination type: "${destination.type}". Falling back to base path.`
		);
		return config.basePath ?? '/';
	}

	// Call type-specific serializer with destination state
	return serializer(destination.state);
}

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
export function pathSegment(base: string, segment: string): string {
	// Strip trailing slash from base (unless base is just '/')
	const normalizedBase = base === '/' ? '' : base.replace(/\/$/, '');

	// Ensure segment starts with slash
	const normalizedSegment = segment.startsWith('/') ? segment : `/${segment}`;

	return `${normalizedBase}${normalizedSegment}`;
}
