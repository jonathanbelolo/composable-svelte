import type { Snippet } from 'svelte';
import type { HTMLAnchorAttributes } from 'svelte/elements';
interface BreadcrumbLinkProps extends HTMLAnchorAttributes {
    children: Snippet;
    class?: string;
    href?: string;
}
declare const BreadcrumbLink: import("svelte").Component<BreadcrumbLinkProps, {}, "">;
type BreadcrumbLink = ReturnType<typeof BreadcrumbLink>;
export default BreadcrumbLink;
//# sourceMappingURL=BreadcrumbLink.svelte.d.ts.map