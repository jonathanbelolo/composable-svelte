import type { HTMLAttributes } from 'svelte/elements';
interface BannerDescriptionProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
    class?: string;
    children?: import('svelte').Snippet;
}
declare const BannerDescription: import("svelte").Component<BannerDescriptionProps, {}, "">;
type BannerDescription = ReturnType<typeof BannerDescription>;
export default BannerDescription;
//# sourceMappingURL=BannerDescription.svelte.d.ts.map