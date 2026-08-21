<script lang="ts">
	import { createStore } from '../../../store.svelte.js';
	import { selectReducer } from './select.reducer.js';
	import { createInitialSelectState } from './select.types.js';
	import type { SelectOption } from './select.types.js';
	import { cn } from '../../../utils.js';
	import {
		animateChevron,
		animateDropdownIn,
		animateDropdownOut
	} from '../../../animation/animate.js';

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
		 * `id` for the trigger, so a `<label for=…>` can address it.
		 *
		 * The component does not spread rest props, so without this an `id`
		 * passed by a consumer was silently dropped and their label association
		 * did nothing.
		 */
		id?: string | undefined;

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
		id,
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
		if ($store.selected !== value) {
			store.dispatch({ type: 'valueChanged', value });
		}
	});

	// Sync options changes
	$effect(() => {
		store.dispatch({ type: 'optionsChanged', options });
	});

	let containerElement: HTMLElement | null = $state(null);
	let triggerElement: HTMLElement | null = $state(null);
	let dropdownElement: HTMLElement | null = $state(null);
	let searchInputElement: HTMLInputElement | null = $state(null);

	// Get display text for selected value(s)
	const displayText = $derived.by(() => {
		if (!$store.selected) return placeholder;

		if (multiple && Array.isArray($store.selected)) {
			if ($store.selected.length === 0) return placeholder;
			const labels = $store.selected
				.map((val) => options.find((o) => o.value === val)?.label)
				.filter(Boolean);
			return labels.join(', ');
		}

		const option = options.find((o) => o.value === $store.selected);
		return option?.label || placeholder;
	});

	// Check if an option is selected
	function isSelected(optionValue: any): boolean {
		if (multiple && Array.isArray($store.selected)) {
			return $store.selected.includes(optionValue);
		}
		return $store.selected === optionValue;
	}

	function handleTriggerClick() {
		if (disabled) return;
		store.dispatch({ type: 'toggled' });

		// Focus search input when opening
		if (!$store.isOpen && searchable) {
			setTimeout(() => searchInputElement?.focus(), 10);
		}
	}

	function handleTriggerKeyDown(event: KeyboardEvent) {
		if (disabled) return;

		// When dropdown is open, let window handler handle all keys
		if ($store.isOpen) return;

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
		// The whole container, not trigger + dropdown: the clear button is a
		// sibling of the trigger, so a narrower test would treat clearing as an
		// outside click and close the dropdown.
		if (containerElement && !containerElement.contains(event.target as Node)) {
			store.dispatch({ type: 'closed' });
		}
	}

	$effect(() => {
		if (!$store.isOpen) return;

		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});

	// Rotate the caret on the dropdown's own timeline. A utility-class transition
	// would be a second, unrelated one — and unobservable under test, since
	// Tailwind is not compiled here. Plain `let` guard: the effect reads and
	// writes it, and a reactive guard re-triggers the effect it lives in.

	// Captured once, never reactive — this is the element's position *before* any
	// animation, and it is the only thing the server can emit. `$effect` does not
	// run during SSR, so a purely effect-driven transform renders every chevron
	// unrotated on the server and pops on hydration. Verified by compiling with
	// `generate: 'server'`.
	//
	// Because it never changes, Svelte writes it once and then leaves the property
	// alone, which keeps invariant 6 (one property, one author): the markup places,
	// Motion One animates.
	const initialChevronTransform = $store.isOpen ? 'rotate(180deg)' : 'rotate(0deg)';

	let chevronElement: SVGElement | null = $state(null);
	let lastRotated: boolean | undefined = undefined;

	$effect(() => {
		const open = $store.isOpen;
		if (!chevronElement || lastRotated === open) return;
		const first = lastRotated === undefined;
		lastRotated = open;
		if (first) {
			// Placement is the markup's job (see `initialChevronTransform`); the
			// first run only seeds the guard.
			return;
		}
		animateChevron(chevronElement, open);
	});

	// Drive the dropdown's own lifecycle. `dropdownElement` was bound and read by
	// nothing — it is precisely the handle these helpers need.
	//
	// Plain `let` guard keyed on the (status, content) pair, per
	// guides/ANIMATION-GUIDELINES.md: a reactive guard would re-trigger the effect
	// it lives in, and a "have I animated yet" guard deadlocks a component that
	// mounts already open.
	let lastAnimated: { status: string; content: unknown } | null = null;

	$effect(() => {
		const presentation = $store.presentation;
		if (!dropdownElement) return;

		if (presentation.status === 'idle') {
			lastAnimated = null;
			return;
		}

		const { status, content } = presentation;
		if (lastAnimated?.status === status && lastAnimated.content === content) return;
		lastAnimated = { status, content };

		if (status === 'presenting') {
			animateDropdownIn(dropdownElement).then(() => {
				queueMicrotask(() =>
					store.dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } })
				);
			});
		} else if (status === 'dismissing') {
			animateDropdownOut(dropdownElement).then(() => {
				queueMicrotask(() =>
					store.dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })
				);
			});
		}
	});
</script>

<svelte:window onkeydown={handleDropdownKeyDown} />

<div bind:this={containerElement} class="relative inline-block w-full">
	<!-- Trigger -->
	<div class="relative">
		<button
			bind:this={triggerElement}
			{id}
			type="button"
			class={cn(
				'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm',
				'ring-offset-background placeholder:text-muted-foreground',
				'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
				disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
				// Reserve room for the overlaid controls. Keyed on the same
				// condition as the clear button so the text area reflows exactly
				// as it did when they shared a flex row.
				$store.selected && !disabled ? 'pr-[3.25rem]' : 'pr-7',
				className
			)}
			aria-haspopup="listbox"
			aria-expanded={$store.isOpen}
			{disabled}
			onclick={handleTriggerClick}
			onkeydown={handleTriggerKeyDown}
		>
			<span class={cn('truncate', !$store.selected && 'text-muted-foreground')}>
				{displayText}
			</span>
		</button>

		<!-- Controls: siblings of the trigger, not children. A <button> inside a
		     <button> is invalid HTML — the parser closes the outer one, so a
		     server-rendered Select hydrated against a different tree. -->
		<div class="absolute inset-y-0 right-0 flex items-center gap-2 pr-3">
			{#if $store.selected && !disabled}
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground"
					aria-label="Clear selection"
					onclick={handleClear}
				>
					<svg
						aria-hidden="true"
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
				bind:this={chevronElement}
				style:transform={initialChevronTransform}
			>
				<polyline points="6 9 12 15 18 9"></polyline>
			</svg>
		</div>
	</div>

	<!-- Dropdown -->
	<!-- Mounted while open *and* while dismissing, so the exit animation has
	     something to animate. `isOpen` alone unmounts on the same tick. -->
	{#if $store.isOpen || $store.presentation.status === 'dismissing'}
		<div
			bind:this={dropdownElement}
			style:opacity={$store.presentation.status === 'presenting' ? '0' : undefined}
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
						value={$store.searchQuery}
						oninput={handleSearchInput}
					/>
				</div>
			{/if}

			<div class="p-1">
				{#if $store.filteredOptions.length === 0}
					<div class="px-2 py-6 text-center text-sm text-muted-foreground">
						No options found
					</div>
				{:else}
					{#each $store.filteredOptions as option, index}
						<button
							type="button"
							class={cn(
								'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left outline-none',
								'',
								$store.highlightedIndex === index
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
