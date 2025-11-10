/**
 * @file types.ts
 * @description Core types for the graphics package
 */

// ============================================================================
// Vector and Transform Types
// ============================================================================

export type Vector3 = [number, number, number];
export type Vector2 = [number, number];
export type Color = string; // Hex color string like '#ff6b6b'

export interface Transform {
  position: Vector3;
  rotation: Vector3; // Euler angles in radians
  scale: Vector3;
}

// ============================================================================
// Renderer Configuration
// ============================================================================

export type RendererType = 'auto' | 'webgpu' | 'webgl';

export interface RendererConfig {
  type: RendererType;
  preferWebGPU?: boolean;
  antialiasing?: boolean;
  adaptToDeviceRatio?: boolean;
}

export interface RendererState {
  activeRenderer: 'webgpu' | 'webgl' | null;
  isInitialized: boolean;
  capabilities: RendererCapabilities;
  error: string | null;
}

export interface RendererCapabilities {
  supportsWebGPU: boolean;
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

export type GeometryType = 'box' | 'sphere' | 'cylinder' | 'plane' | 'torus' | 'custom';

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

export interface CustomShaderMaterial {
  vertexShader: string;
  fragmentShader: string;
  uniforms?: Record<string, unknown>;
}

// ============================================================================
// Light Types
// ============================================================================

export type LightType = 'directional' | 'point' | 'spot' | 'ambient';

export type LightConfig =
  | {
      type: 'directional';
      position: Vector3;
      intensity: number;
      color?: Color;
    }
  | {
      type: 'point';
      position: Vector3;
      intensity: number;
      radius?: number;
      color?: Color;
    }
  | {
      type: 'spot';
      position: Vector3;
      direction: Vector3;
      angle: number; // In radians
      intensity: number;
      color?: Color;
    }
  | {
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
  material: MaterialConfig | CustomShaderMaterial;
  position: Vector3;
  rotation?: Vector3;
  scale?: Vector3;
  visible?: boolean;
  castShadows?: boolean;
  receiveShadows?: boolean;
}

// ============================================================================
// Scene Graph
// ============================================================================

export interface SceneNode {
  id: string;
  children: SceneNode[];
  transform: Transform;
  visible: boolean;
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
  // Renderer
  renderer: RendererState;

  // Scene
  scene: SceneNode;
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
  loadingProgress: number; // 0-1
}

// ============================================================================
// Graphics Actions
// ============================================================================

export type GraphicsAction =
  // Renderer actions
  | { type: 'rendererInitialized'; renderer: 'webgpu' | 'webgl'; capabilities: RendererCapabilities }
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
  | { type: 'removeLight'; index: number }
  | { type: 'updateLight'; index: number; light: Partial<LightConfig> }

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
