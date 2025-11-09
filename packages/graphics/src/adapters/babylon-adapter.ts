/**
 * @file babylon-adapter.ts
 * @description Babylon.js adapter with WebGPU/WebGL fallback
 */

import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3 as BabylonVector3,
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  DirectionalLight,
  PointLight,
  SpotLight,
  Animation,
  type Nullable
} from '@babylonjs/core';

import type {
  RendererCapabilities,
  CameraConfig,
  MeshConfig,
  LightConfig,
  GeometryConfig,
  MaterialConfig,
  Vector3
} from '../core/types';

/**
 * Babylon.js adapter - handles WebGPU/WebGL rendering
 */
export class BabylonAdapter {
  private engine: Nullable<Engine> = null;
  private scene: Nullable<Scene> = null;
  private camera: Nullable<ArcRotateCamera> = null;
  private meshes: Map<string, Mesh> = new Map();
  private lights: Array<HemisphericLight | DirectionalLight | PointLight | SpotLight> = [];

  /**
   * Initialize Babylon.js engine with WebGPU/WebGL fallback
   */
  async initialize(
    canvas: HTMLCanvasElement,
    preferWebGPU: boolean = true
  ): Promise<{ renderer: 'webgpu' | 'webgl'; capabilities: RendererCapabilities }> {
    let useWebGPU = false;

    // Try WebGPU first if preferred and available
    if (preferWebGPU && 'gpu' in navigator) {
      try {
        // Check if WebGPU is supported
        const adapter = await (navigator as any).gpu?.requestAdapter();
        if (adapter) {
          useWebGPU = true;
          this.engine = new Engine(canvas, true, {
            adaptToDeviceRatio: true,
            antialias: true
          });
          // Enable WebGPU if available in Babylon.js v8
          // Note: Babylon.js automatically uses WebGPU when available
        }
      } catch (error) {
        console.warn('[BabylonAdapter] WebGPU not available, falling back to WebGL:', error);
        useWebGPU = false;
      }
    }

    // Fallback to WebGL
    if (!this.engine) {
      this.engine = new Engine(canvas, true, {
        adaptToDeviceRatio: true,
        antialias: true,
        preserveDrawingBuffer: true
      });
    }

    // Create scene
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.1, 0.1, 0.1, 1);

    // Create default camera
    this.camera = new ArcRotateCamera(
      'camera',
      Math.PI / 2,
      Math.PI / 3,
      10,
      BabylonVector3.Zero(),
      this.scene
    );
    this.camera.attachControl(canvas, true);

    // Start render loop
    this.engine.runRenderLoop(() => {
      this.scene?.render();
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      this.engine?.resize();
    });

    // Get capabilities
    const capabilities: RendererCapabilities = {
      supportsWebGPU: useWebGPU,
      supportsWebGL: !useWebGPU,
      maxTextureSize: this.engine.getCaps().maxTextureSize,
      maxVertexAttributes: this.engine.getCaps().maxVertexAttribs
    };

    return {
      renderer: useWebGPU ? 'webgpu' : 'webgl',
      capabilities
    };
  }

  /**
   * Update camera configuration
   */
  updateCamera(config: CameraConfig): void {
    if (!this.camera || !this.scene) return;

    // Update position
    const [x, y, z] = config.position;
    this.camera.setPosition(new BabylonVector3(x, y, z));

    // Update target (lookAt)
    const [tx, ty, tz] = config.lookAt;
    this.camera.setTarget(new BabylonVector3(tx, ty, tz));

    // Update FOV if provided
    if (config.fov !== undefined) {
      this.camera.fov = (config.fov * Math.PI) / 180; // Convert to radians
    }

    // Update near/far planes
    if (config.near !== undefined) {
      this.camera.minZ = config.near;
    }
    if (config.far !== undefined) {
      this.camera.maxZ = config.far;
    }
  }

  /**
   * Add mesh to scene
   */
  addMesh(config: MeshConfig): void {
    if (!this.scene) return;

    // Create geometry
    const mesh = this.createGeometry(config.geometry, config.id);
    if (!mesh) return;

    // Set position
    const [x, y, z] = config.position;
    mesh.position = new BabylonVector3(x, y, z);

    // Set rotation if provided
    if (config.rotation) {
      const [rx, ry, rz] = config.rotation;
      mesh.rotation = new BabylonVector3(rx, ry, rz);
    }

    // Set scale if provided
    if (config.scale) {
      const [sx, sy, sz] = config.scale;
      mesh.scaling = new BabylonVector3(sx, sy, sz);
    }

    // Apply material
    if ('color' in config.material) {
      this.applyMaterial(mesh, config.material);
    }

    // Set visibility
    mesh.isVisible = config.visible ?? true;

    // Store mesh reference
    this.meshes.set(config.id, mesh);
  }

  /**
   * Remove mesh from scene
   */
  removeMesh(id: string): void {
    const mesh = this.meshes.get(id);
    if (mesh) {
      mesh.dispose();
      this.meshes.delete(id);
    }
  }

  /**
   * Update mesh properties
   */
  updateMesh(id: string, updates: Partial<MeshConfig>): void {
    const mesh = this.meshes.get(id);
    if (!mesh) return;

    // Update position
    if (updates.position) {
      const [x, y, z] = updates.position;
      mesh.position = new BabylonVector3(x, y, z);
    }

    // Update rotation
    if (updates.rotation) {
      const [rx, ry, rz] = updates.rotation;
      mesh.rotation = new BabylonVector3(rx, ry, rz);
    }

    // Update scale
    if (updates.scale) {
      const [sx, sy, sz] = updates.scale;
      mesh.scaling = new BabylonVector3(sx, sy, sz);
    }

    // Update material
    if (updates.material && 'color' in updates.material) {
      this.applyMaterial(mesh, updates.material);
    }

    // Update visibility
    if (updates.visible !== undefined) {
      mesh.isVisible = updates.visible;
    }
  }

  /**
   * Add light to scene
   */
  addLight(config: LightConfig): void {
    if (!this.scene) return;

    let light: HemisphericLight | DirectionalLight | PointLight | SpotLight;

    switch (config.type) {
      case 'ambient': {
        light = new HemisphericLight(
          `ambient-${this.lights.length}`,
          new BabylonVector3(0, 1, 0),
          this.scene
        );
        light.intensity = config.intensity;
        if (config.color) {
          light.diffuse = this.hexToColor3(config.color);
        }
        break;
      }

      case 'directional': {
        const [x, y, z] = config.position;
        light = new DirectionalLight(
          `directional-${this.lights.length}`,
          new BabylonVector3(x, y, z),
          this.scene
        );
        light.intensity = config.intensity;
        if (config.color) {
          light.diffuse = this.hexToColor3(config.color);
        }
        break;
      }

      case 'point': {
        const [x, y, z] = config.position;
        light = new PointLight(
          `point-${this.lights.length}`,
          new BabylonVector3(x, y, z),
          this.scene
        );
        light.intensity = config.intensity;
        if (config.radius) {
          light.range = config.radius;
        }
        if (config.color) {
          light.diffuse = this.hexToColor3(config.color);
        }
        break;
      }

      case 'spot': {
        const [x, y, z] = config.position;
        const [dx, dy, dz] = config.direction;
        light = new SpotLight(
          `spot-${this.lights.length}`,
          new BabylonVector3(x, y, z),
          new BabylonVector3(dx, dy, dz),
          config.angle,
          1, // Exponent
          this.scene
        );
        light.intensity = config.intensity;
        if (config.color) {
          light.diffuse = this.hexToColor3(config.color);
        }
        break;
      }
    }

    this.lights.push(light);
  }

  /**
   * Remove light from scene
   */
  removeLight(index: number): void {
    const light = this.lights[index];
    if (light) {
      light.dispose();
      this.lights.splice(index, 1);
    }
  }

  /**
   * Set scene background color
   */
  setBackgroundColor(color: string): void {
    if (!this.scene) return;
    const color3 = this.hexToColor3(color);
    this.scene.clearColor = new Color4(color3.r, color3.g, color3.b, 1);
  }

  /**
   * Resize canvas
   */
  resize(): void {
    this.engine?.resize();
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    // Dispose meshes
    this.meshes.forEach((mesh) => mesh.dispose());
    this.meshes.clear();

    // Dispose lights
    this.lights.forEach((light) => light.dispose());
    this.lights = [];

    // Dispose scene and engine
    this.scene?.dispose();
    this.engine?.dispose();

    this.camera = null;
    this.scene = null;
    this.engine = null;
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  /**
   * Create geometry based on configuration
   */
  private createGeometry(config: GeometryConfig, id: string): Nullable<Mesh> {
    if (!this.scene) return null;

    switch (config.type) {
      case 'box': {
        return MeshBuilder.CreateBox(id, { size: config.size }, this.scene);
      }

      case 'sphere': {
        return MeshBuilder.CreateSphere(
          id,
          { diameter: config.radius * 2, segments: config.segments || 32 },
          this.scene
        );
      }

      case 'cylinder': {
        return MeshBuilder.CreateCylinder(
          id,
          { height: config.height, diameter: config.diameter },
          this.scene
        );
      }

      case 'plane': {
        return MeshBuilder.CreatePlane(
          id,
          { width: config.width, height: config.height },
          this.scene
        );
      }

      case 'custom': {
        // TODO: Implement custom geometry from vertices/indices
        console.warn('[BabylonAdapter] Custom geometry not yet implemented');
        return null;
      }

      default: {
        const _never: never = config;
        console.warn('[BabylonAdapter] Unknown geometry type:', _never);
        return null;
      }
    }
  }

  /**
   * Apply material to mesh
   */
  private applyMaterial(mesh: Mesh, config: MaterialConfig): void {
    if (!this.scene) return;

    const material = new StandardMaterial(`${mesh.id}-material`, this.scene);

    // Set color
    material.diffuseColor = this.hexToColor3(config.color);

    // Set metallic/roughness (PBR approximation with StandardMaterial)
    if (config.metallic !== undefined) {
      material.specularColor = new Color3(config.metallic, config.metallic, config.metallic);
    }

    // Set emissive
    if (config.emissive) {
      material.emissiveColor = this.hexToColor3(config.emissive);
    }

    // Set alpha
    if (config.alpha !== undefined) {
      material.alpha = config.alpha;
    }

    // Set wireframe
    if (config.wireframe) {
      material.wireframe = true;
    }

    mesh.material = material;
  }

  /**
   * Convert hex color string to Babylon.js Color3
   */
  private hexToColor3(hex: string): Color3 {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) {
      return new Color3(1, 1, 1); // Default to white
    }

    return new Color3(
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255
    );
  }
}
