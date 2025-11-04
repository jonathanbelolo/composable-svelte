<script lang="ts">
	import { createStore } from '../../../store.svelte.js';
	import { selectReducer } from './select.reducer.js';
	import { createInitialSelectState } from './select.types.js';
	import type { SelectOption } from './select.types.js';
	import { cn } from '../../../lib/utils.js';

	/**
	 * Select component - Dropdown select with search and multi-select support.
	 *
	 * Uses Composable Architecture pattern with reducer and store for
	 * state management and keyboard navigation.
	 *
	 * @example
	 * ```svelte
	 * <Select
	 *   options={[
	 *     { value: 'apple', label: 'Apple' },
	 *     { value: 'banana', label: 'Banana' },
	 *     { value: 'orange', label: 'Orange' }
	 *   ]}
	 *   bind:value={selectedValue}
	 *   placeholder="Select a fruit..."
	 * />
	 * ```
	 */

	interface SelectProps<T = string> {
		/**
		 * Available options.
		 */
		options: SelectOption<T>[];

		/**
		 * Selected value (single or multi-select array).
		 * Use bind:value for two-way binding.
		 */
		value?: T | T[] | null;

		/**
		 * Placeholder text.
		 */
		placeholder?: string;

		/**
		 * Enable search/filter.
		 */
		searchable?: boolean;

		/**
		 * Enable multi-select.
		 */
		multiple?: boolean;

		/**
		 * Disabled state.
		 */
		disabled?: boolean;

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Callback when value changes.
		 */
		onchange?: (value: T | T[] | null) => void;
	}

	let {
		options,
		value = $bindable(null),
		placeholder = 'Select an option...',
		searchable = false,
		multiple = false,
		disabled = false,
		class: className,
		onchange
	}: SelectProps = $props();

	// Create select store with reducer
	const store = createStore({
		initialState: createInitialSelectState(options, value, multiple),
		reducer: selectReducer,
		dependencies: {
			onChange: (newValue) => {
				value = newValue;
				onchange?.(newValue);
			}
		}
	});

	// Sync external value changes to store
	$effect(() => {
		if (store.state.selected !== value) {
			store.state.selected = value;
		}
	});

	// Sync options changes
	$effect(() => {
		store.state.options = options;
		store.state.filteredOptions = options;
	});

	let triggerElement: HTMLElement | null = $state(null);
	let dropdownElement: HTMLElement | null = $state(null);
	let searchInputElement: HTMLInputElement | null = $state(null);

	// Get display text for selected value(s)
	const displayText = $derived(() => {
		if (!store.state.selected) return placeholder;

		if (multiple && Array.isArray(store.state.selected)) {
			if (store.state.selected.length === 0) return placeholder;
			const labels = store.state.selected
				.map((val) => options.find((o) => o.value === val)?.label)
				.filter(Boolean);
			return labels.join(', ');
		}

		const option = options.find((o) => o.value === store.state.selected);
		return option?.label || placeholder;
	});

	// Check if an option is selected
	function isSelected(optionValue: any): boolean {
		if (multiple && Array.isArray(store.state.selected)) {
			return store.state.selected.includes(optionValue);
		}
		return store.state.selected === optionValue;
	}

	function handleTriggerClick() {
		if (disabled) return;
		store.dispatch({ type: 'toggled' });

		// Focus search input when opening
		if (!store.state.isOpen && searchable) {
			setTimeout(() => searchInputElement?.focus(), 10);
		}
	}

	function handleTriggerKeyDown(event: KeyboardEvent) {
		if (disabled) return;

		// When dropdown is open, let window handler handle all keys
		if (store.state.isOpen) return;

		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			store.dispatch({ type: 'opened' });
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			store.dispatch({ type: 'opened' });
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			store.dispatch({ type: 'opened' });
		}
	}

	function handleDropdownKeyDown(event: KeyboardEvent) {
		if (!store.state.isOpen) return;

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
				event.preventDefault();
				store.dispatch({ type: 'enter' });
				// Don't close on multi-select
				if (!multiple) {
					searchInputElement?.blur();
				}
				break;
			case 'Escape':
				event.preventDefault();
				store.dispatch({ type: 'escape' });
				searchInputElement?.blur();
				break;
		}
	}

	function handleOptionClick(optionValue: any) {
		if (multiple) {
			store.dispatch({ type: 'optionToggled', value: optionValue });
		} else {
			store.dispatch({ type: 'optionSelected', value: optionValue });
		}
	}

	function handleOptionMouseEnter(index: number) {
		store.dispatch({ type: 'highlightChanged', index });
	}

	function handleSearchInput(event: Event) {
		const input = event.target as HTMLInputElement;
		store.dispatch({ type: 'searchChanged', query: input.value });
	}

	function handleClear(event: Event) {
		event.stopPropagation();
		store.dispatch({ type: 'cleared' });
	}

	// Close on click outside
	function handleClickOutside(event: MouseEvent) {
		if (
			!dropdownElement?.contains(event.target as Node) &&
			!triggerElement?.contains(event.target as Node)
		) {
			store.dispatch({ type: 'closed' });
		}
	}

	$effect(() => {
		if (store.state.isOpen) {
			document.addEventListener('click', handleClickOutside);
			return () => {
				document.removeEventListener('click', handleClickOutside);
			};
		}
	});
</script>

<svelte:window onkeydown={handleDropdownKeyDown} />

<div class="relative inline-block w-full">
	<!-- Trigger -->
	<button
		bind:this={triggerElement}
		type="button"
		class={cn(
			'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm',
			'ring-offset-background placeholder:text-muted-foreground',
			'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
			disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
			className
		)}
		aria-haspopup="listbox"
		aria-expanded={store.state.isOpen}
		{disabled}
		onclick={handleTriggerClick}
		onkeydown={handleTriggerKeyDown}
	>
		<span class={cn('truncate', !store.state.selected && 'text-muted-foreground')}>
			{displayText()}
		</span>
		<div class="flex items-center gap-2">
			{#if store.state.selected && !disabled}
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground"
					onclick={handleClear}
				>
					<svg
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
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			{/if}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class={cn(
					'transition-transform',
					store.state.isOpen && 'rotate-180'
				)}
			>
				<polyline points="6 9 12 15 18 9"></polyline>
			</svg>
		</div>
	</button>

	<!-- Dropdown -->
	{#if store.state.isOpen}
		<div
			bind:this={dropdownElement}
			class="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover shadow-md"
			role="listbox"
			aria-multiselectable={multiple}
		>
			{#if searchable}
				<div class="sticky top-0 border-b border-border bg-popover p-2">
					<input
						bind:this={searchInputElement}
						type="text"
						class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
						placeholder="Search..."
						value={store.state.searchQuery}
						oninput={handleSearchInput}
					/>
				</div>
			{/if}

			<div class="p-1">
				{#if store.state.filteredOptions.length === 0}
					<div class="px-2 py-6 text-center text-sm text-muted-foreground">
						No options found
					</div>
				{:else}
					{#each store.state.filteredOptions as option, index}
						<button
							type="button"
							class={cn(
								'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left outline-none',
								'transition-colors',
								store.state.highlightedIndex === index
									? 'bg-accent text-accent-foreground'
									: 'text-foreground',
								option.disabled
									? 'pointer-events-none opacity-50'
									: 'hover:bg-accent hover:text-accent-foreground'
							)}
							role="option"
							aria-selected={isSelected(option.value)}
							disabled={option.disabled}
							onclick={() => handleOptionClick(option.value)}
							onmouseenter={() => handleOptionMouseEnter(index)}
						>
							{#if multiple}
								<div
									class={cn(
										'flex h-4 w-4 items-center justify-center rounded border',
										isSelected(option.value)
											? 'border-primary bg-primary text-primary-foreground'
											: 'border-input'
									)}
								>
									{#if isSelected(option.value)}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="3"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<polyline points="20 6 9 17 4 12"></polyline>
										</svg>
									{/if}
								</div>
							{/if}
							<div class="flex-1">
								<div>{option.label}</div>
								{#if option.description}
									<div class="text-xs text-muted-foreground">
										{option.description}
									</div>
								{/if}
							</div>
							{#if !multiple && isSelected(option.value)}
								<svg
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
									<polyline points="20 6 9 17 4 12"></polyline>
								</svg>
							{/if}
						</button>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>
