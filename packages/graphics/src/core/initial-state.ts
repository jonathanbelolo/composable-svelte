/**
 * @file initial-state.ts
 * @description Helper to create initial graphics state
 */

import type { GraphicsState } from './types.js';

/**
 * Distinguishes scenes created in one session.
 *
 * A counter rather than anything random: this is a factory, not a reducer, so
 * it may hold state, and a counter is inspectable where a random id is not.
 *
 * It is **process-global and never resets**, which matters on a server: request
 * #1 emits `scene-1` and request #500 emits `scene-500`, so two identical
 * requests serialise different HTML — `sceneId` rides in `JSON.stringify(state)`
 * through `serializeStore`. That defeats ETag and CDN caching and shifts every
 * id in an SSG run whenever page order changes. Pass an explicit `sceneId` for
 * anything server-rendered. (An earlier version of this note claimed the
 * counter "stays deterministic for SSR, where the server and the client walk
 * the same creation order". They do not.)
 *
 * Hydration itself is safe for a different reason: the client inherits the
 * server's id from the serialised state, and the server never runs effects.
 */
let sceneCounter = 0;

/**
 * Ids handed out so far, so a duplicate can be reported.
 *
 * The whole point of `sceneId` is that two scenes under one store must not
 * share one — a shared id makes their frame loops cancel each other, which is
 * the defect this field exists to fix. The escape hatch that lets a consumer
 * supply an id reopened it in silence; now it says so.
 */
const issuedSceneIds = new Set<string>();

export interface InitialGraphicsConfig {
  // `renderer?: Partial<RendererConfig>` used to sit here. It was accepted and
  // never read — the body below returns a hardcoded renderer literal — so all
  // four of its fields were unreachable. There is no way to force WebGL either:
  // `Scene.svelte` derives the preference from `activeRenderer !== 'webgl'`, and
  // `activeRenderer` is null until after init, so it is always true.
  backgroundColor?: string;
  /**
   * Identity for this scene. Generated when omitted; supply one when two scenes
   * must keep distinct identities across a reload, or when you want to address
   * this scene's effects from outside.
   */
  sceneId?: string;
}

/**
 * Create initial graphics state with sensible defaults
 */
/** Claim a scene id, warning if this one is already spoken for. */
function takeSceneId(requested: string | undefined): string {
  if (requested === undefined) {
    let generated = `scene-${(sceneCounter += 1)}`;
    // Skip anything a consumer already took by hand, so an explicit `scene-2`
    // does not collide with the second generated id.
    while (issuedSceneIds.has(generated)) generated = `scene-${(sceneCounter += 1)}`;
    issuedSceneIds.add(generated);
    return generated;
  }

  if (issuedSceneIds.has(requested)) {
    console.warn(
      `[graphics] sceneId "${requested}" is already in use; two scenes sharing ` +
        'an id will cancel each other\'s animation frame loop'
    );
  }
  issuedSceneIds.add(requested);
  return requested;
}

export function createInitialGraphicsState(
  config: InitialGraphicsConfig = {}
): GraphicsState {
  return {
    sceneId: takeSceneId(config.sceneId),

    // Renderer
    renderer: {
      activeRenderer: null,
      isInitialized: false,
      capabilities: {
        supportsWebGL: false,
        maxTextureSize: 0,
        maxVertexAttributes: 0
      },
      error: null
    },

    backgroundColor: config.backgroundColor || '#1a1a1a',

    // Camera (default perspective camera)
    camera: {
      type: 'perspective',
      position: [0, 5, 10],
      lookAt: [0, 0, 0],
      fov: 45,
      near: 0.1,
      far: 1000
    },

    // Lights (default ambient light)
    lights: [
      {
        // Named, so a consumer can remove or update the default light rather
        // than only being able to add alongside it.
        id: 'ambient-default',
        type: 'ambient',
        intensity: 0.5,
        color: '#ffffff'
      }
    ],

    // Meshes
    meshes: [],

    // Animations
    animations: [],

    // Loading state
    isLoading: true
  };
}
