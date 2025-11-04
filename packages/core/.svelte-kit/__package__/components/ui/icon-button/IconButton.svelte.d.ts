import type { Dispatch } from '../../../types.js';
import type { Snippet } from 'svelte';
import type { HTMLButtonAttributes } from 'svelte/elements';
/**
 * IconButton component - Button specifically designed for icon-only content.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <!-- With reducer action -->
 * <IconButton
 *   action={{ type: 'closeButtonTapped' }}
 *   dispatch={store.dispatch}
 *   aria-label="Close"
 * >
 *   <CloseIcon />
 * </IconButton>
 *
 * <!-- With event handler -->
 * <IconButton onclick={handleClick} aria-label="Menu">
 *   <MenuIcon />
 * </IconButton>
 *
 * <!-- Different sizes -->
 * <IconButton size="sm" aria-label="Info">
 *   <InfoIcon />
 * </IconButton>
 * ```
 */
interface IconButtonProps<Action> extends Omit<HTMLButtonAttributes, 'class'> {
    /**
     * Visual variant.
     */
    variant?: 'default' | 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost';
    /**
     * Size of the button.
     */
    size?: 'sm' | 'md' | 'lg';
    /**
     * Disabled state.
     */
    disabled?: boolean;
    /**
     * Loading state.
     */
    loading?: boolean;
    /**
     * Reducer action to dispatch on click.
     */
    action?: Action;
    /**
     * Dispatch function from store.
     */
    dispatch?: Dispatch<Action>;
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Icon content (must provide aria-label for accessibility).
     */
    children: Snippet;
}
declare function $$render<Action = unknown>(): {
    props: IconButtonProps<Action>;
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
declare const IconButton: $$IsomorphicComponent;
type IconButton<Action = unknown> = InstanceType<typeof IconButton<Action>>;
export default IconButton;
//# sourceMappingURL=IconButton.svelte.d.ts.map