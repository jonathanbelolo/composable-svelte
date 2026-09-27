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
  AnimationState,
  Vector3
} from './types.js';
import { customGeometryProblem } from './geometry.js';
import { advanceAnimations, sameConfig } from './animation-sample.js';

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
 * one part of a reducer's output shared under one effect owner — that store
 * keeps a single `inFlightEffects` map and `Effect.map` carries the id through
 * every layer of scoping — so a shared constant meant two graphics features
 * composed under that owner aborted each other's loop. The first one started froze at its
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
      '[graphics] state has no sceneId; scenes composed under one effect owner ' +
        "may cancel each other's animation frame loop. Build state with createInitialGraphicsState()."
    );
    return ANIMATION_FRAME_EFFECT;
  }

  return `${ANIMATION_FRAME_EFFECT}.${sceneId}`;
}

/**
 * Cancel the frame-loop effect for a scene.
 */
function cancelFrame(sceneId: string): EffectType<GraphicsAction> {
  return Effect.cancel(frameEffectId(sceneId));
}

/**
 * Schedule the next animation frame, superseding any frame already pending.
 *
 * The executor stays open until the frame fires or is aborted. When cancelled,
 * superseded or destroyed, the native animation frame callback is cancelled
 * via `cancelAnimationFrame` and the abort listener is detached.
 */
function scheduleFrame(sceneId: string): EffectType<GraphicsAction> {
  return Effect.cancellable(frameEffectId(sceneId), async (dispatch, signal) => {
    if (signal?.aborted) {
      return;
    }

    const fired = await new Promise<boolean>((resolve) => {
      let handle: number | undefined;
      let settled = false;
      let cancelled = false;

      const cancel = () => {
        if (cancelled) return;
        if (typeof handle === 'number') {
          cancelled = true;
          cancelAnimationFrame(handle);
        }
      };

      const settle = (success: boolean) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        resolve(success);
      };

      const onAbort = () => {
        cancel();
        settle(false);
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) {
          onAbort();
          return;
        }
      }

      try {
        handle = requestAnimationFrame(() => settle(true));
      } catch (error) {
        signal?.removeEventListener('abort', onAbort);
        throw error;
      }

      if (settled) {
        if (signal?.aborted) {
          cancel();
        }
      } else if (signal?.aborted) {
        onAbort();
      }
    });

    if (fired && !signal?.aborted) {
      dispatch({ type: 'tick', time: Date.now() });
    }
  });
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
      const hadActive = state.animations.some(
        (a) => a.config.targetId === action.id && a.isPlaying
      );
      const remainingAnimations = state.animations.filter(
        (a) => a.config.targetId !== action.id
      );
      const hasOtherActive = remainingAnimations.some((a) => a.isPlaying);

      return [
        {
          ...state,
          meshes: state.meshes.filter((m) => m.id !== action.id),
          animations: remainingAnimations
        },
        hadActive && !hasOtherActive ? cancelFrame(state.sceneId) : Effect.none()
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

      const animation: AnimationState = {
        id: action.animation.id,
        config: action.animation,
        startTime: null,
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

      const hadActive = state.animations.some(
        (a) => a.id === action.id && a.isPlaying
      );
      const remainingAnimations = state.animations.filter((a) => a.id !== action.id);
      const hasOtherActive = remainingAnimations.some((a) => a.isPlaying);

      return [
        {
          ...state,
          animations: remainingAnimations
        },
        hadActive && !hasOtherActive ? cancelFrame(state.sceneId) : Effect.none()
      ];
    }

    case 'tick': {
      const { animations: updatedAnimations, meshes } = advanceAnimations(
        state.animations,
        state.meshes,
        action.time
      );
      const hasActiveAnimations = updatedAnimations.some((a) => a.isPlaying);

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

      const hadActive = state.animations.some((a) => a.isPlaying);

      return [
        {
          ...state,
          meshes: [],
          lights: [],
          animations: []
        },
        hadActive ? cancelFrame(state.sceneId) : Effect.none()
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
