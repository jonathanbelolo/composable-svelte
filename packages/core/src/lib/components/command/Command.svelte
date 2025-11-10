<!--
	Command Palette Component

	A reducer-driven command palette with search, keyboard navigation, and action dispatch.

	Features:
	- Search/filter commands
	- Keyboard navigation (Arrow Up/Down, Enter, Escape)
	- Modal overlay with Motion One animations
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
	import { animateModalIn, animateModalOut, animateBackdropIn, animateBackdropOut } from '../../animation/animate.js';

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
		if ($store.isOpen !== open) {
			store.dispatch({ type: open ? 'opened' : 'closed' });
		}
	});

	// Sync store to open prop
	$effect(() => {
		open = $store.isOpen;
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

	// Animation integration
	let contentElement: HTMLElement | undefined = $state();
	let backdropElement: HTMLElement | undefined = $state();
	let lastAnimatedContent: any = $state(null);

	// Watch presentation status and trigger animations
	$effect(() => {
		if (!$store.presentation || !contentElement || !backdropElement) return;

		const presentation = $store.presentation;
		const currentContent = presentation.content;

		if (presentation.status === 'presenting' && lastAnimatedContent !== currentContent) {
			lastAnimatedContent = currentContent;
			// Animate in: content + backdrop in parallel
			Promise.all([
				animateModalIn(contentElement),
				animateBackdropIn(backdropElement)
			]).then(() => {
				store.dispatch({
					type: 'presentation',
					event: { type: 'presentationCompleted' }
				});
			});
		}

		if (presentation.status === 'dismissing' && lastAnimatedContent === currentContent) {
			lastAnimatedContent = null;
			// Animate out: content + backdrop in parallel
			Promise.all([
				animateModalOut(contentElement),
				animateBackdropOut(backdropElement)
			]).then(() => {
				store.dispatch({
					type: 'presentation',
					event: { type: 'dismissalCompleted' }
				});
			});
		}
	});

	// Visible when presentation is not idle
	const visible = $derived(
		$store.presentation.status !== 'idle'
	);
</script>

{#if visible}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div bind:this={backdropElement} class="command-backdrop" onclick={handleBackdropClick}>
		<!-- Modal Container -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={contentElement}
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
	}
</style>
