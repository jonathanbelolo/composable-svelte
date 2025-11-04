import type { Snippet } from 'svelte';
import type { HTMLLabelAttributes } from 'svelte/elements';
/**
 * Label component for form fields with accessibility support.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <Label for="email">Email Address</Label>
 * <Input id="email" type="email" />
 *
 * <!-- With error state -->
 * <Label for="password" error={!!passwordError}>
 *   Password
 * </Label>
 *
 * <!-- With required indicator -->
 * <Label for="username" required>
 *   Username
 * </Label>
 * ```
 */
interface LabelProps extends Omit<HTMLLabelAttributes, 'class'> {
    /**
     * ID of the associated form element.
     */
    for?: string;
    /**
     * Error state (changes styling to destructive color).
     */
    error?: boolean;
    /**
     * Required field indicator (shows red asterisk).
     */
    required?: boolean;
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Label content.
     */
    children: Snippet;
}
declare const Label: import("svelte").Component<LabelProps, {}, "">;
type Label = ReturnType<typeof Label>;
export default Label;
//# sourceMappingURL=Label.svelte.d.ts.map