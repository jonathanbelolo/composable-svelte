/**
 * @file types.ts
 * @description Core types for the graphics package
 */

// ============================================================================
// Vector Types
// ============================================================================

export type Vector3 = [number, number, number];
export type Color = string; // Hex color string like '#ff6b6b'

// ============================================================================
// Renderer Configuration
// ============================================================================

/**
 * `RendererType = 'auto' | 'webgpu' | 'webgl'` used to sit here, referenced by
 * nothing at all. `'webgpu'` was likewise unproducible in `activeRenderer`:
 * both branches of the adapter's "detection" built the same WebGL `Engine`, so
 * the label was the only thing that ever varied, and it is now always `'webgl'`.
 */
export interface RendererState {
  activeRenderer: 'webgl' | null;
  isInitialized: boolean;
  capabilities: RendererCapabilities;
  error: string | null;
}

export interface RendererCapabilities {
  // `supportsWebGPU: boolean` used to sit here, hardcoded to `false` in both
  // the initial state and the adapter. It is named for a *browser capability*
  // and was given a fixed answer, so on a WebGPU-capable browser it simply lied
  // — and nothing in the package consults it, because nothing here uses WebGPU.
  supportsWebGL: boolean;
  maxTextureSize: number;
  maxVertexAttributes: number;
}

// ============================================================================
// Camera Configuration
// ============================================================================

export type CameraType = 'perspective' | 'orthographic';

export interface CameraConfig {
  type: CameraType;
  position: Vector3;
  lookAt: Vector3;
  fov?: number; // Field of view in degrees (perspective only)
  near?: number;
  far?: number;
  orthoSize?: number; // Orthographic camera size
}

// ============================================================================
// Geometry Types
// ============================================================================

export type GeometryConfig =
  | { type: 'box'; size: number }
  | { type: 'sphere'; radius: number; segments?: number }
  | { type: 'cylinder'; height: number; diameter: number }
  | { type: 'plane'; width: number; height: number }
  | { type: 'torus'; diameter: number; thickness: number; segments?: number }
  | { type: 'custom'; vertices: number[]; indices: number[]; normals?: number[]; uvs?: number[] };

// ============================================================================
// Material Types
// ============================================================================

export interface MaterialConfig {
  color: Color;
  metallic?: number; // 0-1
  roughness?: number; // 0-1
  emissive?: Color;
  alpha?: number; // 0-1
  wireframe?: boolean;
}

// ============================================================================
// Light Types
// ============================================================================

/**
 * Every light carries an `id`, as every mesh does.
 *
 * Without one a light could only be named by its position in the array, and
 * that is what made removal wrong: `<Light>` captured its index at mount and
 * the reducer filtered by index, so with the default ambient light in slot 0,
 * unmounting three children removed index 1, then index 2 of the already
 * shifted array. It also forced the scene sync to clear and re-add *every*
 * light on any change, because it had no way to say which one moved.
 *
 * `<Light>` supplies one automatically via `$props.id()` when you do not, so
 * existing markup is unaffected.
 */
export type LightConfig =
  | {
      id: string;
      type: 'directional';
      /**
       * The direction the light travels in.
       *
       * This was called `position`, and a directional light has none: the
       * adapter passed the value straight into Babylon's `DirectionalLight`
       * direction argument and `updateLight` assigned it to `.direction`. The
       * name described neither the type nor the behaviour. `spot` has always
       * spelled its own the same way.
       */
      direction: Vector3;
      intensity: number;
      color?: Color;
    }
  | {
      id: string;
      type: 'point';
      position: Vector3;
      intensity: number;
      radius?: number;
      color?: Color;
    }
  | {
      id: string;
      type: 'spot';
      position: Vector3;
      direction: Vector3;
      angle: number; // In radians
      intensity: number;
      color?: Color;
    }
  | {
      id: string;
      type: 'ambient';
      intensity: number;
      color?: Color;
    };

// ============================================================================
// Mesh Configuration
// ============================================================================

export interface MeshConfig {
  id: string;
  geometry: GeometryConfig;
  /**
   * Surface appearance.
   *
   * This was `MaterialConfig | CustomShaderMaterial`, and the second arm was
   * dropped in silence: the adapter narrows with `if ('color' in ...)`, a
   * shader material has no `color`, so it fell through and rendered Babylon's
   * default. Implementing it means `ShaderMaterial` plus uniform and attribute
   * plumbing and a compile-error path, and the package already has a shader
   * story in the WebGL overlay.
   */
  material: MaterialConfig;
  position: Vector3;
  rotation?: Vector3;
  scale?: Vector3;
  visible?: boolean;
}

// ============================================================================
// Animation Types
// ============================================================================

export interface AnimationConfig {
  id: string;
  targetId: string; // ID of mesh or group to animate
  property: 'position' | 'rotation' | 'scale';
  from: Vector3;
  to: Vector3;
  duration: number; // In milliseconds
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
  loop?: boolean;
}

export interface AnimationState {
  id: string;
  config: AnimationConfig;
  startTime: number;
  isPlaying: boolean;
}

// ============================================================================
// Graphics State (Root State)
// ============================================================================

export interface GraphicsState {
  /**
   * Identity for this scene, unique per store slice.
   *
   * Used to key the animation frame loop's cancellable effect. A cancellable
   * id is the one part of a reducer's output that is global by construction:
   * the store keeps a single in-flight map and `Effect.map` preserves the id
   * through every layer of scoping. A module-level constant is therefore shared
   * by every instance of this feature, so two composed scenes cancelled each
   * other's frame loop — the first froze permanently while still reporting
   * `isPlaying: true`.
   *
   * `createInitialGraphicsState` generates one; pass your own if you need it
   * stable across reloads.
   */
  sceneId: string;

  // Renderer
  renderer: RendererState;

  // Scene
  backgroundColor: Color;

  // Camera
  camera: CameraConfig;

  // Lights
  lights: LightConfig[];

  // Meshes
  meshes: MeshConfig[];

  // Animations
  animations: AnimationState[];

  // Loading state
  isLoading: boolean;
}

// ============================================================================
// Graphics Actions
// ============================================================================

export type GraphicsAction =
  // Renderer actions
  | { type: 'rendererInitialized'; renderer: 'webgl'; capabilities: RendererCapabilities }
  | { type: 'rendererError'; error: string }

  // Camera actions
  | { type: 'updateCamera'; camera: Partial<CameraConfig> }
  | { type: 'setCameraPosition'; position: Vector3 }
  | { type: 'setCameraLookAt'; lookAt: Vector3 }

  // Mesh actions
  | { type: 'addMesh'; mesh: MeshConfig }
  | { type: 'removeMesh'; id: string }
  | { type: 'updateMesh'; id: string; updates: Partial<MeshConfig> }
  | { type: 'setMeshPosition'; id: string; position: Vector3 }
  | { type: 'setMeshRotation'; id: string; rotation: Vector3 }
  | { type: 'setMeshScale'; id: string; scale: Vector3 }
  | { type: 'toggleMeshVisibility'; id: string }

  // Light actions
  | { type: 'addLight'; light: LightConfig }
  | { type: 'removeLight'; id: string }
  | { type: 'updateLight'; id: string; light: LightConfig }

  // Animation actions
  | { type: 'startAnimation'; animation: AnimationConfig }
  | { type: 'stopAnimation'; id: string }
  | { type: 'tick'; time: number }

  // Scene actions
  | { type: 'setBackgroundColor'; color: Color }
  | { type: 'clearScene' };

// ============================================================================
// Graphics Dependencies
// ============================================================================

export interface GraphicsDeps {
  // Empty for now, will add as needed
}
