import { onDestroy, untrack } from 'svelte';
import type { Action } from 'svelte/action';
import { BROWSER } from 'esm-env';
import {
  stableProjection,
  type TargetSchema,
  type MotionRecipe,
} from './motion/compiler.js';
import { bindingPolicy } from './motion/binding-policy.js';
import type { NumericDescriptors } from './motion/properties.js';
import { useRegistry, optionalRegistry, useTargetOwner } from './renderer/context.js';
import type { TargetRegistry, TargetOwner } from './renderer/target-registry.js';
import {
  createMotionSetLifecycle,
  type MotionPresentEntry,
} from './renderer/motion-lifecycle.js';
import type { MotionHandle } from './use-motion.svelte.js';

export type MotionGroupTargets<T extends TargetSchema> = {
  readonly [K in keyof T & string]: MotionHandle;
};

export interface MotionGroupHandle<T extends TargetSchema> {
  readonly targets: MotionGroupTargets<T>;
}

export function useMotionGroup<
  T extends TargetSchema,
  S extends string,
  N extends NumericDescriptors = Record<never, never>,
>(
  recipe: MotionRecipe<T, S, N>,
  state: () => NoInfer<S>,
): MotionGroupHandle<T> {
  const read = (): S => untrack(state);
  // Pure validation first: brand, state, declared targets, policy and channel length.
  const initial = read();
  stableProjection(recipe, initial);
  const declared: readonly (keyof T & string)[] = Object.freeze(
    Object.keys(recipe.targets) as (keyof T & string)[],
  );

  const policy = bindingPolicy(recipe, declared);
  if (policy.channel.length > 128) {
    throw new TypeError('Motion binding channel exceeds 128 characters');
  }

  // Exact root-or-child authority, captured once. A browser requires the host; a server may have none.
  const registry: TargetRegistry | undefined = BROWSER ? useRegistry() : optionalRegistry();
  const owner: TargetOwner | undefined = registry ? useTargetOwner() : undefined;
  const lifecycle = createMotionSetLifecycle<T, S, N, keyof T & string>(recipe, declared, {
    initial,
    read,
    registry,
    owner,
  });

  let revision = $state(0);

  // One tokenized registration table per declared name.
  const registrations = new Map<keyof T & string, Map<object, HTMLElement>>();
  for (const name of declared) {
    registrations.set(name, new Map());
  }

  function createAttach(name: keyof T & string): Action<HTMLElement> {
    return (node: HTMLElement) => {
      const token = {};
      const targetMap = registrations.get(name);
      if (targetMap === undefined || lifecycle.phase === 'retired') {
        return { destroy() {} };
      }

      targetMap.set(token, node);
      lifecycle.topologyChanged();
      revision += 1;

      const detach = (): void => {
        if (!targetMap.has(token)) return;
        targetMap.delete(token);
        lifecycle.topologyChanged();
        revision += 1;
      };

      return { destroy: detach };
    };
  }

  // Client: the pre-effect teardown retires before DOM removal. Server: onDestroy. Both are idempotent.
  $effect.pre(() => () => lifecycle.destroy());
  onDestroy(() => lifecycle.destroy());

  // Post-DOM effect: reconcile complete snapshot after Svelte coalesces registrations.
  $effect(() => {
    const _ = revision;
    untrack(() => {
      const entries: MotionPresentEntry<T, keyof T & string>[] = [];
      for (const name of declared) {
        const records = registrations.get(name);
        if (records !== undefined) {
          for (const [token, node] of records) {
            entries.push(Object.freeze({ name, node, token }));
          }
        }
      }
      lifecycle.reconcile(Object.freeze(entries));
    });
  });

  // State effect: routes later changes through update.
  $effect(() => {
    const next = state();
    untrack(() => lifecycle.update(next));
  });

  const targetsRecord = Object.create(null) as Record<keyof T & string, MotionHandle>;
  for (const name of declared) {
    targetsRecord[name] = Object.freeze({
      style: lifecycle.styles[name]!,
      attach: createAttach(name),
    });
  }
  const targets = Object.freeze(targetsRecord) as MotionGroupTargets<T>;

  return Object.freeze({ targets });
}
