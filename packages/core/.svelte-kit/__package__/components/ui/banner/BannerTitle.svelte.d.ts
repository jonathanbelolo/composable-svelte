import type { HTMLAttributes } from 'svelte/elements';
interface BannerTitleProps extends Omit<HTMLAttributes<HTMLHeadingElement>, 'class'> {
    class?: string;
    children?: import('svelte').Snippet;
}
declare const BannerTitle: import("svelte").Component<BannerTitleProps, {}, "">;
type BannerTitle = ReturnType<typeof BannerTitle>;
export default BannerTitle;
//# sourceMappingURL=BannerTitle.svelte.d.ts.map