import type { HTMLAttributes } from 'svelte/elements';
/**
 * Empty component - Empty state placeholder for lists, grids, etc.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <!-- Basic empty state -->
 * <Empty
 *   title="No items found"
 *   description="Get started by creating a new item."
 * />
 *
 * <!-- With action button -->
 * <Empty
 *   title="No data"
 *   description="Start by uploading some data."
 * >
 *   <Button onclick={handleUpload}>Upload Data</Button>
 * </Empty>
 *
 * <!-- With custom icon -->
 * <Empty title="No results">
 *   {#snippet icon()}
 *     <SearchIcon class="w-12 h-12" />
 *   {/snippet}
 * </Empty>
 * ```
 */
interface EmptyProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
    /**
     * Main title text.
     */
    title: string;
    /**
     * Optional description text.
     */
    description?: string;
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Optional icon/image snippet.
     */
    icon?: import('svelte').Snippet;
    /**
     * Optional action buttons or content.
     */
    children?: import('svelte').Snippet;
}
declare const Empty: import("svelte").Component<EmptyProps, {}, "">;
type Empty = ReturnType<typeof Empty>;
export default Empty;
//# sourceMappingURL=Empty.svelte.d.ts.map