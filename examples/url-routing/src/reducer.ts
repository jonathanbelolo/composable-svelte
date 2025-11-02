/**
 * Inventory App - Reducer
 *
 * Business logic with URL synchronization.
 * Phase 7: URL Synchronization (Browser History Integration)
 */

import { Effect, type Reducer } from '@composable-svelte/core';
import { createURLSyncEffect } from '@composable-svelte/core/routing';
import type { InventoryState, InventoryAction, InventoryItem } from './types';
import { serializeInventoryState } from './routing';

// ============================================================================
// URL Sync Effect
// ============================================================================

const urlSyncEffect = createURLSyncEffect<InventoryState, InventoryAction>(
	(state) => serializeInventoryState(state.destination)
);

// ============================================================================
// Reducer
// ============================================================================

export const inventoryReducer: Reducer<InventoryState, InventoryAction, {}> = (state, action) => {
	switch (action.type) {
		// Navigation actions - update destination and sync URL
		case 'itemSelected': {
			const newState: InventoryState = {
				...state,
				destination: {
					type: 'detail',
					state: { itemId: action.itemId }
				}
			};
			return [newState, urlSyncEffect(newState)];
		}

		case 'addTapped': {
			const newState: InventoryState = {
				...state,
				destination: {
					type: 'add',
					state: {}
				}
			};
			return [newState, urlSyncEffect(newState)];
		}

		case 'closeDestination': {
			const newState: InventoryState = {
				...state,
				destination: null
			};
			return [newState, urlSyncEffect(newState)];
		}

		// Item management actions - no URL sync needed
		case 'itemAdded': {
			const newState: InventoryState = {
				...state,
				items: [...state.items, action.item],
				destination: null // Close add modal
			};
			return [newState, urlSyncEffect(newState)];
		}

		case 'itemUpdated': {
			const newState: InventoryState = {
				...state,
				items: state.items.map((item) =>
					item.id === action.itemId ? { ...item, ...action.updates } : item
				)
			};
			return [newState, Effect.none()];
		}

		case 'itemDeleted': {
			const newState: InventoryState = {
				...state,
				items: state.items.filter((item) => item.id !== action.itemId),
				// Close detail if we're viewing the deleted item
				destination:
					state.destination?.type === 'detail' &&
					state.destination.state.itemId === action.itemId
						? null
						: state.destination
			};
			return [newState, urlSyncEffect(newState)];
		}

		// Filter actions - no URL sync needed (filters are local UI state)
		case 'searchChanged':
			return [{ ...state, searchQuery: action.query }, Effect.none()];

		case 'categorySelected':
			return [{ ...state, selectedCategory: action.category }, Effect.none()];

		default:
			return [state, Effect.none()];
	}
};

// ============================================================================
// Initial State
// ============================================================================

export const createInitialState = (): InventoryState => ({
	destination: null,
	items: [
		{
			id: '1',
			name: 'Laptop',
			category: 'Electronics',
			quantity: 5,
			price: 1299.99
		},
		{
			id: '2',
			name: 'Office Chair',
			category: 'Furniture',
			quantity: 12,
			price: 299.99
		},
		{
			id: '3',
			name: 'Desk Lamp',
			category: 'Furniture',
			quantity: 8,
			price: 49.99
		},
		{
			id: '4',
			name: 'Wireless Mouse',
			category: 'Electronics',
			quantity: 25,
			price: 29.99
		},
		{
			id: '5',
			name: 'Notebook',
			category: 'Stationery',
			quantity: 100,
			price: 4.99
		},
		{
			id: '6',
			name: 'Monitor',
			category: 'Electronics',
			quantity: 7,
			price: 399.99
		}
	],
	searchQuery: '',
	selectedCategory: null
});
