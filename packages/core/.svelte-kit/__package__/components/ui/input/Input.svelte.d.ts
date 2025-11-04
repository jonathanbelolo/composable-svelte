import type { Dispatch } from '../../../types.js';
import type { HTMLInputAttributes } from 'svelte/elements';
/**
 * Input component for form fields.
 *
 * Supports both controlled (with value binding) and action dispatch patterns.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <!-- Controlled input with action dispatch -->
 * <Input
 *   type="text"
 *   value={state.name}
 *   action={{ type: 'nameChanged' }}
 *   dispatch={store.dispatch}
 * />
 *
 * <!-- With error state and ARIA -->
 * <Input
 *   type="email"
 *   value={state.email}
 *   error={!!state.emailError}
 *   errorId="email-error"
 * />
 * <p id="email-error" class="text-destructive text-sm">
 *   {state.emailError}
 * </p>
 *
 * <!-- Traditional event handler -->
 * <Input
 *   type="text"
 *   oninput={(e) => console.log(e.currentTarget.value)}
 * />
 * ```
 */
interface InputProps<Action> extends Omit<HTMLInputAttributes, 'class'> {
    /**
     * Input type.
     */
    type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search';
    /**
     * Current value (supports two-way binding).
     */
    value?: string | number;
    /**
     * Disabled state.
     */
    disabled?: boolean;
    /**
     * Error state (for styling).
     */
    error?: boolean;
    /**
     * ID of error message element (sets aria-describedby automatically).
     */
    errorId?: string;
    /**
     * Manual aria-describedby override (use if not using errorId).
     */
    describedBy?: string;
    /**
     * Reducer action to dispatch on input (Composable Architecture pattern).
     * The action will be enriched with the current value.
     */
    action?: Action;
    /**
     * Dispatch function from store (required if action is provided).
     */
    dispatch?: Dispatch<Action>;
    /**
     * Additional CSS classes.
     */
    class?: string;
}
declare function $$render<Action = unknown>(): {
    props: InputProps<Action>;
    exports: {};
    bindings: "value";
    slots: {};
    events: {};
};
declare class __sveltets_Render<Action = unknown> {
    props(): ReturnType<typeof $$render<Action>>['props'];
    events(): ReturnType<typeof $$render<Action>>['events'];
    slots(): ReturnType<typeof $$render<Action>>['slots'];
    bindings(): "value";
    exports(): {};
}
interface $$IsomorphicComponent {
    new <Action = unknown>(options: import('svelte').ComponentConstructorOptions<ReturnType<__sveltets_Render<Action>['props']>>): import('svelte').SvelteComponent<ReturnType<__sveltets_Render<Action>['props']>, ReturnType<__sveltets_Render<Action>['events']>, ReturnType<__sveltets_Render<Action>['slots']>> & {
        $$bindings?: ReturnType<__sveltets_Render<Action>['bindings']>;
    } & ReturnType<__sveltets_Render<Action>['exports']>;
    <Action = unknown>(internal: unknown, props: ReturnType<__sveltets_Render<Action>['props']> & {}): ReturnType<__sveltets_Render<Action>['exports']>;
    z_$$bindings?: ReturnType<__sveltets_Render<any>['bindings']>;
}
declare const Input: $$IsomorphicComponent;
type Input<Action = unknown> = InstanceType<typeof Input<Action>>;
export default Input;
//# sourceMappingURL=Input.svelte.d.ts.map