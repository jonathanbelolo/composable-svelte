import type { Snippet } from 'svelte';
import type { HTMLOlAttributes } from 'svelte/elements';
interface BreadcrumbListProps extends HTMLOlAttributes {
    children: Snippet;
    class?: string;
}
declare const BreadcrumbList: import("svelte").Component<BreadcrumbListProps, {}, "">;
type BreadcrumbList = ReturnType<typeof BreadcrumbList>;
export default BreadcrumbList;
//# sourceMappingURL=BreadcrumbList.svelte.d.ts.map