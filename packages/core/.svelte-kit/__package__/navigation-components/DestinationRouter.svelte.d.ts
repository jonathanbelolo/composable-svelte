import type { Store } from '../types.js';
import type { Component } from 'svelte';
declare function $$render<State, Action, Dest extends {
    type: string;
    state: any;
}>(): {
    props: {
        /**
         * The parent store containing destination state.
         */
        store: Store<State, Action>;
        /**
         * The field name in state that contains the destination.
         *
         * Must be a discriminated union with `{ type: string; state: any }` structure.
         */
        field: keyof State & string;
        /**
         * Map of destination case types to route configurations.
         *
         * Keys must match the `type` values in the destination union.
         */
        routes: Record<string, {
            /**
             * The Svelte component to render for this destination case.
             *
             * Component will receive a `store` prop with the scoped store.
             */
            component: Component;
            /**
             * The presentation style to use.
             *
             * - `modal`: Full-screen overlay with backdrop
             * - `sheet`: Bottom sheet (mobile) or side panel (desktop)
             * - `drawer`: Side drawer that pushes content
             */
            presentation: "modal" | "sheet" | "drawer";
            /**
             * Additional props to pass to the presentation component.
             *
             * @example
             * ```typescript
             * {
             *   presentationProps: {
             *     unstyled: true,
             *     disableClickOutside: true
             *   }
             * }
             * ```
             */
            presentationProps?: Record<string, any>;
            /**
             * Additional props to pass to the child component.
             *
             * @example
             * ```typescript
             * {
             *   componentProps: {
             *     showAdvanced: true,
             *     theme: 'dark'
             *   }
             * }
             * ```
             */
            componentProps?: Record<string, any>;
        }>;
    };
    exports: {};
    bindings: "";
    slots: {};
    events: {};
};
declare class __sveltets_Render<State, Action, Dest extends {
    type: string;
    state: any;
}> {
    props(): ReturnType<typeof $$render<State, Action, Dest>>['props'];
    events(): ReturnType<typeof $$render<State, Action, Dest>>['events'];
    slots(): ReturnType<typeof $$render<State, Action, Dest>>['slots'];
    bindings(): "";
    exports(): {};
}
interface $$IsomorphicComponent {
    new <State, Action, Dest extends {
        type: string;
        state: any;
    }>(options: import('svelte').ComponentConstructorOptions<ReturnType<__sveltets_Render<State, Action, Dest>['props']>>): import('svelte').SvelteComponent<ReturnType<__sveltets_Render<State, Action, Dest>['props']>, ReturnType<__sveltets_Render<State, Action, Dest>['events']>, ReturnType<__sveltets_Render<State, Action, Dest>['slots']>> & {
        $$bindings?: ReturnType<__sveltets_Render<State, Action, Dest>['bindings']>;
    } & ReturnType<__sveltets_Render<State, Action, Dest>['exports']>;
    <State, Action, Dest extends {
        type: string;
        state: any;
    }>(internal: unknown, props: ReturnType<__sveltets_Render<State, Action, Dest>['props']> & {}): ReturnType<__sveltets_Render<State, Action, Dest>['exports']>;
    z_$$bindings?: ReturnType<__sveltets_Render<any, any, any>['bindings']>;
}
declare const DestinationRouter: $$IsomorphicComponent;
type DestinationRouter<State, Action, Dest extends {
    type: string;
    state: any;
}> = InstanceType<typeof DestinationRouter<State, Action, Dest>>;
export default DestinationRouter;
//# sourceMappingURL=DestinationRouter.svelte.d.ts.map