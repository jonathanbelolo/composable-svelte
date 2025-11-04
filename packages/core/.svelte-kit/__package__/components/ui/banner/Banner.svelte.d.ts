import type { HTMLAttributes } from 'svelte/elements';
/**
 * Banner component - Static informational message banner with variants.
 *
 * Note: This is different from the navigation Alert component which is used
 * for modal alert dialogs. Use Banner for persistent informational messages.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <!-- Info banner -->
 * <Banner>
 *   <BannerTitle>Info</BannerTitle>
 *   <BannerDescription>This is an informational message.</BannerDescription>
 * </Banner>
 *
 * <!-- Success banner -->
 * <Banner variant="success">
 *   <BannerTitle>Success!</BannerTitle>
 *   <BannerDescription>Your changes have been saved.</BannerDescription>
 * </Banner>
 *
 * <!-- Error banner -->
 * <Banner variant="destructive">
 *   <BannerTitle>Error</BannerTitle>
 *   <BannerDescription>Something went wrong.</BannerDescription>
 * </Banner>
 * ```
 */
interface BannerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
    /**
     * Banner style variant.
     */
    variant?: 'default' | 'success' | 'warning' | 'destructive';
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Banner content.
     */
    children?: import('svelte').Snippet;
}
declare const Banner: import("svelte").Component<BannerProps, {}, "">;
type Banner = ReturnType<typeof Banner>;
export default Banner;
//# sourceMappingURL=Banner.svelte.d.ts.map