<script lang="ts">
	import { createStore } from '../../../store.svelte.js';
	import { dropdownMenuReducer } from './dropdown-menu.reducer.js';
	import { createInitialDropdownMenuState } from './dropdown-menu.types.js';
	import type { MenuItem } from './dropdown-menu.types.js';
	import { cn } from '../../../utils.js';
	import type { Snippet } from 'svelte';
	import { animateDropdownIn, animateDropdownOut } from '../../../animation/animate.js';

	/**
	 * DropdownMenu component - Interactive menu with keyboard navigation.
	 *
	 * Uses Composable Architecture pattern with reducer and store for
	 * keyboard navigation and state management.
	 *
	 * @example
	 * ```svelte
	 * <DropdownMenu
	 *   items={[
	 *     { id: '1', label: 'Edit', icon: 'pencil' },
	 *     { id: '2', label: 'Delete', icon: 'trash' },
	 *     { id: 'sep1', isSeparator: true },
	 *     { id: '3', label: 'Archive', icon: 'archive' }
	 *   ]}
	 *   onSelect={(item) => console.log(item.label)}
	 * >
	 *   <Button>Actions</Button>
	 * </DropdownMenu>
	 * ```
	 */

	interface DropdownMenuProps {
		/**
		 * Menu items to display.
		 */
		items: MenuItem[];

		/**
		 * Callback when an item is selected.
		 */
		onSelect?: ((item: MenuItem) => void) | undefined;

		/**
		 * Menu alignment relative to trigger.
		 * @default 'start'
		 */
		align?: 'start' | 'end' | undefined;

		/**
		 * Additional CSS classes for menu container.
		 */
		class?: string | undefined;

		/**
		 * Trigger element (button/link).
		 */
		children: Snippet;
	}

	let {
		items,
		onSelect,
		align = 'start',
		class: className,
		children
	}: DropdownMenuProps = $props();

	// Create dropdown menu store with reducer
	const store = createStore({
		initialState: createInitialDropdownMenuState(items),
		reducer: dropdownMenuReducer,
		// Getters, not values: `createStore` re-reads `config.dependencies` on
		// every dispatch, but a plain object literal freezes what these resolve
		// to at setup, so swapping a callback prop left the store calling the
		// original. Mirrors `ui/file-upload/FileUpload.svelte:43-59`.
		dependencies: {
			get onSelect() {
				return onSelect;
			}
		}
	});

	let triggerElement: HTMLElement | null = $state(null);
	let menuElement: HTMLElement | null = $state(null);


	// The (status, content) pair this effect last acted on.
	//
	// Not $state: the effect below reads and writes it, and a reactive guard would
	// re-trigger the effect it lives in (effect_update_depth_exceeded).
	//
	// Keyed on the *pair*, not on "have I animated anything yet". Those two
	// questions only diverge when the component mounts already `presented` — SSR
	// hydration of a page rendered with this overlay open — and the difference is
	// a permanent deadlock: the collapse branch is refused, `dismissalCompleted`
	// never fires, and the reducer's own `status !== 'presented'` guard then
	// rejects every further dismiss.
	let lastAnimated: { status: string; content: unknown } | null = null;

	function handleTriggerClick() {
		store.dispatch({ type: 'toggled' });
	}

	function handleTriggerKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			store.dispatch({ type: 'toggled' });
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			if (!$store.isOpen) {
				store.dispatch({ type: 'opened' });
				store.dispatch({ type: 'arrowDown' });
			}
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			if (!$store.isOpen) {
				store.dispatch({ type: 'opened' });
				store.dispatch({ type: 'arrowUp' });
			}
		}
	}

	function handleMenuKeyDown(event: KeyboardEvent) {
		if (!$store.isOpen) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				store.dispatch({ type: 'arrowDown' });
				break;
			case 'ArrowUp':
				event.preventDefault();
				store.dispatch({ type: 'arrowUp' });
				break;
			case 'Home':
				event.preventDefault();
				store.dispatch({ type: 'home' });
				break;
			case 'End':
				event.preventDefault();
				store.dispatch({ type: 'end' });
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				if ($store.highlightedIndex !== -1) {
					store.dispatch({ type: 'itemSelected', index: $store.highlightedIndex });
				}
				break;
			case 'Escape':
				event.preventDefault();
				store.dispatch({ type: 'escape' });
				break;
		}
	}

	function handleItemClick(index: number) {
		store.dispatch({ type: 'itemSelected', index });
	}

	function handleItemMouseEnter(index: number) {
		store.dispatch({ type: 'itemHighlighted', index });
	}

	// Close on click outside
	function handleClickOutside(event: MouseEvent) {
		if (
			!menuElement?.contains(event.target as Node) &&
			!triggerElement?.contains(event.target as Node)
		) {
			store.dispatch({ type: 'closed' });
		}
	}

	// Register click outside handler
	$effect(() => {
		if (!$store.isOpen) return;

		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});

	// Animation integration
	$effect(() => {
		if (!menuElement) return;

		if ($store.presentation.status === 'idle') {
			lastAnimated = null;
			return;
		}

		const { status, content } = $store.presentation;
		if (lastAnimated?.status === status && lastAnimated.content === content) return;
		lastAnimated = { status, content };

		if (status === 'presenting') {
			animateDropdownIn(menuElement).then(() => {
				queueMicrotask(() =>
					store.dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } })
				);
			});
		}

		if (status === 'dismissing') {
			animateDropdownOut(menuElement).then(() => {
				queueMicrotask(() =>
					store.dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })
				);
			});
		}
	});
</script>

<svelte:window on:keydown={handleMenuKeyDown} />

<div class="relative inline-block">
	<!-- Trigger -->
	<div
		bind:this={triggerElement}
		role="button"
		tabindex="0"
		aria-haspopup="true"
		aria-expanded={$store.isOpen}
		onclick={handleTriggerClick}
		onkeydown={handleTriggerKeyDown}
	>
		{@render children()}
	</div>

	<!-- Menu -->
	{#if $store.isOpen || $store.presentation.status === 'dismissing'}
		<div
			bind:this={menuElement}
			class={cn(
				'absolute z-50 mt-2 min-w-[200px] rounded-md border border-border bg-popover p-1 shadow-md',
				align === 'start' ? 'left-0' : 'right-0',
				className
			)}
			style:opacity={$store.presentation.status === 'presenting' ? '0' : undefined}
			role="menu"
			aria-orientation="vertical"
		>
			{#each $store.items as item, index}
				{#if item.isSeparator}
					<div class="my-1 h-px bg-border" role="separator"></div>
				{:else}
					<button
						type="button"
						tabindex="-1"
						class={cn(
							'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none',
							$store.highlightedIndex === index
								? 'bg-accent text-accent-foreground'
								: 'text-foreground',
							item.disabled
								? 'pointer-events-none opacity-50'
								: 'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground'
						)}
						role="menuitem"
						disabled={item.disabled}
						onclick={() => handleItemClick(index)}
						onmouseenter={() => handleItemMouseEnter(index)}
					>
						{#if item.icon}
							<span class="text-muted-foreground">{item.icon}</span>
						{/if}
						<span class="flex-1 text-left">{item.label}</span>
						{#if item.shortcut}
							<span class="text-xs text-muted-foreground">{item.shortcut}</span>
						{/if}
					</button>
				{/if}
			{/each}
		</div>
	{/if}
</div>
