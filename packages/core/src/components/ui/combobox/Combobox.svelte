<script lang="ts">
	import { createStore } from '../../../store.svelte.js';
	import { comboboxReducer } from './combobox.reducer.js';
	import { createInitialComboboxState } from './combobox.types.js';
	import type { ComboboxOption } from './combobox.types.js';
	import { animateDropdownIn, animateDropdownOut } from '../../../animation/animate.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { cn } from '$lib/utils.js';

	/**
	 * Combobox component - Searchable select with async loading support.
	 *
	 * Uses Composable Architecture pattern with reducer and store for
	 * state management, keyboard navigation, and debounced async loading.
	 *
	 * @example
	 * ```svelte
	 * <Combobox
	 *   options={[
	 *     { value: 'apple', label: 'Apple', description: 'A red fruit' },
	 *     { value: 'banana', label: 'Banana', description: 'A yellow fruit' }
	 *   ]}
	 *   bind:value={selectedValue}
	 *   placeholder="Search fruits..."
	 * />
	 *
	 * <!-- Async mode -->
	 * <Combobox
	 *   bind:value={selectedValue}
	 *   loadOptions={async (query) => await fetchOptions(query)}
	 *   placeholder="Search..."
	 * />
	 * ```
	 */

	interface ComboboxProps<T = string> {
		/**
		 * Available options (for local/sync mode).
		 */
		options?: ComboboxOption<T>[];

		/**
		 * Selected value.
		 * Use bind:value for two-way binding.
		 */
		value?: T | null;

		/**
		 * Placeholder text.
		 */
		placeholder?: string;

		/**
		 * Disabled state.
		 */
		disabled?: boolean;

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Async function to load options based on query.
		 * If provided, enables async mode.
		 */
		loadOptions?: (query: string) => Promise<ComboboxOption<T>[]>;

		/**
		 * Callback when value changes.
		 */
		onchange?: (value: T | null) => void;

		/**
		 * Debounce delay in milliseconds for async searches (default: 300).
		 */
		debounceDelay?: number;
	}

	let {
		options = [],
		value = $bindable(null),
		placeholder = 'Search...',
		disabled = false,
		class: className,
		loadOptions,
		onchange,
		debounceDelay = 300
	}: ComboboxProps = $props();

	// Create combobox store with reducer
	const store = createStore({
		initialState: createInitialComboboxState(options, value, debounceDelay),
		reducer: comboboxReducer,
		dependencies: {
			onChange: (newValue) => {
				value = newValue;
				onchange?.(newValue);
			},
			loadOptions
		}
	});

	// Sync external value changes to store
	$effect(() => {
		if (store.state.selected !== value) {
			store.state.selected = value;
		}
	});

	// Sync options changes (for local mode)
	$effect(() => {
		if (!loadOptions) {
			store.state.options = options;
			store.state.filteredOptions = options;
		}
	});

	let containerElement: HTMLElement | null = $state(null);
	let inputElement: HTMLInputElement | null = $state(null);
	let dropdownElement: HTMLElement | null = $state(null);

	// Get display value for input
	const displayValue = $derived(() => {
		if (store.state.searchQuery) {
			return store.state.searchQuery;
		}

		if (store.state.selected) {
			const selectedOption = store.state.options.find((o) => o.value === store.state.selected);
			return selectedOption?.label || '';
		}

		return '';
	});

	// Get selected option for display when not focused
	const selectedOption = $derived(
		store.state.options.find((o) => o.value === store.state.selected)
	);

	function handleInputFocus() {
		if (disabled) return;
		store.dispatch({ type: 'opened' });
	}

	function handleInputClick() {
		if (disabled) return;
		store.dispatch({ type: 'opened' });
	}

	function handleInputChange(event: Event) {
		const input = event.target as HTMLInputElement;
		store.dispatch({ type: 'searchChanged', query: input.value });
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (disabled) return;

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
				break;
			case 'Escape':
				event.preventDefault();
				store.dispatch({ type: 'escape' });
				inputElement?.blur();
				break;
		}
	}

	function handleOptionClick(optionValue: any) {
		store.dispatch({ type: 'optionSelected', value: optionValue });
	}

	function handleOptionMouseEnter(index: number) {
		store.dispatch({ type: 'highlightChanged', index });
	}

	function handleClear(event: Event) {
		event.stopPropagation();
		store.dispatch({ type: 'cleared' });
		inputElement?.focus();
	}

	// Close on click outside
	function handleClickOutside(event: MouseEvent) {
		if (containerElement && !containerElement.contains(event.target as Node)) {
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

	// Track previous isOpen state for animation
	let previousIsOpen = $state(false);

	// Animate dropdown open/close using centralized animation system
	$effect(() => {
		const isOpen = store.state.isOpen;

		// Skip animation on initial render
		if (previousIsOpen === isOpen) {
			return;
		}

		previousIsOpen = isOpen;

		if (!dropdownElement) return;

		if (isOpen) {
			animateDropdownIn(dropdownElement);
		} else {
			animateDropdownOut(dropdownElement);
		}
	});
</script>

<div bind:this={containerElement} class="relative inline-block w-full">
	<!-- Input -->
	<div class="relative">
		<input
			bind:this={inputElement}
			type="text"
			class={cn(
				'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
				'ring-offset-background placeholder:text-muted-foreground',
				'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
				disabled ? 'cursor-not-allowed opacity-50' : '',
				className
			)}
			{placeholder}
			{disabled}
			value={displayValue()}
			role="combobox"
			aria-expanded={store.state.isOpen}
			aria-autocomplete="list"
			aria-controls="combobox-dropdown"
			onfocus={handleInputFocus}
			onclick={handleInputClick}
			oninput={handleInputChange}
			onkeydown={handleKeyDown}
		/>

		<!-- Icons -->
		<div class="absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
			{#if store.state.isLoading}
				<div class="text-muted-foreground">
					<Spinner size="sm" />
				</div>
			{:else if store.state.selected && !disabled}
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground"
					onclick={handleClear}
					tabindex="-1"
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
				class={cn('text-muted-foreground transition-transform', store.state.isOpen && 'rotate-180')}
			>
				<polyline points="6 9 12 15 18 9"></polyline>
			</svg>
		</div>
	</div>

	<!-- Dropdown -->
	{#if store.state.isOpen}
		<div
			bind:this={dropdownElement}
			id="combobox-dropdown"
			class="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover shadow-md"
			role="listbox"
		>
			<div class="p-1">
				{#if store.state.isLoading}
					<div class="flex items-center justify-center px-2 py-6 text-sm text-muted-foreground">
						<Spinner size="sm" class="mr-2" />
						Loading...
					</div>
				{:else if store.state.filteredOptions.length === 0}
					<div class="px-2 py-6 text-center text-sm text-muted-foreground">No results found</div>
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
									: 'hover:bg-accent hover:text-accent-foreground',
								store.state.selected === option.value && 'font-medium'
							)}
							role="option"
							aria-selected={store.state.selected === option.value}
							disabled={option.disabled}
							onclick={() => handleOptionClick(option.value)}
							onmouseenter={() => handleOptionMouseEnter(index)}
						>
							<div class="flex-1">
								<div>{option.label}</div>
								{#if option.description}
									<div class="text-xs text-muted-foreground">
										{option.description}
									</div>
								{/if}
							</div>
							{#if store.state.selected === option.value}
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
