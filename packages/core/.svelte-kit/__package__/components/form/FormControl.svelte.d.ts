import type { FieldState } from './form.types.js';
/**
 * FormControl component - Wraps form input elements and handles events.
 * Automatically dispatches field actions on change, blur, and focus.
 *
 * @example
 * ```svelte
 * <FormControl>
 *   <Input type="email" />
 * </FormControl>
 * ```
 *
 * @example With custom input
 * ```svelte
 * <FormControl let:props>
 *   <input {...props} type="email" />
 * </FormControl>
 * ```
 */
interface Props {
    /**
     * Optional class name for the control wrapper
     */
    class?: string;
    /**
     * Children - input elements
     */
    children?: import('svelte').Snippet<[
        {
            props: Record<string, any>;
            field: FieldState;
        }
    ]>;
}
declare function $$render<T extends Record<string, any>>(): {
    props: Props;
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
declare const FormControl: $$IsomorphicComponent;
type FormControl<T extends Record<string, any>> = InstanceType<typeof FormControl<T>>;
export default FormControl;
//# sourceMappingURL=FormControl.svelte.d.ts.map