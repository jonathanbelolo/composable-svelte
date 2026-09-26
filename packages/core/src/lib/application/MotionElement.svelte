<script lang="ts" generics="T extends TargetSchema, S extends string, N extends NumericDescriptors = Record<never, never>, E extends keyof HTMLElementTagNameMap = 'div'">
  import { untrack } from 'svelte';
  import type { TargetSchema } from './motion/compiler.js';
  import type { NumericDescriptors } from './motion/properties.js';
  import { createMotionHandle, type MotionElementProps } from './use-motion.svelte.js';

  let {
    as: requestedTag,
    recipe,
    state,
    children,
    style: _style,
    ...rest
  }: MotionElementProps<T, S, N, E> = $props();

  // Captured once: a replaced recipe is reported and ignored, and the tag is fixed.
  const captured = untrack(() => ({ recipe, tag: requestedTag ?? 'div' }));
  // A dynamic tag is attribute-checked as a plain string; per-tag checking happened at the call site.
  const tag: string = captured.tag;
  const motion = createMotionHandle<T, S, N>(captured.recipe, () => state, () => recipe);
</script>

<svelte:element this={tag} {...rest} style={motion.style} use:motion.attach>
  {@render children?.()}
</svelte:element>
