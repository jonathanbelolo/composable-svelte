import { Effect, type Reducer } from '@composable-svelte/core';
import type { InventoryState, InventoryAction, InventoryRoute } from './types';

/** Business decisions only; accepted route state drives framework navigation. */
export const inventoryReducer: Reducer<InventoryState, InventoryAction, undefined> = (state, action) => {
  switch (action.type) {
    case 'routeRequested': return [{...state,route:action.route},Effect.none()];
    case 'itemSelected': return [{...state,route:{type:'detail',itemId:action.itemId}},Effect.none()];
    case 'addTapped': return [{...state,route:{type:'add'}},Effect.none()];
    case 'closeDestination': return [{...state,route:{type:'list',path:'/inventory'}},Effect.none()];
    case 'itemAdded': return [{...state,items:[...state.items,action.item],route:{type:'list',path:'/inventory'}},Effect.none()];
    case 'itemUpdated': return [{...state,items:state.items.map(item=>item.id===action.itemId?{...item,...action.updates}:item)},Effect.none()];
    case 'itemDeleted': return [{...state,items:state.items.filter(item=>item.id!==action.itemId),
      route:state.route.type==='detail'&&state.route.itemId===action.itemId?{type:'list',path:'/inventory'}:state.route},Effect.none()];
    case 'searchChanged': return [{...state,searchQuery:action.query},Effect.none()];
    case 'categorySelected': return [{...state,selectedCategory:action.category},Effect.none()];
  }
};

export const createInitialState = (route: InventoryRoute = {type:'list',path:'/inventory'}): InventoryState => ({
	route,
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
