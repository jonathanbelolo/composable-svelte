/**
 * Pure sampling of declared animations, shared by the reducer's `tick` and the
 * retained renderer's visual continuation, so both compute the same pose for
 * the same animation at the same time.
 */

import type { AnimationState, MeshConfig, Vector3 } from './types.js';
import type { SceneAdapter } from './scene-sync.js';

export function applyEasing(
  t: number,
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
): number {
  switch (easing) {
    case 'linear':
      return t;
    case 'easeIn':
      return t * t;
    case 'easeOut':
      return t * (2 - t);
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
}

/**
 * Interpolate between two Vector3 values
 */
export function interpolateVector3(from: Vector3, to: Vector3, t: number): Vector3 {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t
  ];
}

/** True for a plain data object (not an array, not null). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Structural equality for plain scene-config data.
 *
 * Configs are plain data: primitives, `Vector3` tuples, and nested geometry and
 * material objects. Recursing over arrays and plain objects covers all three.
 * Anything else (a function, a class instance) compares unequal, which is the
 * safe direction — it dispatches rather than wrongly skipping a real update.
 */
export function sameConfig(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameConfig(item, b[i]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!sameConfig(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}

/** What the animation step reads of a mesh: its id and the animatable properties. */
export type AnimatedMesh = Pick<MeshConfig, 'id'> & Partial<Pick<MeshConfig, 'position' | 'rotation' | 'scale'>>;

/**
 * One `tick` of the declared animations at `time`: the reducer's own step, and
 * the retained renderer's (`continueAnimations`), so both produce the same
 * poses and the same lifecycle — loop laps carrying their overshoot, completion
 * writing its terminal pose once and then going inactive, last-writer-wins
 * across tracks on one property. Moved verbatim from the reducer's `tick` case.
 */
export function advanceAnimations<M extends AnimatedMesh>(
  animations: readonly AnimationState[],
  meshes: M[],
  time: number
): {
  animations: AnimationState[];
  meshes: M[];
  updates: ReadonlyMap<string, Partial<MeshConfig>>;
} {
  const meshUpdates = new Map<string, Partial<MeshConfig>>();

  // Update all active animations
  const updatedAnimations = animations.map((anim) => {
    if (!anim.isPlaying) return anim;

    const startTime = typeof anim.startTime === 'number' ? anim.startTime : time;
    const elapsed = time - startTime;
    // Clamped at both ends, and `duration <= 0` is complete rather than
    // undefined. `elapsed / 0` is NaN when a tick lands in the same
    // millisecond as the start — including its first tick, so that is ordinary
    // — and NaN survives `Math.min(NaN, 1)`, flows into the mesh position,
    // and fails `progress >= 1`, so the animation runs forever writing NaN.
    // Nothing clamped the bottom either, so a tick timestamped before the
    // start extrapolated backwards out of the animation's own range.
    const progress =
      anim.config.duration > 0
        ? Math.min(Math.max(elapsed / anim.config.duration, 0), 1)
        : 1;

    // Apply easing
    const easedProgress = applyEasing(progress, anim.config.easing || 'linear');

    // Interpolate value
    const current = interpolateVector3(
      anim.config.from,
      anim.config.to,
      easedProgress
    );

    // Record the update rather than writing it. Mutating the mesh in place
    // was the whole defect: `meshes` kept both its array identity and
    // its element identities, so `Scene.svelte`'s diff — which stored that
    // same array as its baseline — compared an object with itself and could
    // never fire. State moved and the renderer never heard about it.
    //
    // Accumulated per mesh because `property` is one of three: up to three
    // animations can target one mesh at once, and applying them one at a
    // time would drop all but the last.
    // Only when the value actually moved. Writing unconditionally meant a
    // `from === to` animation — or any animation sitting at its final
    // value — produced a fresh mesh array every frame, which `syncScene`
    // reads as a change and pushes to the renderer.
    //
    // Compared against what this tick has accumulated so far, falling back
    // to the mesh as it stands. Comparing against the mesh alone is wrong
    // when two animations target the same property: whichever of them
    // happened to produce the pre-tick value was skipped, so the other won
    // on alternating frames and the mesh strobed. Last-writer-wins is the
    // documented behaviour for that case; oscillating is not.
    const target = meshes.find((mesh) => mesh.id === anim.config.targetId);
    const pending = meshUpdates.get(anim.config.targetId);
    const standing = pending?.[anim.config.property] ?? target?.[anim.config.property];

    if (target && !sameConfig(standing, current)) {
      meshUpdates.set(anim.config.targetId, {
        ...pending,
        [anim.config.property]: current
      });
    }

    // Check if animation is complete
    if (progress >= 1) {
      // A non-positive duration completes on the frame it starts, so
      // looping it would complete on every frame for ever — a frame loop
      // that can never produce a different pixel.
      if (anim.config.loop && anim.config.duration > 0) {
        // Carry the overshoot into the next lap. Resetting to the tick's
        // own time discards however far past the boundary the frame landed,
        // which on a 100ms loop ticked at 60fps drifts a whole frame a lap.
        const overshoot = anim.config.duration > 0 ? elapsed % anim.config.duration : 0;
        return { ...anim, startTime: time - overshoot };
      } else {
        // Stop animation
        return { ...anim, startTime, isPlaying: false };
      }
    }

    return anim.startTime === startTime ? anim : { ...anim, startTime };
  });


  // Identity is the signal the sync reads, so an idle tick has to return the
  // very same array — otherwise every frame would look like a change.
  const nextMeshes =
    meshUpdates.size === 0
      ? meshes
      : meshes.map((mesh) => {
          const update = meshUpdates.get(mesh.id);
          return update ? { ...mesh, ...update } : mesh;
        });

  return { animations: updatedAnimations, meshes: nextMeshes, updates: meshUpdates };
}

/**
 * Visual-only continuation of declared animations after their store retired.
 *
 * Takes a *data* snapshot of the animations and meshes the component last
 * synced, and on each call advances it with `advanceAnimations` — the reducer's
 * own step, on the reducer's own `Date.now()` clock — writing what changed
 * straight to the renderer through `updateMesh`. A destination reading the same
 * shared animation state therefore stays in phase with the outgoing copy. It
 * reads no store, runs no reducer and dispatches nothing; state changes other
 * than these declared animations do not continue.
 */
export function continueAnimations(
  animations: readonly AnimationState[],
  adapter: SceneAdapter,
  now: () => number = Date.now,
  meshes?: readonly AnimatedMesh[]
): (() => void) | undefined {
  if (!animations.some((animation) => animation.isPlaying)) return undefined;
  // Without the synced meshes, each target starts with no standing pose, so its
  // first sample is written; poses are the same either way.
  let current: { animations: AnimationState[]; meshes: AnimatedMesh[] } = {
    animations: [...animations],
    meshes: meshes
      ? meshes.map(({ id, position, rotation, scale }) => ({ id, position, rotation, scale }))
      : [...new Set(animations.map((animation) => animation.config.targetId))].map((id) => ({ id }))
  };

  return () => {
    if (!current.animations.some((animation) => animation.isPlaying)) return;
    const next = advanceAnimations(current.animations, current.meshes, now());
    current = { animations: next.animations, meshes: next.meshes };
    for (const [id, update] of next.updates) adapter.updateMesh(id, update);
  };
}
