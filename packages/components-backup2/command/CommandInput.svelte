<!--
	CommandInput Component

	Search input for the command palette.
	Dispatches queryChanged actions as user types.

	@component
-->
<script lang="ts">
	import type { Store } from '../../store.svelte.js';
	import type { CommandState, CommandAction } from './command.types.js';

	interface CommandInputProps {
		/**
		 * Store managing command state.
		 */
		store: Store<CommandState, CommandAction>;

		/**
		 * Placeholder text.
		 */
		placeholder?: string;

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Whether to autofocus on mount.
		 */
		autofocus?: boolean;
	}

	let {
		store,
		placeholder = 'Search commands...',
		class: className = '',
		autofocus = true
	}: CommandInputProps = $props();

	let inputRef: HTMLInputElement;

	$effect(() => {
		if (autofocus && inputRef) {
			inputRef.focus();
		}
	});

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		store.dispatch({ type: 'queryChanged', query: target.value });
	}

	function handleClear() {
		if (inputRef) {
			inputRef.value = '';
		}
		store.dispatch({ type: 'clearQuery' });
		inputRef?.focus();
	}
</script>

<div class="command-input-wrapper {className}">
	<!-- Search Icon -->
	<svg
		class="command-input-icon"
		xmlns="http://www.w3.org/2000/svg"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<circle cx="11" cy="11" r="8"></circle>
		<path d="m21 21-4.35-4.35"></path>
	</svg>

	<!-- Input -->
	<input
		bind:this={inputRef}
		type="text"
		class="command-input"
		{placeholder}
		value={store.state.query}
		oninput={handleInput}
		autocomplete="off"
		spellcheck="false"
	/>

	<!-- Clear Button (when query exists) -->
	{#if store.state.query}
		<button
			type="button"
			class="command-input-clear"
			onclick={handleClear}
			aria-label="Clear search"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<line x1="18" y1="6" x2="6" y2="18"></line>
				<line x1="6" y1="6" x2="18" y2="18"></line>
			</svg>
		</button>
	{/if}
</div>

<style>
	.command-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.command-input-icon {
		flex-shrink: 0;
		color: #9ca3af;
	}

	.command-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		font-size: 0.875rem;
		color: #111827;
	}

	.command-input::placeholder {
		color: #9ca3af;
	}

	.command-input-clear {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1.25rem;
		height: 1.25rem;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 0.25rem;
		cursor: pointer;
		color: #9ca3af;
		transition: all 0.15s;
	}

	.command-input-clear:hover {
		background: #f3f4f6;
		color: #374151;
	}
</style>
