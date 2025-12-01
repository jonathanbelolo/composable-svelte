<!--
	CommandItem Component

	Individual command item with selection state.
	Displays icon, label, description, and optional shortcut.

	@component
-->
<script lang="ts">
	import type { Store } from '../../store.js';
	import type { CommandState, CommandAction, CommandItem } from './command.types.js';

	interface CommandItemProps {
		/**
		 * Store managing command state.
		 */
		store: Store<CommandState, CommandAction>;

		/**
		 * Command data.
		 */
		command: CommandItem;

		/**
		 * Index in the filtered list.
		 */
		index: number;

		/**
		 * Additional CSS classes.
		 */
		class?: string;
	}

	let { store, command, index, class: className = '' }: CommandItemProps = $props();

	const isSelected = $derived($store.selectedIndex === index);
	const isDisabled = $derived(command.disabled ?? false);

	function handleClick() {
		if (isDisabled) {
			return;
		}
		store.dispatch({ type: 'executeCommand', index });
	}

	function handleMouseEnter() {
		if (isDisabled) {
			return;
		}
		store.dispatch({ type: 'selectCommand', index });
	}
</script>

<button
	type="button"
	class="command-item {className}"
	class:command-item--selected={isSelected}
	class:command-item--disabled={isDisabled}
	disabled={isDisabled}
	role="option"
	aria-selected={isSelected}
	aria-disabled={isDisabled}
	onclick={handleClick}
	onmouseenter={handleMouseEnter}
>
	<!-- Icon (if provided) -->
	{#if command.icon}
		<span class="command-item-icon">
			{#if typeof command.icon === 'string'}
				{command.icon}
			{:else}
				<!-- Component icon -->
				<svelte:component this={command.icon} />
			{/if}
		</span>
	{/if}

	<!-- Content -->
	<div class="command-item-content">
		<div class="command-item-label">
			{command.label}
		</div>

		{#if command.description}
			<div class="command-item-description">
				{command.description}
			</div>
		{/if}
	</div>

	<!-- Shortcut (if provided) -->
	{#if command.shortcut}
		<span class="command-item-shortcut">
			{command.shortcut}
		</span>
	{/if}
</button>

<style>
	.command-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.625rem 0.75rem;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s;
	}

	.command-item:hover:not(:disabled) {
		background: #f3f4f6;
	}

	.command-item--selected {
		background: #eff6ff;
		color: #1e40af;
	}

	.command-item--selected:hover:not(:disabled) {
		background: #dbeafe;
	}

	.command-item--disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.command-item-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1.25rem;
		height: 1.25rem;
		color: #6b7280;
	}

	.command-item--selected .command-item-icon {
		color: #1e40af;
	}

	.command-item-content {
		flex: 1;
		min-width: 0;
	}

	.command-item-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: #111827;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.command-item--selected .command-item-label {
		color: #1e40af;
	}

	.command-item--disabled .command-item-label {
		color: #9ca3af;
	}

	.command-item-description {
		margin-top: 0.125rem;
		font-size: 0.75rem;
		color: #6b7280;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.command-item--selected .command-item-description {
		color: #3b82f6;
	}

	.command-item-shortcut {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		padding: 0.125rem 0.375rem;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: #6b7280;
	}

	.command-item--selected .command-item-shortcut {
		background: #dbeafe;
		border-color: #bfdbfe;
		color: #1e40af;
	}
</style>
