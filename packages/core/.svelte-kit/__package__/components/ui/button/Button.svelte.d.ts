import type { Dispatch } from '../../../types.js';
import type { Snippet } from 'svelte';
import type { HTMLButtonAttributes } from 'svelte/elements';
/**
 * Button component with variant system and action dispatch pattern.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <!-- With reducer action dispatch -->
 * <Button
 *   action={{ type: 'saveButtonTapped' }}
 *   dispatch={store.dispatch}
 *   variant="primary"
 * >
 *   Save
 * </Button>
 *
 * <!-- With traditional event handler -->
 * <Button onclick={() => console.log('clicked')}>
 *   Click Me
 * </Button>
 * ```
 */
interface ButtonProps<Action> extends Omit<HTMLButtonAttributes, 'class'> {
    /**
     * Visual variant of the button.
     */
    variant?: 'default' | 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';
    /**
     * Size of the button.
     */
    size?: 'sm' | 'md' | 'lg' | 'icon';
    /**
     * Disabled state.
     */
    disabled?: boolean;
    /**
     * Loading state (shows spinner, disables interaction).
     */
    loading?: boolean;
    /**
     * Reducer action to dispatch on click (Composable Architecture pattern).
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
    /**
     * Button content.
     */
    children: Snippet;
}
declare function $$render<Action = unknown>(): {
    props: ButtonProps<Action>;
    exports: {};
    bindings: "";
    slots: {};
    events: {};
};
declare class __sveltets_Render<Action = unknown> {
    props(): ReturnType<typeof $$render<Action>>['props'];
    events(): ReturnType<typeof $$render<Action>>['events'];
    slots(): ReturnType<typeof $$render<Action>>['slots'];
    bindings(): "";
    exports(): {};
}
interface $$IsomorphicComponent {
    new <Action = unknown>(options: import('svelte').ComponentConstructorOptions<ReturnType<__sveltets_Render<Action>['props']>>): import('svelte').SvelteComponent<ReturnType<__sveltets_Render<Action>['props']>, ReturnType<__sveltets_Render<Action>['events']>, ReturnType<__sveltets_Render<Action>['slots']>> & {
        $$bindings?: ReturnType<__sveltets_Render<Action>['bindings']>;
    } & ReturnType<__sveltets_Render<Action>['exports']>;
    <Action = unknown>(internal: unknown, props: ReturnType<__sveltets_Render<Action>['props']> & {}): ReturnType<__sveltets_Render<Action>['exports']>;
    z_$$bindings?: ReturnType<__sveltets_Render<any>['bindings']>;
}
declare const Button: $$IsomorphicComponent;
type Button<Action = unknown> = InstanceType<typeof Button<Action>>;
export default Button;
//# sourceMappingURL=Button.svelte.d.ts.map