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
<script lang="ts" module>
	import { setContext, getContext } from 'svelte';
	import type { Store as CommandStore } from '../../types.js';
	import type { CommandState as CmdState, CommandAction as CmdAction } from './command.types.js';

	const COMMAND_CONTEXT_KEY = Symbol('command');

	/**
	 * Shares the palette's own store with `CommandInput` / `CommandList` /
	 * `CommandItem`.
	 *
	 * Without it those components each required a `store` prop, so a consumer
	 * built a SECOND store — and everything `<Command>` was configured with
	 * (`commands`, `filterFunction`, `maxResults`, `caseSensitive`, `groups`)
	 * fed the internal one that nothing rendered. Mirrors the pattern in
	 * `ui/accordion/Accordion.svelte`.
	 */
	export function setCommandContext(store: CommandStore<CmdState, CmdAction>) {
		setContext(COMMAND_CONTEXT_KEY, store);
	}

	export function getCommandContext(): CommandStore<CmdState, CmdAction> {
		const store = getContext<CommandStore<CmdState, CmdAction>>(COMMAND_CONTEXT_KEY);
		if (!store) {
			throw new Error(
				'Command context not found. Use CommandInput, CommandList and CommandItem ' +
					'inside <Command>, or pass them a `store` prop explicitly for standalone use.'
			);
		}
		return store;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { createStore } from '../../store.svelte.js';
	import { commandReducer } from './command.reducer.js';
	import type {
		CommandState,
		CommandAction,
		CommandItem,
		CommandGroup,
		CommandDependencies
	} from './command.types.js';
	import type { Store } from '../../types.js';
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
		 * Group definitions: display labels and the order groups appear in.
		 * Membership comes from each command's own `group` id.
		 */
		groups?: CommandGroup[];

		/** Whether the built-in filter matches case. Default: false. */
		caseSensitive?: boolean;

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Default content snippet.
		 */
		/**
		 * Palette content. Receives the palette's own store, so a consumer can
		 * drive it without rebuilding one — though `CommandInput` / `CommandList`
		 * / `CommandItem` read it from context and need nothing passed.
		 *
		 * Widening the payload is non-breaking: `Snippet` is a call-signature
		 * interface, so an existing zero-argument `{#snippet children()}` stays
		 * assignable under TypeScript's fewer-parameters rule.
		 */
		children?: Snippet<[{ store: Store<CommandState, CommandAction> }]>;
	}

	let {
		commands,
		open = $bindable(false),
		onCommandExecute,
		filterFunction,
		maxResults,
		groups,
		caseSensitive,
		class: className = '',
		children
	}: CommandProps = $props();

	// Create dependencies
	// Getters, not values: `createStore` re-reads `config.dependencies` on every
	// dispatch, but a plain object literal freezes what these resolve to at
	// setup. Note the ternary was frozen too, not just the callback it wrapped —
	// a palette mounted without `onCommandExecute` kept `undefined` forever even
	// after the prop arrived. Mirrors `ui/file-upload/FileUpload.svelte:43-59`.
	const dependencies: CommandDependencies = {
		get onCommandExecute() {
			return onCommandExecute
				? (command: CommandItem) => {
						onCommandExecute?.(command);
					}
				: undefined;
		},
		get filterFunction() {
			return filterFunction;
		}
	};

	// Create store
	const store = createStore({
		initialState: createInitialCommandState({
			commands,
			isOpen: open,
			maxResults,
			groups,
			caseSensitive,
			filterFunction
		}),
		reducer: commandReducer,
		dependencies
	});

	/**
	 * Last value the prop and the store agreed on.
	 *
	 * Not $state: read and written by the effect below, and a reactive guard
	 * re-triggers the effect it lives in.
	 */
	let lastSyncedOpen = open;

	/**
	 * One effect owns the two-way binding, because two cannot.
	 *
	 * This used to be a pair — "prop -> store" and "store -> prop" — and they
	 * fought. After a dismissal completed and set `isOpen: false`, the first
	 * effect ran before the second had written `open = false`, saw
	 * `$store.isOpen (false) !== open (true)`, and re-dispatched `opened`. The
	 * palette reopened itself: Escape, a backdrop click and `open={false}` were
	 * all unable to close it.
	 *
	 * The missing information is *which side changed*, which neither effect
	 * could know on its own. `lastSyncedOpen` supplies it: if the prop differs
	 * from it the consumer moved, otherwise the store did.
	 */
	$effect(() => {
		const storeOpen = $store.isOpen;
		const propOpen = open;

		if (propOpen !== lastSyncedOpen) {
			// The consumer changed the prop.
			lastSyncedOpen = propOpen;
			if (storeOpen !== propOpen) {
				store.dispatch({ type: propOpen ? 'opened' : 'closed' });
			}
		} else if (storeOpen !== lastSyncedOpen) {
			// The store changed on its own (Escape, backdrop, command executed).
			lastSyncedOpen = storeOpen;
			open = storeOpen;
		}
	});

	setCommandContext(store);

	// Sync commands AND groups in one effect, deliberately.
	//
	// This effect dispatches while reading store state, which is the shape that
	// has produced `effect_update_depth_exceeded` here before. It converges
	// because `sameCommands` compares by value and returns the identical state
	// when nothing changed — adding a SECOND effect for `groups` would give that
	// guard nothing to hold, so `groups` folds in here and `sameCommands` was
	// extended to compare it.
	$effect(() => {
		store.dispatch({ type: 'commandsUpdated', commands, groups });
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
	// Not $state: the effect below reads and writes this. A reactive guard
	// re-triggers the effect it lives in (effect_update_depth_exceeded).
	//
	// Seeded from the initial presentation rather than always `null`. A palette
	// mounted open starts at `presented` and so never passes through the
	// `presenting` branch below — which is the only place this was assigned. It
	// therefore stayed null, the `dismissing` branch's
	// `lastAnimatedContent === currentContent` guard never matched, and the
	// palette vanished without its out-animation while a prop-opened one faded.
	let lastAnimatedContent: any =
		store.state.presentation.status === 'idle' ? null : store.state.presentation.content;

	// Watch presentation status and trigger animations
	$effect(() => {
		if (!$store.presentation || !contentElement || !backdropElement) return;

		const presentation = $store.presentation;
		// `content` exists on every status except `idle`.
		const currentContent = presentation.status === 'idle' ? null : presentation.content;

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
			tabindex="-1"
			aria-modal="true"
			aria-label="Command palette"
			onkeydown={handleKeyDown}
		>
			{#if children}
				{@render children({ store })}
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
