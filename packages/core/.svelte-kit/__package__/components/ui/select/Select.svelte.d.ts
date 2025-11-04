import type { SelectOption } from './select.types.js';
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
declare const Select: import("svelte").Component<SelectProps<string>, {}, "value">;
type Select = ReturnType<typeof Select>;
export default Select;
//# sourceMappingURL=Select.svelte.d.ts.map