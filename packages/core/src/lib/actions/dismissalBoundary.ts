import { getContext, setContext } from 'svelte';
import { enrollLayer, registerDismissalLayer, type DismissalIdentity, type DismissalLayer } from './dismissalCoordinator.js';
const parentKey = Symbol('composable-dismissal-parent');
/** Call during primitive initialization; allocates metadata, never DOM resources. */
export function createDismissalBoundary() {
  const ancestry: DismissalIdentity = Object.freeze({ parent: getContext<DismissalIdentity | undefined>(parentKey) });
  setContext(parentKey, ancestry);
  const register = (options: Omit<DismissalLayer, 'ancestry'>) => registerDismissalLayer({ ...options, ancestry });
  register.enroll = (options: Omit<DismissalLayer, 'ancestry'>) => enrollLayer({ ...options, ancestry });
  return register;
}
