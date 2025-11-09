/**
 * @file reducer.ts
 * @description Graphics reducer - pure state management for 3D scenes
 */

import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import type {
  GraphicsState,
  GraphicsAction,
  GraphicsDeps,
  MeshConfig,
  LightConfig,
  AnimationConfig,
  Vector3
} from './types';

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
      return [
        {
          ...state,
          camera: {
            ...state.camera,
            ...action.camera
          }
        },
        Effect.none()
      ];
    }

    case 'setCameraPosition': {
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
      return [
        {
          ...state,
          meshes: [...state.meshes, action.mesh]
        },
        Effect.none()
      ];
    }

    case 'removeMesh': {
      return [
        {
          ...state,
          meshes: state.meshes.filter((m) => m.id !== action.id)
        },
        Effect.none()
      ];
    }

    case 'updateMesh': {
      return [
        {
          ...state,
          meshes: state.meshes.map((mesh) =>
            mesh.id === action.id ? { ...mesh, ...action.updates } : mesh
          )
        },
        Effect.none()
      ];
    }

    case 'setMeshPosition': {
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
      return [
        {
          ...state,
          meshes: state.meshes.map((mesh) =>
            mesh.id === action.id ? { ...mesh, visible: !mesh.visible } : mesh
          )
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Light Actions
    // ========================================================================

    case 'addLight': {
      return [
        {
          ...state,
          lights: [...state.lights, action.light]
        },
        Effect.none()
      ];
    }

    case 'removeLight': {
      return [
        {
          ...state,
          lights: state.lights.filter((_, i) => i !== action.index)
        },
        Effect.none()
      ];
    }

    case 'updateLight': {
      // Replace the entire light config (can't spread partial updates across discriminated union)
      return [
        {
          ...state,
          lights: state.lights.map((light, i) =>
            i === action.index ? (action.light as LightConfig) : light
          )
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Animation Actions
    // ========================================================================

    case 'startAnimation': {
      const animation = {
        id: action.animation.id,
        config: action.animation,
        startTime: Date.now(),
        isPlaying: true
      };

      return [
        {
          ...state,
          animations: [...state.animations, animation]
        },
        // Start animation frame loop
        Effect.run(async (dispatch) => {
          const animate = () => {
            dispatch({ type: 'tick', time: Date.now() });
          };
          requestAnimationFrame(animate);
        })
      ];
    }

    case 'stopAnimation': {
      return [
        {
          ...state,
          animations: state.animations.filter((a) => a.id !== action.id)
        },
        Effect.none()
      ];
    }

    case 'tick': {
      // Update all active animations
      const updatedAnimations = state.animations.map((anim) => {
        if (!anim.isPlaying) return anim;

        const elapsed = action.time - anim.startTime;
        const progress = Math.min(elapsed / anim.config.duration, 1);

        // Apply easing
        const easedProgress = applyEasing(progress, anim.config.easing || 'linear');

        // Interpolate value
        const current = interpolateVector3(
          anim.config.from,
          anim.config.to,
          easedProgress
        );

        // Update target mesh
        const targetMesh = state.meshes.find((m) => m.id === anim.config.targetId);
        if (targetMesh) {
          if (anim.config.property === 'position') {
            targetMesh.position = current;
          } else if (anim.config.property === 'rotation') {
            targetMesh.rotation = current;
          } else if (anim.config.property === 'scale') {
            targetMesh.scale = current;
          }
        }

        // Check if animation is complete
        if (progress >= 1) {
          if (anim.config.loop) {
            // Reset animation
            return { ...anim, startTime: action.time };
          } else {
            // Stop animation
            return { ...anim, isPlaying: false };
          }
        }

        return anim;
      });

      const hasActiveAnimations = updatedAnimations.some((a) => a.isPlaying);

      return [
        {
          ...state,
          animations: updatedAnimations
        },
        hasActiveAnimations
          ? Effect.run(async (dispatch) => {
              requestAnimationFrame(() => {
                dispatch({ type: 'tick', time: Date.now() });
              });
            })
          : Effect.none()
      ];
    }

    // ========================================================================
    // Scene Actions
    // ========================================================================

    case 'setBackgroundColor': {
      return [
        {
          ...state,
          backgroundColor: action.color
        },
        Effect.none()
      ];
    }

    case 'clearScene': {
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
