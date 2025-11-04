import type { ComboboxOption } from './combobox.types.js';
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
declare const Combobox: import("svelte").Component<ComboboxProps<string>, {}, "value">;
type Combobox = ReturnType<typeof Combobox>;
export default Combobox;
//# sourceMappingURL=Combobox.svelte.d.ts.map