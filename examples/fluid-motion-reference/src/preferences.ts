/** Visitor motion preference, provided once by the gallery shell to every page view. */
import { getContext, setContext } from 'svelte';

const key = Symbol('horizon.motionPreference');

export interface MotionPreference {
  /** True when the visitor asked the gallery to reduce motion. */
  readonly reduced: boolean;
}

export function provideMotionPreference(preference: MotionPreference): void {
  setContext(key, preference);
}

export function motionPreference(): MotionPreference {
  const preference = getContext<MotionPreference | undefined>(key);
  if (!preference) throw new Error('Page views render inside the gallery shell');
  return preference;
}
