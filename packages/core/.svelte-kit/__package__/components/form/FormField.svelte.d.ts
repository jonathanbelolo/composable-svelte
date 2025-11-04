import type { FormAction, FieldState } from './form.types.js';
declare function $$render<T extends Record<string, any>>(): {
    props: {
        /**
         * The name of the field in the form data
         */
        name: keyof T & string;
        /**
         * Optional class name for the field wrapper
         */
        class?: string;
        /**
         * Children components (label, control, message, etc.)
         */
        children?: import("svelte").Snippet<[{
            field: FieldState;
            send: (action: FormAction<T>) => void;
        }]>;
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
declare const FormField: $$IsomorphicComponent;
type FormField<T extends Record<string, any>> = InstanceType<typeof FormField<T>>;
export default FormField;
//# sourceMappingURL=FormField.svelte.d.ts.map