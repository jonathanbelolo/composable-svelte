import type { MotionGraph, MotionRecipe, TargetSchema } from './compiler.js';
import type { NumericDescriptors } from './properties.js';

export interface BindingPolicy {
  readonly channel: string;
  readonly priority: number;
}

const DEFAULT_BINDING_POLICY: BindingPolicy = Object.freeze({
  channel: 'default',
  priority: 0,
});

/**
 * Traverses a validated recipe graph statically and derives a single uniform
 * binding policy for the selected declared target names.
 *
 * - Traverses recursively through sequence, parallel, and stagger compositions.
 * - Normalizes each track on a selected target to:
 *     channel: track.channel ?? 'default'
 *     priority: track.priority ?? 0
 * - Returns a frozen structural policy when all selected tracks agree.
 * - Returns the compiler's default ({ channel: 'default', priority: 0 }) when
 *   no track addresses a selected target.
 * - Throws a deterministic TypeError when selected tracks contain more than one distinct pair.
 * - Ignores tracks addressing targets outside the selected set.
 */
export function bindingPolicy<
  T extends TargetSchema,
  S extends string,
  N extends NumericDescriptors,
>(
  recipe: MotionRecipe<T, S, N>,
  selectedTargets: readonly (keyof T & string)[],
): BindingPolicy {
  const selected = new Set(selectedTargets);
  let resolvedChannel: string | undefined;
  let resolvedPriority: number | undefined;

  function visit(graph: MotionGraph<T, S>): void {
    if (graph.kind === 'track') {
      if (!selected.has(graph.target)) {
        return;
      }
      const channel = graph.channel ?? 'default';
      const priority = graph.priority ?? 0;

      if (resolvedChannel === undefined) {
        resolvedChannel = channel;
        resolvedPriority = priority;
      } else if (resolvedChannel !== channel || resolvedPriority !== priority) {
        throw new TypeError(
          `Conflicting motion binding policies for selected targets: found distinct policies (${resolvedChannel}, ${resolvedPriority}) and (${channel}, ${priority})`,
        );
      }
      return;
    }
    for (const step of graph.steps) {
      visit(step);
    }
  }

  visit(recipe.graph);

  if (resolvedChannel === undefined) {
    return DEFAULT_BINDING_POLICY;
  }

  return Object.freeze({
    channel: resolvedChannel,
    priority: resolvedPriority as number,
  });
}
