import type { HTMLAttributes } from 'svelte/elements';
/**
 * Kbd component - Display keyboard keys or shortcuts.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <!-- Single key -->
 * <Kbd>Ctrl</Kbd>
 *
 * <!-- Key combination -->
 * <div class="flex gap-1">
 *   <Kbd>Ctrl</Kbd>
 *   <span>+</span>
 *   <Kbd>C</Kbd>
 * </div>
 *
 * <!-- Small size -->
 * <Kbd size="sm">Esc</Kbd>
 * ```
 */
interface KbdProps extends Omit<HTMLAttributes<HTMLElement>, 'class'> {
    /**
     * Size variant.
     */
    size?: 'sm' | 'base' | 'lg';
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Key content.
     */
    children?: import('svelte').Snippet;
}
declare const Kbd: import("svelte").Component<KbdProps, {}, "">;
type Kbd = ReturnType<typeof Kbd>;
export default Kbd;
//# sourceMappingURL=Kbd.svelte.d.ts.map