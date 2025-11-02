<script lang="ts">
	import type { InventoryItem } from '../types';

	interface Props {
		onClose: () => void;
		onAdd: (item: InventoryItem) => void;
	}

	let { onClose, onAdd }: Props = $props();

	let name = $state('');
	let category = $state('');
	let quantity = $state(0);
	let price = $state(0);

	function handleSubmit(e: Event) {
		e.preventDefault();

		if (!name || !category || quantity <= 0 || price <= 0) {
			alert('Please fill all fields with valid values');
			return;
		}

		const newItem: InventoryItem = {
			id: Date.now().toString(),
			name,
			category,
			quantity,
			price
		};

		onAdd(newItem);

		// Reset form
		name = '';
		category = '';
		quantity = 0;
		price = 0;
	}
</script>

<div class="backdrop" onclick={onClose}></div>
<div class="modal">
	<form onsubmit={handleSubmit}>
		<div class="modal-header">
			<h2>Add New Item</h2>
			<button type="button" class="close-button" onclick={onClose}>✕</button>
		</div>

		<div class="modal-body">
			<div class="form-group">
				<label for="name">Item Name</label>
				<input
					id="name"
					type="text"
					bind:value={name}
					placeholder="Enter item name"
					required
				/>
			</div>

			<div class="form-group">
				<label for="category">Category</label>
				<input
					id="category"
					type="text"
					bind:value={category}
					placeholder="e.g., Electronics, Furniture"
					required
				/>
			</div>

			<div class="form-row">
				<div class="form-group">
					<label for="quantity">Quantity</label>
					<input
						id="quantity"
						type="number"
						bind:value={quantity}
						min="1"
						placeholder="0"
						required
					/>
				</div>

				<div class="form-group">
					<label for="price">Price ($)</label>
					<input
						id="price"
						type="number"
						bind:value={price}
						min="0.01"
						step="0.01"
						placeholder="0.00"
						required
					/>
				</div>
			</div>
		</div>

		<div class="modal-footer">
			<button type="button" class="cancel-button" onclick={onClose}>Cancel</button>
			<button type="submit" class="submit-button">Add Item</button>
		</div>
	</form>
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

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	label {
		font-size: 0.875rem;
		font-weight: 600;
		color: #333;
	}

	input {
		padding: 0.75rem;
		border: 2px solid #e0e0e0;
		border-radius: 8px;
		font-size: 1rem;
		transition: border-color 0.2s;
	}

	input:focus {
		outline: none;
		border-color: #667eea;
	}

	.modal-footer {
		padding: 1.5rem 2rem;
		border-top: 1px solid #e0e0e0;
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
	}

	.cancel-button {
		padding: 0.75rem 1.5rem;
		background: #e0e0e0;
		color: #333;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		cursor: pointer;
		transition: background 0.2s;
	}

	.cancel-button:hover {
		background: #d0d0d0;
	}

	.submit-button {
		padding: 0.75rem 1.5rem;
		background: #667eea;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}

	.submit-button:hover {
		background: #5568d3;
	}
</style>
