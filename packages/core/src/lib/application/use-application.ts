import { getContext } from 'svelte';
import { getDefinitionInternal, type ApplicationDefinition } from './definition.js';
import { applicationContextKey, type ApplicationContext } from './context.js';
import type { ApplicationInstance } from './instance.svelte.js';
export type { ApplicationOptions } from './create-application.js';

/** Read the nearest declarative root during descendant component initialization.
 * Exact definition identity prevents a nested root from silently targeting another
 * application's state. Instance construction and teardown belong to ApplicationRoot.
 */
export function useApplication<S, A, D, I, Routed extends boolean = false>(
  definition: ApplicationDefinition<S, A, D, I, Routed>
): ApplicationInstance<S, A> {
  if (arguments.length !== 1) throw new TypeError('useApplication reads an existing root; construct it with ApplicationRoot');
  getDefinitionInternal(definition);
  const context = getContext<ApplicationContext | undefined>(applicationContextKey);
  if (!context) throw new Error('useApplication requires a containing ApplicationRoot');
  if (context.definition !== definition) {
    throw new Error('The nearest ApplicationRoot uses a different application definition');
  }
  return context.app as ApplicationInstance<S, A>;
}
