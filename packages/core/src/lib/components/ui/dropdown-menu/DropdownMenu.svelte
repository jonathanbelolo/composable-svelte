<script lang="ts">
	import { createStore } from '../../../store.svelte.js';
	import { dropdownMenuReducer } from './dropdown-menu.reducer.js';
	import { createInitialDropdownMenuState } from './dropdown-menu.types.js';
	import type { MenuItem } from './dropdown-menu.types.js';
	import { cn } from '../../../utils.js';
	import { onDestroy, type Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { animateDropdownIn, animateDropdownOut } from '../../../animation/animate.js';
	import { createDismissalBoundary } from '../../../actions/dismissalBoundary.js';

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
	 *     { id: 'sep1', label: '', isSeparator: true },
	 *     { id: '3', label: 'Archive', icon: 'archive' }
	 *   ]}
	 *   onSelect={(item) => console.log(item.label)}
	 * >
	 *   Actions
	 * </DropdownMenu>
	 * ```
	 */

	interface DropdownMenuProps {
		/** Classes for the framework-owned button. Children are non-interactive label content. */
		triggerClass?: HTMLButtonAttributes['class'] | undefined;
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
		 * Non-interactive label content for the framework-owned trigger button.
		 */
		children: Snippet;
	}

	let {
		items,
		triggerClass,
		onSelect,
		align = 'start',
		class: className,
		children
	}: DropdownMenuProps = $props();
	const registerDismissal = createDismissalBoundary();

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

	let previousItems = items;
	$effect(() => {
		if (items === previousItems) return;
		previousItems = items;
		store.dispatch({ type: 'itemsChanged', items });
	});

	let disposed = false;
	onDestroy(() => { disposed = true; store.destroy(); });
	const menuId = $props.id();
	let triggerElement: HTMLElement | null = $state(null);
	let menuElement: HTMLElement | null = $state(null);
	let containerElement: HTMLElement | null = $state(null);


	function handleTriggerClick() {
		store.dispatch({ type: 'toggled' });
	}

	function handleTriggerKeyDown(event: KeyboardEvent) {
		if ($store.isOpen) { handleMenuKeyDown(event); return; }
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			store.dispatch({ type: 'opened' });
			store.dispatch({ type: 'home' });
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			if (!$store.isOpen) {
				event.stopPropagation();
				store.dispatch({ type: 'opened' });
				store.dispatch({ type: 'arrowDown' });
			}
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			if (!$store.isOpen) {
				event.stopPropagation();
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
					triggerElement?.focus();
					store.dispatch({ type: 'itemSelected', index: $store.highlightedIndex });
				}
				break;
			case 'Tab':
				triggerElement?.focus();
				store.dispatch({ type: 'closed' });
				break;
		}
	}

	function handleItemClick(index: number) {
		triggerElement?.focus();
		store.dispatch({ type: 'itemSelected', index });
	}

	function handleItemMouseEnter(index: number) {
		store.dispatch({ type: 'itemHighlighted', index });
	}

	let menuHeldFocus = false;
	const isOpen = $derived($store.isOpen);
	$effect(() => { if (isOpen && menuElement) menuElement.focus({ preventScroll: true }); });
	function handleFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (next && !triggerElement?.contains(next) && !menuElement?.contains(next)) {
			menuHeldFocus = false;
			store.dispatch({ type: 'closed' });
		}
	}

	const isVisible = $derived($store.isOpen || $store.presentation.status === 'dismissing');
	$effect(() => {
		if (!isVisible || !containerElement) return;
		return registerDismissal({
			node: containerElement,
			identity: () => store,
			onPointerOutside: () => {
				if (!$store.isOpen) return;
				const ownerDocument = containerElement?.ownerDocument;
				if (menuHeldFocus && ownerDocument && (ownerDocument.activeElement === ownerDocument.body || menuElement?.contains(ownerDocument.activeElement))) triggerElement?.focus({ preventScroll: true });
				menuHeldFocus = false;
				store.dispatch({ type: 'closed' });
			},
			onEscape: () => {
				if (!$store.isOpen) return;
				triggerElement?.focus();
				store.dispatch({ type: 'escape' });
			}
		});
	});

	const highlightedIndex = $derived($store.highlightedIndex);
	$effect(() => {
		if (isOpen && highlightedIndex >= 0 && menuElement) {
			menuElement.querySelector<HTMLElement>(`[id="${menuId}-item-${highlightedIndex}"]`)?.scrollIntoView({ block: 'nearest' });
		}
	});

	// Each rendered transition owns its playback and completion; a successor aborts it.
	const presentationStatus = $derived($store.presentation.status);
	$effect(() => {
		if (!menuElement || (presentationStatus !== 'presenting' && presentationStatus !== 'dismissing')) return;
		const controller = new AbortController();
		const entering = presentationStatus === 'presenting';
		const playback = entering ? animateDropdownIn(menuElement, controller.signal) : animateDropdownOut(menuElement, controller.signal);
		void playback.then(() => {
			if (!disposed && !controller.signal.aborted) store.dispatch({ type: 'presentation', event: { type: entering ? 'presentationCompleted' : 'dismissalCompleted' } });
		});
		return () => controller.abort();
	});
</script>


<div bind:this={containerElement} class="relative inline-block" onfocusout={handleFocusOut}>
	<!-- Explicit role preserves the existing trigger selector contract on a native button. -->
	<!-- svelte-ignore a11y_no_redundant_roles -->
	<button
		type="button"
		class={cn('inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-primary text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', triggerClass)}
		bind:this={triggerElement}
		role="button"
		tabindex="0"
		id={`${menuId}-trigger`}
		aria-controls={$store.isOpen ? menuId : undefined}
		aria-haspopup="menu"
		aria-expanded={$store.isOpen}
		onclick={handleTriggerClick}
		onkeydown={handleTriggerKeyDown}
	>
		{@render children()}
	</button>

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
			id={menuId}
			tabindex="-1"
			onfocusin={() => { menuHeldFocus = true; }}
			onkeydown={handleMenuKeyDown}
			inert={!$store.isOpen}
			aria-labelledby={`${menuId}-trigger`}
			aria-activedescendant={$store.highlightedIndex >= 0 ? `${menuId}-item-${$store.highlightedIndex}` : undefined}
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
						id={`${menuId}-item-${index}`}
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
