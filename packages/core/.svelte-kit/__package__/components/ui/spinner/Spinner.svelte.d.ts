import type { HTMLAttributes } from 'svelte/elements';
/**
 * Spinner loading indicator.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <Spinner size="sm" />
 * <Spinner size="md" />
 * <Spinner size="lg" />
 * ```
 */
interface SpinnerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
    /**
     * Size of the spinner.
     */
    size?: 'sm' | 'md' | 'lg';
    /**
     * Additional CSS classes.
     */
    class?: string;
}
declare const Spinner: import("svelte").Component<SpinnerProps, {}, "">;
type Spinner = ReturnType<typeof Spinner>;
export default Spinner;
//# sourceMappingURL=Spinner.svelte.d.ts.map