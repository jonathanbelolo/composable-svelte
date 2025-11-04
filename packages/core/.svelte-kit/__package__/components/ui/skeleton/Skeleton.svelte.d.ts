import type { HTMLAttributes } from 'svelte/elements';
/**
 * Skeleton component for loading state placeholders.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <!-- Avatar skeleton -->
 * <Skeleton class="h-12 w-12" variant="circle" />
 *
 * <!-- Text line skeleton -->
 * <Skeleton class="h-4 w-full" variant="text" />
 * <Skeleton class="h-4 w-3/4" variant="text" />
 *
 * <!-- Card skeleton -->
 * <Skeleton class="h-32 w-full" />
 *
 * <!-- Custom skeleton -->
 * <Skeleton class="h-20 w-40 rounded-xl" />
 * ```
 */
interface SkeletonProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
    /**
     * Shape variant of the skeleton.
     * - default: Rectangle with rounded corners
     * - circle: Circular shape (for avatars)
     * - text: Thin line (for text placeholders)
     */
    variant?: 'default' | 'circle' | 'text';
    /**
     * Additional CSS classes.
     */
    class?: string;
}
declare const Skeleton: import("svelte").Component<SkeletonProps, {}, "">;
type Skeleton = ReturnType<typeof Skeleton>;
export default Skeleton;
//# sourceMappingURL=Skeleton.svelte.d.ts.map