import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
interface BreadcrumbPageProps extends HTMLAttributes<HTMLSpanElement> {
    children: Snippet;
    class?: string;
}
declare const BreadcrumbPage: import("svelte").Component<BreadcrumbPageProps, {}, "">;
type BreadcrumbPage = ReturnType<typeof BreadcrumbPage>;
export default BreadcrumbPage;
//# sourceMappingURL=BreadcrumbPage.svelte.d.ts.map