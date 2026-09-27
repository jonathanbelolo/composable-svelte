/** The shared pavilion model, provided once by the gallery shell to every page view. */
import { getContext, setContext } from 'svelte';
import type { GraphicsStore } from '@composable-svelte/graphics';

const key = Symbol('horizon.pavilionScene');

export interface PavilionScene {
  /** The root-owned scene view; undefined only if the scene slot is absent. */
  readonly store: GraphicsStore | undefined;
}

export function providePavilionScene(scene: PavilionScene): void {
  setContext(key, scene);
}

export function pavilionScene(): PavilionScene {
  const scene = getContext<PavilionScene | undefined>(key);
  if (!scene) throw new Error('Page views render inside the gallery shell');
  return scene;
}
