import type { CarouselSlide } from './carousel.types.js';
declare function $$render<T = unknown>(): {
    props: {
        slides: CarouselSlide<T>[];
        initialIndex?: number;
        loop?: boolean;
        autoPlayInterval?: number;
        showArrows?: boolean;
        showDots?: boolean;
        onSlideChange?: (index: number, slide: CarouselSlide<T>) => void;
        onAutoPlayStart?: () => void;
        onAutoPlayStop?: () => void;
        class?: string;
        slideClass?: string;
        transitionDuration?: number;
        children?: import("svelte").Snippet<[{
            slide: CarouselSlide<T>;
            index: number;
        }]>;
    };
    exports: {};
    bindings: "";
    slots: {};
    events: {};
};
declare class __sveltets_Render<T = unknown> {
    props(): ReturnType<typeof $$render<T>>['props'];
    events(): ReturnType<typeof $$render<T>>['events'];
    slots(): ReturnType<typeof $$render<T>>['slots'];
    bindings(): "";
    exports(): {};
}
interface $$IsomorphicComponent {
    new <T = unknown>(options: import('svelte').ComponentConstructorOptions<ReturnType<__sveltets_Render<T>['props']>>): import('svelte').SvelteComponent<ReturnType<__sveltets_Render<T>['props']>, ReturnType<__sveltets_Render<T>['events']>, ReturnType<__sveltets_Render<T>['slots']>> & {
        $$bindings?: ReturnType<__sveltets_Render<T>['bindings']>;
    } & ReturnType<__sveltets_Render<T>['exports']>;
    <T = unknown>(internal: unknown, props: ReturnType<__sveltets_Render<T>['props']> & {}): ReturnType<__sveltets_Render<T>['exports']>;
    z_$$bindings?: ReturnType<__sveltets_Render<any>['bindings']>;
}
declare const Carousel: $$IsomorphicComponent;
type Carousel<T = unknown> = InstanceType<typeof Carousel<T>>;
export default Carousel;
//# sourceMappingURL=Carousel.svelte.d.ts.map