import type { FormConfig, FormState, FormAction } from './form.types.js';
import type { Store } from '../../types.js';
declare function $$render<T extends Record<string, any>>(): {
    props: {
        /**
         * Form configuration (standalone mode)
         * Mutually exclusive with `store`
         */
        config?: FormConfig<T>;
        /**
         * External store from parent reducer (integrated mode)
         * Mutually exclusive with `config`
         */
        store?: Store<FormState<T>, FormAction<T>>;
        /**
         * Optional class name for the form element
         */
        class?: string;
        /**
         * Optional children (form fields and controls)
         */
        children?: import("svelte").Snippet;
    };
    exports: {};
    bindings: "";
    slots: {};
    events: {};
};
declare class __sveltets_Render<T extends Record<string, any>> {
    props(): ReturnType<typeof $$render<T>>['props'];
    events(): ReturnType<typeof $$render<T>>['events'];
    slots(): ReturnType<typeof $$render<T>>['slots'];
    bindings(): "";
    exports(): {};
}
interface $$IsomorphicComponent {
    new <T extends Record<string, any>>(options: import('svelte').ComponentConstructorOptions<ReturnType<__sveltets_Render<T>['props']>>): import('svelte').SvelteComponent<ReturnType<__sveltets_Render<T>['props']>, ReturnType<__sveltets_Render<T>['events']>, ReturnType<__sveltets_Render<T>['slots']>> & {
        $$bindings?: ReturnType<__sveltets_Render<T>['bindings']>;
    } & ReturnType<__sveltets_Render<T>['exports']>;
    <T extends Record<string, any>>(internal: unknown, props: ReturnType<__sveltets_Render<T>['props']> & {}): ReturnType<__sveltets_Render<T>['exports']>;
    z_$$bindings?: ReturnType<__sveltets_Render<any>['bindings']>;
}
declare const Form: $$IsomorphicComponent;
type Form<T extends Record<string, any>> = InstanceType<typeof Form<T>>;
export default Form;
//# sourceMappingURL=Form.svelte.d.ts.map