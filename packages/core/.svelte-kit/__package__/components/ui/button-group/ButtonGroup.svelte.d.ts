import type { HTMLAttributes } from 'svelte/elements';
/**
 * ButtonGroup component - Group multiple buttons together with connected styling.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <ButtonGroup>
 *   <Button variant="outline">Left</Button>
 *   <Button variant="outline">Middle</Button>
 *   <Button variant="outline">Right</Button>
 * </ButtonGroup>
 *
 * <!-- Vertical orientation -->
 * <ButtonGroup orientation="vertical">
 *   <Button variant="outline">Top</Button>
 *   <Button variant="outline">Middle</Button>
 *   <Button variant="outline">Bottom</Button>
 * </ButtonGroup>
 * ```
 */
interface ButtonGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
    /**
     * Layout orientation.
     */
    orientation?: 'horizontal' | 'vertical';
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Button elements.
     */
    children?: import('svelte').Snippet;
}
declare const ButtonGroup: import("svelte").Component<ButtonGroupProps, {}, "">;
type ButtonGroup = ReturnType<typeof ButtonGroup>;
export default ButtonGroup;
//# sourceMappingURL=ButtonGroup.svelte.d.ts.map