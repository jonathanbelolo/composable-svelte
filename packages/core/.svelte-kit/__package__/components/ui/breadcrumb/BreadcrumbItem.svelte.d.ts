import type { Snippet } from 'svelte';
import type { HTMLLiAttributes } from 'svelte/elements';
interface BreadcrumbItemProps extends HTMLLiAttributes {
    children: Snippet;
    class?: string;
}
declare const BreadcrumbItem: import("svelte").Component<BreadcrumbItemProps, {}, "">;
type BreadcrumbItem = ReturnType<typeof BreadcrumbItem>;
export default BreadcrumbItem;
//# sourceMappingURL=BreadcrumbItem.svelte.d.ts.map