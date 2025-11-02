<script lang="ts">
	import { createStore } from '@composable-svelte/core';
	import { syncBrowserHistory, createInitialStateFromURL } from '@composable-svelte/core/routing';
	import { onMount, onDestroy } from 'svelte';
	import { inventoryReducer, createInitialState } from './reducer';
	import { parseInventoryURL, destinationToAction } from './routing';
	import type { InventoryItem } from './types';
	import ItemList from './components/ItemList.svelte';
	import ItemDetail from './components/ItemDetail.svelte';
	import AddItemModal from './components/AddItemModal.svelte';

	// Initialize state from URL (deep linking)
	const defaultState = createInitialState();
	const initialState = createInitialStateFromURL(
		defaultState,
		parseInventoryURL,
		(state, destination) => ({ ...state, destination })
	);

	// Create store
	const store = createStore({
		initialState,
		reducer: inventoryReducer,
		dependencies: {}
	});

	// Sync browser history
	let cleanup: (() => void) | null = null;

	onMount(() => {
		cleanup = syncBrowserHistory(store, {
			parse: parseInventoryURL,
			serialize: (state) => {
				const { serializeInventoryState } = require('./routing');
				return serializeInventoryState(state.destination);
			},
			destinationToAction
		});
	});

	onDestroy(() => {
		cleanup?.();
	});

	// Access state using Svelte's store contract ($store syntax)
	// The store implements subscribe(), so Svelte automatically manages subscriptions
	let items = $derived($store.items);
	let searchQuery = $derived($store.searchQuery);
	let selectedCategory = $derived($store.selectedCategory);
	let destination = $derived($store.destination);

	// Filter items
	let filteredItems = $derived(
		items.filter((item) => {
			const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
			const matchesCategory = !selectedCategory || item.category === selectedCategory;
			return matchesSearch && matchesCategory;
		})
	);

	// Get categories
	let categories = $derived(Array.from(new Set(items.map((item) => item.category))).sort());

	// Get selected item
	let selectedItem = $derived(
		destination?.type === 'detail' ? items.find((item) => item.id === destination.state.itemId) : null
	);
</script>

<div class="app">
	<header class="header">
		<h1>📦 Inventory Manager</h1>
		<p class="subtitle">URL Routing Example - Composable Svelte</p>
	</header>

	<main class="main">
		<div class="filters">
			<input
				type="text"
				placeholder="Search items..."
				value={searchQuery}
				oninput={(e) => store.dispatch({ type: 'searchChanged', query: e.currentTarget.value })}
				class="search-input"
			/>

			<select
				value={selectedCategory ?? ''}
				onchange={(e) => {
					const value = e.currentTarget.value;
					store.dispatch({ type: 'categorySelected', category: value || null });
				}}
				class="category-select"
			>
				<option value="">All Categories</option>
				{#each categories as category}
					<option value={category}>{category}</option>
				{/each}
			</select>

			<button onclick={() => store.dispatch({ type: 'addTapped' })} class="add-button">
				Add Item
			</button>
		</div>

		<ItemList items={filteredItems} onItemClick={(id) => store.dispatch({ type: 'itemSelected', itemId: id })} />

		{#if destination?.type === 'detail' && selectedItem}
			<ItemDetail
				item={selectedItem}
				onClose={() => store.dispatch({ type: 'closeDestination' })}
				onDelete={(id) => {
					if (confirm('Delete this item?')) {
						store.dispatch({ type: 'itemDeleted', itemId: id });
					}
				}}
			/>
		{/if}

		{#if destination?.type === 'add'}
			<AddItemModal
				onClose={() => store.dispatch({ type: 'closeDestination' })}
				onAdd={(item) => store.dispatch({ type: 'itemAdded', item })}
			/>
		{/if}
	</main>

	<footer class="footer">
		<p>
			Try:
			<a href="/inventory/item/1">Deep link to item</a> |
			<a href="/inventory/add">Deep link to add</a> |
			Use browser back/forward buttons
		</p>
	</footer>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background: #f5f5f5;
	}

	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.header {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		padding: 2rem;
		text-align: center;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.header h1 {
		margin: 0;
		font-size: 2.5rem;
	}

	.subtitle {
		margin: 0.5rem 0 0;
		opacity: 0.9;
	}

	.main {
		flex: 1;
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
		width: 100%;
		box-sizing: border-box;
	}

	.filters {
		display: flex;
		gap: 1rem;
		margin-bottom: 2rem;
		flex-wrap: wrap;
	}

	.search-input {
		flex: 1;
		min-width: 200px;
		padding: 0.75rem 1rem;
		border: 2px solid #e0e0e0;
		border-radius: 8px;
		font-size: 1rem;
		transition: border-color 0.2s;
	}

	.search-input:focus {
		outline: none;
		border-color: #667eea;
	}

	.category-select {
		padding: 0.75rem 1rem;
		border: 2px solid #e0e0e0;
		border-radius: 8px;
		font-size: 1rem;
		background: white;
		cursor: pointer;
		transition: border-color 0.2s;
	}

	.category-select:focus {
		outline: none;
		border-color: #667eea;
	}

	.add-button {
		padding: 0.75rem 2rem;
		background: #667eea;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}

	.add-button:hover {
		background: #5568d3;
	}

	.footer {
		background: white;
		padding: 1rem 2rem;
		text-align: center;
		border-top: 1px solid #e0e0e0;
		color: #666;
	}

	.footer a {
		color: #667eea;
		text-decoration: none;
	}

	.footer a:hover {
		text-decoration: underline;
	}
</style>
