import type { HTMLAttributes } from 'svelte/elements';
/**
 * AspectRatio component - Maintains aspect ratio for content.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <!-- 16:9 aspect ratio (default) -->
 * <AspectRatio>
 *   <img src="video-thumbnail.jpg" alt="Video" />
 * </AspectRatio>
 *
 * <!-- Square (1:1) -->
 * <AspectRatio ratio={1}>
 *   <img src="avatar.jpg" alt="Avatar" />
 * </AspectRatio>
 *
 * <!-- 4:3 aspect ratio -->
 * <AspectRatio ratio={4 / 3}>
 *   <iframe src="..." />
 * </AspectRatio>
 *
 * <!-- Custom ratio (21:9 ultrawide) -->
 * <AspectRatio ratio={21 / 9}>
 *   <video src="..." />
 * </AspectRatio>
 * ```
 */
interface AspectRatioProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
    /**
     * Aspect ratio as a number (width / height).
     * Common values:
     * - 16/9 ≈ 1.778 (default, widescreen video)
     * - 4/3 ≈ 1.333 (standard video)
     * - 1 (square)
     * - 21/9 ≈ 2.333 (ultrawide)
     */
    ratio?: number;
    /**
     * Additional CSS classes for the container.
     */
    class?: string;
    /**
     * Content to maintain aspect ratio for.
     */
    children?: import('svelte').Snippet;
}
declare const AspectRatio: import("svelte").Component<AspectRatioProps, {}, "">;
type AspectRatio = ReturnType<typeof AspectRatio>;
export default AspectRatio;
//# sourceMappingURL=AspectRatio.svelte.d.ts.map