/**
 * @file reducer.ts
 * @description Graphics reducer - pure state management for 3D scenes
 */

// `EffectType` is the public name for the `Effect<A>` *type*; `Effect` itself
// is the value namespace (`Effect.run`, `Effect.cancellable`).
import type { EffectType, Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import type {
  GraphicsState,
  GraphicsAction,
  GraphicsDeps,
  MeshConfig,
  LightConfig,
  AnimationConfig,
  Vector3
} from './types.js';
import { customGeometryProblem } from './geometry.js';

/**
 * The single frame-loop effect id.
 *
 * `Effect.cancellable` cancels any in-flight effect sharing an id, so
 * scheduling under this one always *supersedes* rather than adds — which is the
 * property "one frame loop for the whole store" actually needs.
 *
 * The first attempt approximated it with `alreadyTicking`, derived from whether
 * anything was playing. That is a proxy for "a frame is already pending", and
 * the two come apart the moment an animation is removed while its frame is
 * still in flight: stop-then-start, `clearScene`-then-start and
 * `removeMesh`-then-start each forked a second chain that never merged and
 * never died, and they compounded — five start/stop cycles settled at six
 * permanent chains, each re-walking every animation and mesh for ever.
 *
 * It also could not recover. If the scheduling effect never ran — the store
 * skips every effect under SSR — the animations stayed `isPlaying: true` with
 * no chain, and `alreadyTicking` was then true for ever, so no later
 * `startAnimation` could restart anything.
 */
const ANIMATION_FRAME_EFFECT = 'graphics.animationFrame';

/**
 * The frame-loop effect id for one scene.
 *
 * Keyed by `sceneId`, not by the module constant alone. A cancellable id is the
 * one part of a reducer's output that is global by construction — the store
 * keeps a single `inFlightEffects` map and `Effect.map` carries the id through
 * every layer of scoping — so a shared constant meant two composed graphics
 * features aborted each other's loop. The first one started froze at its
 * initial position, permanently, while still reporting `isPlaying: true`.
 */
function frameEffectId(sceneId: string): string {
  if (!sceneId) {
    // A `GraphicsState` that did not come from `createInitialGraphicsState` —
    // hand-built, or hydrated from a payload serialised before `sceneId`
    // existed. The id would fall back to a constant, which is exactly the
    // cross-feature cancellation this field was added to prevent, and a single
    // such scene runs perfectly so nothing would ever surface it.
    console.warn(
      '[graphics] state has no sceneId; two scenes without one will cancel ' +
        "each other's animation frame loop. Build state with createInitialGraphicsState()."
    );
    return ANIMATION_FRAME_EFFECT;
  }

  return `${ANIMATION_FRAME_EFFECT}.${sceneId}`;
}

/**
 * Schedule the next animation frame, superseding any frame already pending.
 *
 * The executor stays open *until* the frame fires rather than returning as soon
 * as `requestAnimationFrame` is queued. That is what makes it cancellable at
 * all: an effect that completes synchronously is never in flight, so a
 * superseding registration would have nothing to cancel and both callbacks
 * would dispatch. The queued callback still runs — rAF has no cancellation the
 * store can reach — but the store gates a cancelled effect's dispatches, so a
 * superseded chain's `tick` never lands and it stops there instead of
 * scheduling its own successor.
 *
 * No `signal.aborted` check here, deliberately: `store.svelte.ts` wraps the
 * dispatch handed to a cancellable effect and drops actions once the signal
 * aborts, precisely "so cancellation means something even for an executor that
 * ignores the signal entirely". A check here cannot change behaviour, and no
 * test can distinguish it — which is the definition this campaign sweeps by.
 */
function scheduleFrame(sceneId: string): EffectType<GraphicsAction> {
  return Effect.cancellable(frameEffectId(sceneId), async (dispatch) => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    dispatch({ type: 'tick', time: Date.now() });
  });
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
function sameConfig(a: unknown, b: unknown): boolean {
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

/**
 * Graphics reducer - manages all scene state
 */
export const graphicsReducer: Reducer<GraphicsState, GraphicsAction, GraphicsDeps> = (
  state,
  action,
  _deps
) => {
  switch (action.type) {
    // ========================================================================
    // Renderer Actions
    // ========================================================================

    case 'rendererInitialized': {
      return [
        {
          ...state,
          renderer: {
            ...state.renderer,
            activeRenderer: action.renderer,
            isInitialized: true,
            capabilities: action.capabilities,
            error: null
          },
          isLoading: false
        },
        Effect.none()
      ];
    }

    case 'rendererError': {
      return [
        {
          ...state,
          renderer: {
            ...state.renderer,
            error: action.error
          },
          isLoading: false
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Camera Actions
    // ========================================================================

    case 'updateCamera': {
      const merged = { ...state.camera, ...action.camera };

      // Idempotent by value. Camera.svelte builds its config with
      // `$derived({...})` and dispatches it from an `$effect`; that effect also
      // reads store state via `dispatch`, so returning a fresh object here
      // would re-trigger it forever.
      if (sameConfig(state.camera, merged)) {
        return [state, Effect.none()];
      }

      return [{ ...state, camera: merged }, Effect.none()];
    }

    case 'setCameraPosition': {
      // Identity is the signal `syncScene` reads, so returning a fresh camera
      // for an unchanged position makes the renderer re-apply it for nothing.
      if (sameConfig(state.camera.position, action.position)) {
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          camera: {
            ...state.camera,
            position: action.position
          }
        },
        Effect.none()
      ];
    }

    case 'setCameraLookAt': {
      if (sameConfig(state.camera.lookAt, action.lookAt)) {
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          camera: {
            ...state.camera,
            lookAt: action.lookAt
          }
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Mesh Actions
    // ========================================================================

    case 'addMesh': {
      // Ids must be unique or they are not identity. `syncScene` keys both its
      // baseline and the incoming state by id, so a duplicate silently drops
      // all but the last from the renderer while `removeMesh` — which filters —
      // would remove every one of them at once.
      if (state.meshes.some((mesh) => mesh.id === action.mesh.id)) {
        console.warn(
          `[graphics] addMesh: id "${action.mesh.id}" is already in use; ignoring`
        );
        return [state, Effect.none()];
      }

      // Custom geometry the renderer cannot build must not enter state either.
      //
      // The adapter returns null for geometry it cannot make and `addMesh`
      // bails cleanly — but the mesh stayed in `state.meshes`, so state and
      // scene diverged permanently and every later `updateMesh` for that id was
      // a silent no-op against a renderer that had never heard of it. Same
      // treatment as a duplicate id, for the same reason.
      const problem = customGeometryProblem(action.mesh.geometry);
      if (problem) {
        console.warn(
          `[graphics] addMesh: id "${action.mesh.id}" has invalid custom geometry (${problem}); ignoring`
        );
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          meshes: [...state.meshes, action.mesh]
        },
        Effect.none()
      ];
    }

    case 'removeMesh': {
      if (!state.meshes.some((mesh) => mesh.id === action.id)) {
        return [state, Effect.none()];
      }

      // Animations targeting the mesh go with it. `startAnimation` checks the
      // target exists, but nothing rechecked afterwards — so removing an
      // animated mesh left a `loop: true` animation ticking forever against
      // nothing, allocating a fresh `meshes` array every frame and making
      // `syncScene` walk both Maps for no reason.
      return [
        {
          ...state,
          meshes: state.meshes.filter((m) => m.id !== action.id),
          animations: state.animations.filter((a) => a.config.targetId !== action.id)
        },
        Effect.none()
      ];
    }

    case 'updateMesh': {
      const existing = state.meshes.find((mesh) => mesh.id === action.id);
      if (!existing) {
        return [state, Effect.none()];
      }

      const merged = { ...existing, ...action.updates };

      // Same value-idempotency requirement as `updateCamera` — Mesh.svelte
      // dispatches a `$derived` config object from an `$effect`.
      if (sameConfig(existing, merged)) {
        return [state, Effect.none()];
      }

      // After the idempotency check, so unchanged geometry costs nothing.
      const problem = customGeometryProblem(merged.geometry);
      if (problem) {
        console.warn(
          `[graphics] updateMesh: id "${action.id}" has invalid custom geometry (${problem}); ignoring`
        );
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          meshes: state.meshes.map((mesh) => (mesh.id === action.id ? merged : mesh))
        },
        Effect.none()
      ];
    }

    case 'setMeshPosition': {
      const target = state.meshes.find((mesh) => mesh.id === action.id);
      if (!target || sameConfig(target.position, action.position)) {
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          meshes: state.meshes.map((mesh) =>
            mesh.id === action.id ? { ...mesh, position: action.position } : mesh
          )
        },
        Effect.none()
      ];
    }

    case 'setMeshRotation': {
      const target = state.meshes.find((mesh) => mesh.id === action.id);
      if (!target || sameConfig(target.rotation, action.rotation)) {
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          meshes: state.meshes.map((mesh) =>
            mesh.id === action.id ? { ...mesh, rotation: action.rotation } : mesh
          )
        },
        Effect.none()
      ];
    }

    case 'setMeshScale': {
      const target = state.meshes.find((mesh) => mesh.id === action.id);
      if (!target || sameConfig(target.scale, action.scale)) {
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          meshes: state.meshes.map((mesh) =>
            mesh.id === action.id ? { ...mesh, scale: action.scale } : mesh
          )
        },
        Effect.none()
      ];
    }

    case 'toggleMeshVisibility': {
      if (!state.meshes.some((mesh) => mesh.id === action.id)) {
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          meshes: state.meshes.map((mesh) =>
            // `?? true`, because that is what the adapter reads. `visible` is
            // optional, and `!undefined` is `true` — so the first toggle of a
            // mesh added without an explicit `visible` set it to what it
            // already was, and the user saw a dead button.
            mesh.id === action.id ? { ...mesh, visible: !(mesh.visible ?? true) } : mesh
          )
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Light Actions
    // ========================================================================

    case 'addLight': {
      // Same uniqueness requirement as `addMesh`, and with a sharper failure:
      // two `<Light>` components sharing an id used to overwrite each other's
      // config forever — `updateLight`'s guard compares against the *first*
      // match while its update maps over *every* match — until Svelte aborted
      // the whole app with `effect_update_depth_exceeded`.
      if (state.lights.some((light) => light.id === action.light.id)) {
        console.warn(
          `[graphics] addLight: id "${action.light.id}" is already in use; ignoring`
        );
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          lights: [...state.lights, action.light]
        },
        Effect.none()
      ];
    }

    case 'removeLight': {
      if (!state.lights.some((light) => light.id === action.id)) {
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          lights: state.lights.filter((light) => light.id !== action.id)
        },
        Effect.none()
      ];
    }

    case 'updateLight': {
      const existing = state.lights.find((light) => light.id === action.id);
      if (!existing) return [state, Effect.none()];

      // Idempotent by value, for the same reason `updateCamera` and
      // `updateMesh` are: `Light.svelte` dispatches this from an `$effect` that
      // reads store state via `dispatch`, so returning a fresh object when
      // nothing changed re-triggers that effect forever. Without this guard the
      // component hits `effect_update_depth_exceeded` on mount — which is
      // exactly what happened when the effect was added.
      if (sameConfig(existing, action.light)) {
        return [state, Effect.none()];
      }

      // Replace the entire config: a partial cannot be spread across a
      // discriminated union without losing the discriminant.
      return [
        {
          ...state,
          lights: state.lights.map((light) =>
            light.id === action.id ? action.light : light
          )
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Animation Actions
    // ========================================================================

    case 'startAnimation': {
      // An animation naming no existing mesh used to be accepted and ticked
      // forever against nothing. That was invisible while ticks reached nothing
      // at all; now that they drive the renderer it is a live per-frame loop
      // that can never produce a frame — and `hasActiveAnimations` keeps
      // scheduling the next one.
      if (!state.meshes.some((mesh) => mesh.id === action.animation.targetId)) {
        console.warn(
          `[graphics] startAnimation: no mesh with id "${action.animation.targetId}"`
        );
        return [state, Effect.none()];
      }

      const animation = {
        id: action.animation.id,
        config: action.animation,
        startTime: Date.now(),
        isPlaying: true
      };

      // An id already in state is *replaced*, not refused. One entry per id
      // still holds — `stopAnimation` filters by id, so a duplicate pair could
      // only ever be stopped together — but refusing was worse than the problem
      // it solved: `tick` marks a finished animation `isPlaying: false` without
      // removing it, so a completed id was burned for the life of the store and
      // the warning claimed it was "already running". Any button that restarts
      // a non-looping animation under a fixed id worked exactly once, silently.
      // Restarting is what "start this animation" should mean.
      //
      // (An earlier version of this comment said the README's own
      // `<button onclick={startRotation}>` demonstrated it. It does not — that
      // example sets `loop: true`, as does the skill file's. The defect is
      // real; that particular evidence for it was not.)
      const existing = state.animations.findIndex((a) => a.id === action.animation.id);
      const animations =
        existing === -1
          ? [...state.animations, animation]
          : state.animations.map((a, i) => (i === existing ? animation : a));

      return [{ ...state, animations }, scheduleFrame(state.sceneId)];
    }

    case 'stopAnimation': {
      if (!state.animations.some((a) => a.id === action.id)) {
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          animations: state.animations.filter((a) => a.id !== action.id)
        },
        Effect.none()
      ];
    }

    case 'tick': {
      const meshUpdates = new Map<string, Partial<MeshConfig>>();

      // Update all active animations
      const updatedAnimations = state.animations.map((anim) => {
        if (!anim.isPlaying) return anim;

        const elapsed = action.time - anim.startTime;
        // Clamped at both ends, and `duration <= 0` is complete rather than
        // undefined. `elapsed / 0` is NaN when a tick lands in the same
        // millisecond as the start — both are `Date.now()`, so that is ordinary
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
        // was the whole defect: `state.meshes` kept both its array identity and
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
        const target = state.meshes.find((mesh) => mesh.id === anim.config.targetId);
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
            return { ...anim, startTime: action.time - overshoot };
          } else {
            // Stop animation
            return { ...anim, isPlaying: false };
          }
        }

        return anim;
      });

      const hasActiveAnimations = updatedAnimations.some((a) => a.isPlaying);

      // Identity is the signal the sync reads, so an idle tick has to return the
      // very same array — otherwise every frame would look like a change.
      const meshes =
        meshUpdates.size === 0
          ? state.meshes
          : state.meshes.map((mesh) => {
              const update = meshUpdates.get(mesh.id);
              return update ? { ...mesh, ...update } : mesh;
            });

      return [
        {
          ...state,
          meshes,
          animations: updatedAnimations
        },
        hasActiveAnimations ? scheduleFrame(state.sceneId) : Effect.none()
      ];
    }

    // ========================================================================
    // Scene Actions
    // ========================================================================

    case 'setBackgroundColor': {
      if (state.backgroundColor === action.color) {
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          backgroundColor: action.color
        },
        Effect.none()
      ];
    }

    case 'clearScene': {
      // The last two arms to get an identity guard. Same reason as the rest:
      // `syncScene` reads identity, so clearing an already-empty scene handed
      // it three fresh arrays to walk for nothing.
      if (
        state.meshes.length === 0 &&
        state.lights.length === 0 &&
        state.animations.length === 0
      ) {
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          meshes: [],
          lights: [],
          animations: []
        },
        Effect.none()
      ];
    }

    default: {
      // Exhaustiveness check
      const _never: never = action;
      console.warn('[GraphicsReducer] Unhandled action:', _never);
      return [state, Effect.none()];
    }
  }
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Apply easing function to progress value (0-1)
 */
function applyEasing(
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
function interpolateVector3(from: Vector3, to: Vector3, t: number): Vector3 {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t
  ];
}
