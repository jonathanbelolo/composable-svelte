import type { HTMLAttributes } from 'svelte/elements';
/**
 * Panel component - Generic content container with border and padding.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <!-- Basic panel -->
 * <Panel>
 *   <p>Panel content</p>
 * </Panel>
 *
 * <!-- With variant -->
 * <Panel variant="bordered">
 *   <p>Bordered panel</p>
 * </Panel>
 *
 * <!-- Elevated panel -->
 * <Panel variant="elevated">
 *   <p>Panel with shadow</p>
 * </Panel>
 * ```
 */
interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
    /**
     * Visual variant of the panel.
     * - default: Standard background with subtle border
     * - bordered: Prominent border
     * - elevated: Shadow elevation
     * - flat: No border or shadow
     */
    variant?: 'default' | 'bordered' | 'elevated' | 'flat';
    /**
     * Additional CSS classes for the panel.
     */
    class?: string;
    /**
     * Panel content.
     */
    children?: import('svelte').Snippet;
}
declare const Panel: import("svelte").Component<PanelProps, {}, "">;
type Panel = ReturnType<typeof Panel>;
export default Panel;
//# sourceMappingURL=Panel.svelte.d.ts.map