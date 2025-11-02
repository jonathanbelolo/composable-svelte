<script lang="ts">
	import type { InventoryItem } from '../types';

	interface Props {
		items: InventoryItem[];
		onItemClick: (id: string) => void;
	}

	let { items, onItemClick }: Props = $props();
</script>

<div class="item-list">
	{#if items.length === 0}
		<div class="empty-state">
			<p>No items found</p>
		</div>
	{:else}
		<div class="grid">
			{#each items as item (item.id)}
				<button class="item-card" onclick={() => onItemClick(item.id)}>
					<div class="item-header">
						<h3>{item.name}</h3>
						<span class="category">{item.category}</span>
					</div>
					<div class="item-details">
						<div class="detail">
							<span class="label">Quantity:</span>
							<span class="value">{item.quantity}</span>
						</div>
						<div class="detail">
							<span class="label">Price:</span>
							<span class="value">${item.price.toFixed(2)}</span>
						</div>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.item-list {
		width: 100%;
	}

	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
		color: #999;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1.5rem;
	}

	.item-card {
		background: white;
		border: 2px solid #e0e0e0;
		border-radius: 12px;
		padding: 1.5rem;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
		width: 100%;
	}

	.item-card:hover {
		border-color: #667eea;
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
	}

	.item-header {
		display: flex;
		justify-content: space-between;
		align-items: start;
		margin-bottom: 1rem;
		gap: 1rem;
	}

	.item-header h3 {
		margin: 0;
		font-size: 1.25rem;
		color: #333;
	}

	.category {
		background: #f0f0f0;
		padding: 0.25rem 0.75rem;
		border-radius: 4px;
		font-size: 0.875rem;
		color: #666;
		white-space: nowrap;
	}

	.item-details {
		display: flex;
		gap: 2rem;
	}

	.detail {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.label {
		font-size: 0.875rem;
		color: #999;
	}

	.value {
		font-size: 1.125rem;
		font-weight: 600;
		color: #667eea;
	}
</style>
