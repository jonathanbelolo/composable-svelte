import { onDestroy, untrack, type Snippet } from 'svelte';
import type { Action } from 'svelte/action';
import type { SvelteHTMLElements } from 'svelte/elements';
import { BROWSER } from 'esm-env';
import type { TargetSchema, MotionRecipe } from './motion/compiler.js';
import type { NumericDescriptors } from './motion/properties.js';
import { useRegistry, optionalRegistry, useTargetOwner } from './renderer/context.js';
import type { TargetRegistry, TargetOwner } from './renderer/target-registry.js';
import { createMotionLifecycle, soleMotionTarget } from './renderer/motion-lifecycle.js';

export type IsUnion<U, C = U> = U extends unknown ? ([C] extends [U] ? false : true) : never;

export type SoleTargetOf<T extends TargetSchema> = [keyof T & string] extends [never]
  ? never
  : IsUnion<keyof T & string> extends true
    ? never
    : keyof T & string;

export type SoleTargetGuard<T extends TargetSchema> = [SoleTargetOf<T>] extends [never]
  ? { readonly multiTargetRecipesRequireTheGroupSurface: never }
  : unknown;

export interface MotionHandle {
  readonly style: string;
  readonly attach: Action<HTMLElement>;
}

type MotionElementAttributes<E extends keyof HTMLElementTagNameMap> = {
  readonly [K in keyof SvelteHTMLElements[E] as K extends 'as' | 'recipe' | 'state' | 'children' | 'style' ? never : K]: SvelteHTMLElements[E][K];
};

/** `MotionElement` props: the tag's own Svelte attributes, except the owned `style` and the snippet. */
export type MotionElementProps<
  T extends TargetSchema,
  S extends string,
  N extends NumericDescriptors = Record<never, never>,
  E extends keyof HTMLElementTagNameMap = 'div',
> = MotionElementAttributes<E> & {
  readonly recipe: MotionRecipe<T, S, N> & SoleTargetGuard<T>;
  readonly state: NoInfer<S>;
  readonly as?: E | undefined;
  readonly children?: Snippet | undefined;
  /** The stable style is owned by the recipe and stays constant for the element's lifetime. */
  readonly style?: never;
};

export function useMotion<
  T extends TargetSchema,
  S extends string,
  N extends NumericDescriptors = Record<never, never>,
>(
  recipe: MotionRecipe<T, S, N> & SoleTargetGuard<T>,
  state: () => NoInfer<S>,
): MotionHandle {
  return createMotionHandle<T, S, N>(recipe, state);
}

/**
 * The one runes layer behind `useMotion` and `MotionElement`; call it during component
 * initialization. `currentRecipe` lets the element report an ignored recipe replacement.
 */
export function createMotionHandle<T extends TargetSchema, S extends string, N extends NumericDescriptors>(
  recipe: MotionRecipe<T, S, N>,
  state: () => S,
  currentRecipe?: (() => unknown) | undefined,
): MotionHandle {
  const read = (): S => untrack(state);
  // Pure validation first: the same verdict on server and client, before any context is touched.
  const initial = read();
  const target = soleMotionTarget<T, S, N>(recipe, initial);

  // Exact root-or-child authority, captured once. A browser requires the host; a server may have none.
  const registry: TargetRegistry | undefined = BROWSER ? useRegistry() : optionalRegistry();
  const owner: TargetOwner | undefined = registry ? useTargetOwner() : undefined;
  const lifecycle = createMotionLifecycle<T, S, N>(recipe, target, { initial, read, registry, owner });

  // Stable identity; the returned detach is attachment-token-checked and idempotent.
  const attach: Action<HTMLElement> = (node: HTMLElement) => ({ destroy: lifecycle.attach(node) });

  // Client: the pre-effect teardown retires before DOM removal. Server: onDestroy. Both are idempotent.
  $effect.pre(() => () => lifecycle.destroy());
  onDestroy(() => lifecycle.destroy());

  $effect(() => {
    const next = state();
    untrack(() => lifecycle.update(next));
  });

  if (currentRecipe !== undefined) {
    $effect(() => {
      if (currentRecipe() !== recipe) untrack(() => lifecycle.recipeChangeIgnored());
    });
  }

  return Object.freeze({ style: lifecycle.style, attach });
}
