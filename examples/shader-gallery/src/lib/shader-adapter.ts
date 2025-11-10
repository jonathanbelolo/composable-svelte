/**
 * Babylon.js Shader Adapter - 2D overlay with custom shaders
 */

import {
  Engine,
  Scene,
  FreeCamera,
  Camera,
  Vector3,
  MeshBuilder,
  Texture,
  ShaderMaterial,
  Effect,
  type Nullable
} from '@babylonjs/core';
import type { ShaderEffect, ImageRegistration } from './shader-types';

interface ImagePlane {
  mesh: any;
  material: ShaderMaterial;
  texture: Texture;
  animationFrameId?: number;
}

export class ShaderAdapter {
  private engine: Nullable<Engine> = null;
  private scene: Nullable<Scene> = null;
  private camera: Nullable<FreeCamera> = null;
  private planes: Map<string, ImagePlane> = new Map();
  private currentEffect: ShaderEffect = 'none';
  private time: number = 0;

  /**
   * Set initial shader effect before any planes are created
   */
  setInitialEffect(effect: ShaderEffect): void {
    console.log('[ShaderAdapter] Setting initial effect:', effect);
    this.currentEffect = effect;
  }

  /**
   * Initialize Babylon.js with orthographic camera for 2D overlay
   */
  async initialize(canvas: HTMLCanvasElement): Promise<void> {
    // Set canvas size to match viewport BEFORE engine creation
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    console.log('[ShaderAdapter] Initializing...', {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      canvasClientWidth: canvas.clientWidth,
      canvasClientHeight: canvas.clientHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    });

    this.engine = new Engine(canvas, true, {
      adaptToDeviceRatio: false, // Use exact canvas dimensions
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: true
    });

    this.scene = new Scene(this.engine);
    this.scene.clearColor.set(0, 0, 0, 0); // Transparent background

    // Orthographic camera for 2D overlay
    const width = window.innerWidth;
    const height = window.innerHeight;

    console.log('[ShaderAdapter] Camera viewport:', { width, height });
    console.log('[ShaderAdapter] Engine size:', {
      width: this.engine.getRenderWidth(),
      height: this.engine.getRenderHeight()
    });

    // Create camera looking down the +Z axis for 2D rendering
    this.camera = new FreeCamera('camera', new Vector3(0, 0, -100), this.scene);
    this.camera.setTarget(new Vector3(0, 0, 0));
    this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;

    // Set ortho bounds to match screen coordinates
    // Centered at (0,0) with screen dimensions
    this.camera.orthoLeft = -width / 2;
    this.camera.orthoRight = width / 2;
    this.camera.orthoBottom = -height / 2;
    this.camera.orthoTop = height / 2;

    console.log('[ShaderAdapter] Camera setup:', {
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      ortho: {
        left: this.camera.orthoLeft,
        right: this.camera.orthoRight,
        top: this.camera.orthoTop,
        bottom: this.camera.orthoBottom
      }
    });

    // Start render loop
    let frameCount = 0;
    this.engine.runRenderLoop(() => {
      // Update time for animated shaders
      this.time += 0.016; // ~60fps

      // Update time uniform for all planes with animated effects
      if (this.currentEffect === 'wave' || this.currentEffect === 'chromatic') {
        this.planes.forEach((plane) => {
          if (plane.material) {
            plane.material.setFloat('time', this.time);
          }
        });

        // Log once every 60 frames for debugging
        if (frameCount % 60 === 0) {
          console.log('[ShaderAdapter] Updating time uniform:', this.time, 'effect:', this.currentEffect, 'planes:', this.planes.size);
        }
      }

      frameCount++;
      this.scene?.render();
    });

    console.log('[ShaderAdapter] Initialization complete');

    // Handle resize
    window.addEventListener('resize', () => {
      this.engine?.resize();
      this.updateCameraViewport();
    });
  }

  /**
   * Update camera viewport when canvas resizes
   */
  private updateCameraViewport(): void {
    if (!this.camera || !this.engine) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Centered coordinate system
    this.camera.orthoLeft = -width / 2;
    this.camera.orthoRight = width / 2;
    this.camera.orthoBottom = -height / 2;
    this.camera.orthoTop = height / 2;
  }

  /**
   * Add image plane at DOM position
   */
  addImagePlane(id: string, imageElement: HTMLImageElement, bounds: ImageRegistration['bounds'], onTextureLoaded?: () => void): void {
    if (!this.scene) {
      console.error('[ShaderAdapter] Scene not initialized');
      return;
    }

    console.log('[ShaderAdapter] Adding image plane:', {
      id,
      bounds,
      src: imageElement.src
    });

    // Create plane mesh first
    const plane = MeshBuilder.CreatePlane(
      id,
      { width: bounds.width, height: bounds.height },
      this.scene
    );

    // Convert DOM coordinates to centered camera coordinates
    // DOM: origin at top-left, Y goes down
    // Camera: origin at center, Y goes up
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    plane.position.x = centerX - window.innerWidth / 2;
    plane.position.y = window.innerHeight / 2 - centerY; // Flip Y
    plane.position.z = 0;

    console.log('[ShaderAdapter] Plane position:', {
      domBounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      domCenter: { x: centerX, y: centerY },
      cameraPos: { x: plane.position.x, y: plane.position.y, z: plane.position.z }
    });

    // Create texture from image - wait for it to load before applying material
    // invertY: true to flip the texture so it displays right-side up
    const texture = new Texture(imageElement.src, this.scene, false, true);

    // Wait for texture to be ready before creating material
    texture.onLoadObservable.add(() => {
      console.log('[ShaderAdapter] Texture loaded:', id, {
        isReady: texture.isReady(),
        width: texture.getSize().width,
        height: texture.getSize().height
      });

      // Create shader material after texture is ready
      const material = this.createShaderMaterial(id, texture, this.currentEffect);
      material.backFaceCulling = false; // Disable backface culling

      // Wait for material to be ready before applying to mesh
      material.onBindObservable.addOnce(() => {
        console.log('[ShaderAdapter] Material bound and ready:', {
          id,
          materialReady: material.isReady()
        });
      });

      // Apply material immediately - Babylon will handle the async compilation
      plane.material = material;

      // Make sure plane is visible
      plane.isVisible = true;
      plane.visibility = 1.0;

      console.log('[ShaderAdapter] Material applied:', {
        id,
        isVisible: plane.isVisible,
        visibility: plane.visibility,
        materialReady: material.isReady(),
        planePosition: { x: plane.position.x, y: plane.position.y, z: plane.position.z },
        planeScaling: { x: plane.scaling.x, y: plane.scaling.y, z: plane.scaling.z }
      });

      // Store plane info
      const existingPlane = this.planes.get(id);
      if (existingPlane) {
        existingPlane.material = material;
        existingPlane.texture = texture;
      } else {
        this.planes.set(id, { mesh: plane, material, texture });
      }

      // Notify that texture is ready and material is applied
      onTextureLoaded?.();
    });

    // Temporarily store plane without material
    this.planes.set(id, { mesh: plane, material: null as any, texture });
    console.log('[ShaderAdapter] Plane created, waiting for texture. Total planes:', this.planes.size);
  }

  /**
   * Update image plane position
   */
  updateImagePosition(id: string, bounds: ImageRegistration['bounds']): void {
    const plane = this.planes.get(id);
    if (!plane) return;

    // Convert DOM coordinates to centered camera coordinates
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    plane.mesh.position.x = centerX - window.innerWidth / 2;
    plane.mesh.position.y = window.innerHeight / 2 - centerY; // Flip Y
  }

  /**
   * Remove image plane
   */
  removeImagePlane(id: string): void {
    const plane = this.planes.get(id);
    if (!plane) return;

    plane.mesh.dispose();
    plane.material.dispose();
    plane.texture.dispose();
    this.planes.delete(id);
  }

  /**
   * Update shader effect for all planes
   */
  setShaderEffect(effect: ShaderEffect): void {
    console.log('[ShaderAdapter] Setting shader effect:', effect);
    this.currentEffect = effect;

    this.planes.forEach((plane, id) => {
      if (!plane.material) {
        console.warn('[ShaderAdapter] Plane has no material:', id);
        return;
      }

      console.log('[ShaderAdapter] Updating material for plane:', id, 'to effect:', effect);

      // Dispose old material
      const oldMaterial = plane.material;

      // Create new material with updated effect
      const newMaterial = this.createShaderMaterial(id, plane.texture, effect);
      newMaterial.backFaceCulling = false;

      // Apply to mesh
      plane.mesh.material = newMaterial;

      // Update plane reference
      plane.material = newMaterial;

      // Dispose old material after assignment
      oldMaterial.dispose();

      console.log('[ShaderAdapter] Material updated for:', id, 'ready:', newMaterial.isReady());
    });

    console.log('[ShaderAdapter] Shader effect update complete. Current effect:', this.currentEffect);
  }

  /**
   * Create shader material based on effect type
   */
  private createShaderMaterial(id: string, texture: Texture, effect: ShaderEffect): ShaderMaterial {
    if (!this.scene) throw new Error('Scene not initialized');

    const shaderName = `${id}-${effect}`;

    console.log('[ShaderAdapter] Creating shader material:', { id, effect, shaderName });

    // Register shaders in ShadersStore first
    this.setShaderCode(shaderName, effect);

    const material = new ShaderMaterial(
      shaderName,
      this.scene,
      {
        vertex: shaderName,
        fragment: shaderName
      },
      {
        attributes: ['position', 'uv'],
        uniforms: ['worldViewProjection', 'time'],
        samplers: ['textureSampler']
      }
    );

    // Set texture
    material.setTexture('textureSampler', texture);

    // Set initial time for animated shaders
    if (effect === 'wave' || effect === 'chromatic') {
      material.setFloat('time', this.time);
    }

    // Check for shader compilation errors
    material.onError = (effect, errors) => {
      console.error('[ShaderAdapter] Shader compilation error:', { effect, errors });
    };

    material.onCompiled = (effect) => {
      console.log('[ShaderAdapter] Shader compiled successfully:', effect);
    };

    console.log('[ShaderAdapter] Shader material created');

    return material;
  }

  /**
   * Set GLSL shader code based on effect using ShadersStore
   */
  private setShaderCode(shaderName: string, effect: ShaderEffect): void {
    const vertexShader = `
      precision highp float;

      attribute vec3 position;
      attribute vec2 uv;

      uniform mat4 worldViewProjection;

      varying vec2 vUV;

      void main(void) {
        gl_Position = worldViewProjection * vec4(position, 1.0);
        vUV = uv;
      }
    `;

    let fragmentShader = '';

    switch (effect) {
      case 'wave':
        fragmentShader = `
          precision highp float;

          varying vec2 vUV;
          uniform sampler2D textureSampler;
          uniform float time;

          void main(void) {
            vec2 uv = vUV;
            float wave = sin(uv.y * 10.0 + time * 2.0) * 0.02;
            uv.x += wave;
            gl_FragColor = texture2D(textureSampler, uv);
          }
        `;
        break;

      case 'pixelate':
        fragmentShader = `
          precision highp float;

          varying vec2 vUV;
          uniform sampler2D textureSampler;

          void main(void) {
            vec2 uv = vUV;
            float pixelSize = 0.05;
            vec2 pixelated = floor(uv / pixelSize) * pixelSize;
            gl_FragColor = texture2D(textureSampler, pixelated);
          }
        `;
        break;

      case 'chromatic':
        fragmentShader = `
          precision highp float;

          varying vec2 vUV;
          uniform sampler2D textureSampler;
          uniform float time;

          void main(void) {
            vec2 uv = vUV;
            float offset = 0.003 + sin(time) * 0.002;

            float r = texture2D(textureSampler, uv + vec2(offset, 0.0)).r;
            float g = texture2D(textureSampler, uv).g;
            float b = texture2D(textureSampler, uv - vec2(offset, 0.0)).b;

            gl_FragColor = vec4(r, g, b, 1.0);
          }
        `;
        break;

      default: // 'none'
        fragmentShader = `
          precision highp float;

          varying vec2 vUV;
          uniform sampler2D textureSampler;

          void main(void) {
            gl_FragColor = texture2D(textureSampler, vUV);
          }
        `;
    }

    // Register shaders in ShadersStore
    Effect.ShadersStore[`${shaderName}VertexShader`] = vertexShader;
    Effect.ShadersStore[`${shaderName}FragmentShader`] = fragmentShader;
  }

  /**
   * Resize canvas
   */
  resize(): void {
    if (!this.engine) return;

    // Update canvas dimensions
    const canvas = this.engine.getRenderingCanvas();
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    this.engine.resize();
    this.updateCameraViewport();
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.planes.forEach((plane) => {
      plane.mesh.dispose();
      plane.material.dispose();
      plane.texture.dispose();
    });
    this.planes.clear();

    this.scene?.dispose();
    this.engine?.dispose();

    this.camera = null;
    this.scene = null;
    this.engine = null;
  }
}
