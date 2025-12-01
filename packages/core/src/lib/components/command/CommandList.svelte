<!--
	CommandList Component

	Scrollable list container for filtered commands.
	Supports grouped and ungrouped display.

	@component
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Store } from '../../store.js';
	import type { CommandState, CommandAction, CommandItem } from './command.types.js';

	interface CommandListProps {
		/**
		 * Store managing command state.
		 */
		store: Store<CommandState, CommandAction>;

		/**
		 * Content to render (typically CommandItem or CommandGroup components).
		 */
		children?: Snippet;

		/**
		 * Empty state message.
		 */
		emptyMessage?: string;

		/**
		 * Additional CSS classes.
		 */
		class?: string;
	}

	let {
		store,
		children,
		emptyMessage = 'No commands found.',
		class: className = ''
	}: CommandListProps = $props();

	const hasCommands = $derived($store.filteredCommands.length > 0);
</script>

<div class="command-list {className}" role="listbox">
	{#if hasCommands}
		{#if children}
			{@render children()}
		{/if}
	{:else}
		<!-- Empty State -->
		<div class="command-list-empty">
			<p>{emptyMessage}</p>
		</div>
	{/if}
</div>

<style>
	.command-list {
		overflow-y: auto;
		overflow-x: hidden;
		max-height: 24rem;
		padding: 0.5rem;
	}

	.command-list-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem 1rem;
		color: #9ca3af;
		font-size: 0.875rem;
		text-align: center;
	}

	.command-list-empty p {
		margin: 0;
	}

	/* Custom scrollbar styling */
	.command-list::-webkit-scrollbar {
		width: 8px;
	}

	.command-list::-webkit-scrollbar-track {
		background: transparent;
	}

	.command-list::-webkit-scrollbar-thumb {
		background: #d1d5db;
		border-radius: 4px;
	}

	.command-list::-webkit-scrollbar-thumb:hover {
		background: #9ca3af;
	}
</style>
