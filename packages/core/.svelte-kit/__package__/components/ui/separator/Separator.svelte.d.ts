import type { HTMLAttributes } from 'svelte/elements';
/**
 * Separator component for visual division.
 *
 * @packageDocumentation
 */
interface SeparatorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
    /**
     * Orientation of the separator.
     * @default 'horizontal'
     */
    orientation?: 'horizontal' | 'vertical';
    /**
     * Whether the separator is decorative (hidden from screen readers).
     * @default true
     */
    decorative?: boolean;
    /**
     * Additional CSS classes to apply.
     */
    class?: string;
}
declare const Separator: import("svelte").Component<SeparatorProps, {}, "">;
type Separator = ReturnType<typeof Separator>;
export default Separator;
//# sourceMappingURL=Separator.svelte.d.ts.map