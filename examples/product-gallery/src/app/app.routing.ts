/**
 * Product Gallery App - Routing Configuration
 *
 * Defines URL serialization/parsing for product detail navigation.
 */

import { matchPath } from '@composable-svelte/core/routing';
import type { AppState, AppAction } from './app.types';
import type { ProductDetailState } from '../features/product-detail/product-detail.types';

// ============================================================================
// Serialization (State → URL)
// ============================================================================

/**
 * Serialize app state to URL path.
 */
export function serializeAppState(state: AppState): string {
	if (state.productDetail) {
		return `/product/${state.productDetail.productId}`;
	}
	return '/';
}

// ============================================================================
// Parsing (URL → Product ID)
// ============================================================================

/**
 * Parse URL path to product ID.
 * Returns null for home page ('/') or product ID for '/product/:id'
 */
export function parseAppURL(path: string): string | null {
	// Home page
	if (path === '/' || path === '') {
		return null;
	}

	// Product detail page
	const params = matchPath('/product/:productId', path);
	if (params) {
		return params.productId;
	}

	return null;
}

// ============================================================================
// Product ID → Action Mapping (for browser navigation)
// ============================================================================

/**
 * Convert product ID to action.
 * Used when browser navigates (back/forward button).
 */
export function productIdToAction(productId: string | null): AppAction {
	if (!productId) {
		// Close product detail (go home)
		return { type: 'productDetail', action: { type: 'dismiss' } };
	}

	// Open product detail
	return { type: 'productClicked', productId };
}
