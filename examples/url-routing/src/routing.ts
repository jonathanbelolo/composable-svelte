/**
 * Inventory App - Routing Configuration
 *
 * Defines URL serialization/parsing for inventory destinations.
 * Phase 7: URL Synchronization (Browser History Integration)
 */

import {
	serializeDestination,
	parseDestination,
	matchPath,
	type SerializerConfig,
	type ParserConfig
} from '@composable-svelte/core/routing';
import type { InventoryDestination, InventoryAction } from './types';

// ============================================================================
// Serialization Config (State → URL)
// ============================================================================

export const serializerConfig: SerializerConfig<InventoryDestination> = {
	basePath: '/inventory',
	serializers: {
		detail: (state) => `/inventory/item/${state.itemId}`,
		add: () => '/inventory/add'
	}
};

/**
 * Serialize inventory state to URL path.
 */
export function serializeInventoryState(destination: InventoryDestination | null): string {
	return serializeDestination(destination, serializerConfig);
}

// ============================================================================
// Parsing Config (URL → State)
// ============================================================================

export const parserConfig: ParserConfig<InventoryDestination> = {
	basePath: '/inventory',
	parsers: [
		// Parser for add destination
		(path) => {
			if (path === '/add') {
				return { type: 'add', state: {} };
			}
			return null;
		},

		// Parser for detail destination
		(path) => {
			const params = matchPath('/item/:itemId', path);
			if (params) {
				return {
					type: 'detail',
					state: { itemId: params.itemId }
				};
			}
			return null;
		}
	]
};

/**
 * Parse URL path to inventory destination.
 */
export function parseInventoryURL(path: string): InventoryDestination | null {
	return parseDestination(path, parserConfig);
}

// ============================================================================
// Destination → Action Mapping (for browser navigation)
// ============================================================================

/**
 * Convert destination state to action.
 * Used when browser navigates (back/forward button).
 */
export function destinationToAction(destination: InventoryDestination | null): InventoryAction | null {
	if (!destination) {
		return { type: 'closeDestination' };
	}

	switch (destination.type) {
		case 'detail':
			return { type: 'itemSelected', itemId: destination.state.itemId };
		case 'add':
			return { type: 'addTapped' };
	}
}
