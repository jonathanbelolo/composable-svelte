<!--
	Command Palette Component

	A reducer-driven command palette with search, keyboard navigation, and action dispatch.

	Features:
	- Search/filter commands
	- Keyboard navigation (Arrow Up/Down, Enter, Escape)
	- Modal overlay
	- Custom filtering
	- Action dispatch on command execution

	@component
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { createStore } from '../../store.svelte.js';
	import { commandReducer } from './command.reducer.js';
	import type { CommandState, CommandItem, CommandDependencies } from './command.types.js';
	import { createInitialCommandState } from './command.types.js';

	interface CommandProps {
		/**
		 * Available commands.
		 */
		commands: CommandItem[];

		/**
		 * Whether the command palette is open.
		 * $bindable for two-way binding.
		 */
		open?: boolean;

		/**
		 * Callback when a command is executed.
		 */
		onCommandExecute?: (command: CommandItem) => void;

		/**
		 * Optional custom filter function.
		 */
		filterFunction?: (commands: CommandItem[], query: string) => CommandItem[];

		/**
		 * Maximum number of results to show.
		 */
		maxResults?: number;

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Default content snippet.
		 */
		children?: Snippet;
	}

	let {
		commands,
		open = $bindable(false),
		onCommandExecute,
		filterFunction,
		maxResults,
		class: className = '',
		children
	}: CommandProps = $props();

	// Create dependencies
	const dependencies: CommandDependencies = {
		onCommandExecute: onCommandExecute
			? (command, dispatch) => {
					onCommandExecute(command);
				}
			: undefined,
		filterFunction
	};

	// Create store
	const store = createStore({
		initialState: createInitialCommandState({ commands, isOpen: open, maxResults }),
		reducer: commandReducer,
		dependencies
	});

	// Sync open prop to store
	$effect(() => {
		if (store.state.isOpen !== open) {
			store.dispatch({ type: open ? 'opened' : 'closed' });
		}
	});

	// Sync store to open prop
	$effect(() => {
		open = store.state.isOpen;
	});

	// Sync commands prop to store
	$effect(() => {
		store.dispatch({ type: 'commandsUpdated', commands });
	});

	// Handle keyboard events
	function handleKeyDown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				store.dispatch({ type: 'nextCommand' });
				break;
			case 'ArrowUp':
				event.preventDefault();
				store.dispatch({ type: 'previousCommand' });
				break;
			case 'Enter':
				event.preventDefault();
				store.dispatch({ type: 'executeCommand' });
				break;
			case 'Escape':
				event.preventDefault();
				store.dispatch({ type: 'closed' });
				break;
		}
	}

	// Handle backdrop click
	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			store.dispatch({ type: 'closed' });
		}
	}
</script>

{#if store.state.isOpen}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="command-backdrop" onclick={handleBackdropClick}>
		<!-- Modal Container -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="command-dialog {className}"
			role="dialog"
			aria-modal="true"
			aria-label="Command palette"
			onkeydown={handleKeyDown}
		>
			{#if children}
				{@render children()}
			{/if}
		</div>
	</div>
{/if}

<style>
	.command-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 4rem 1rem;
		animation: fadeIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.command-dialog {
		background: white;
		border-radius: 0.5rem;
		box-shadow:
			0 20px 25px -5px rgba(0, 0, 0, 0.1),
			0 10px 10px -5px rgba(0, 0, 0, 0.04);
		width: 100%;
		max-width: 40rem;
		max-height: 32rem;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		animation: slideIn 0.15s ease-out;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: scale(0.95) translateY(-1rem);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}
</style>
