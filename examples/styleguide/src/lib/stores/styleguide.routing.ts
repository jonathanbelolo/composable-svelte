/**
 * Styleguide App - Routing Configuration
 *
 * Defines URL serialization/parsing for component showcase.
 */

import { matchPath } from '@composable-svelte/core/routing';
import type { StyleguideState, StyleguideAction } from './styleguide.types';

// ============================================================================
// Serialization (State → URL)
// ============================================================================

/**
 * Serialize styleguide state to URL path.
 */
export function serializeStyleguideState(state: StyleguideState): string {
	if (state.selectedComponent) {
		return `/component/${state.selectedComponent}`;
	}
	return '/';
}

// ============================================================================
// Parsing (URL → Component ID)
// ============================================================================

/**
 * Parse URL path to component ID.
 * Returns null for home page ('/') or component ID for '/component/:id'
 */
export function parseStyleguideURL(path: string): string | null {
	// Home page
	if (path === '/' || path === '') {
		return null;
	}

	// Component showcase page
	const params = matchPath('/component/:componentId', path);
	if (params) {
		return params.componentId;
	}

	return null;
}

// ============================================================================
// Component ID → Action Mapping (for browser navigation)
// ============================================================================

/**
 * Convert component ID to action.
 * Used when browser navigates (back/forward button).
 */
export function componentIdToAction(componentId: string | null): StyleguideAction {
	if (!componentId) {
		return { type: 'homeSelected' };
	}

	return { type: 'componentSelected', componentId };
}
