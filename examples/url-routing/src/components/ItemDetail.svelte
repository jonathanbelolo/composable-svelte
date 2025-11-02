<script lang="ts">
	import type { InventoryItem } from '../types';

	interface Props {
		item: InventoryItem;
		onClose: () => void;
		onDelete: (id: string) => void;
	}

	let { item, onClose, onDelete }: Props = $props();
</script>

<div class="backdrop" onclick={onClose}></div>
<div class="modal">
	<div class="modal-header">
		<h2>{item.name}</h2>
		<button class="close-button" onclick={onClose}>✕</button>
	</div>

	<div class="modal-body">
		<div class="info-row">
			<span class="info-label">Category</span>
			<span class="info-value">{item.category}</span>
		</div>

		<div class="info-row">
			<span class="info-label">Quantity</span>
			<span class="info-value">{item.quantity} units</span>
		</div>

		<div class="info-row">
			<span class="info-label">Price</span>
			<span class="info-value">${item.price.toFixed(2)}</span>
		</div>

		<div class="info-row">
			<span class="info-label">Total Value</span>
			<span class="info-value highlight">${(item.quantity * item.price).toFixed(2)}</span>
		</div>
	</div>

	<div class="modal-footer">
		<button class="delete-button" onclick={() => onDelete(item.id)}>Delete Item</button>
		<button class="close-button-footer" onclick={onClose}>Close</button>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 100;
	}

	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: white;
		border-radius: 16px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
		max-width: 500px;
		width: 90%;
		z-index: 101;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem 2rem;
		border-bottom: 1px solid #e0e0e0;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.5rem;
		color: #333;
	}

	.close-button {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: #999;
		padding: 0;
		width: 32px;
		height: 32px;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.close-button:hover {
		background: #f0f0f0;
		color: #333;
	}

	.modal-body {
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.info-label {
		font-size: 1rem;
		color: #666;
	}

	.info-value {
		font-size: 1.125rem;
		font-weight: 600;
		color: #333;
	}

	.info-value.highlight {
		color: #667eea;
		font-size: 1.25rem;
	}

	.modal-footer {
		padding: 1.5rem 2rem;
		border-top: 1px solid #e0e0e0;
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
	}

	.delete-button {
		padding: 0.75rem 1.5rem;
		background: #dc3545;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		cursor: pointer;
		transition: background 0.2s;
	}

	.delete-button:hover {
		background: #c82333;
	}

	.close-button-footer {
		padding: 0.75rem 1.5rem;
		background: #e0e0e0;
		color: #333;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		cursor: pointer;
		transition: background 0.2s;
	}

	.close-button-footer:hover {
		background: #d0d0d0;
	}
</style>
