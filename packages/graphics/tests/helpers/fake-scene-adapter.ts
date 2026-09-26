/**
 * @file fake-scene-adapter.ts
 * Deterministic spy adapter for testing Scene lifecycle and sync under jsdom.
 */

import type {
  CameraConfig,
  LightConfig,
  MeshConfig,
  RendererCapabilities
} from '../../src/core/types.js';
import type { GraphicsAdapter } from '../../src/core/scene-sync.js';

export interface MethodCall {
  method: string;
  args: unknown[];
  time: number;
}

export class FakeSceneAdapter implements GraphicsAdapter {
  calls: MethodCall[] = [];
  isInitialized = false;
  isDisposed = false;
  canvas: HTMLCanvasElement | null = null;
  camera: CameraConfig | null = null;
  meshes = new Map<string, MeshConfig>();
  lights = new Map<string, LightConfig>();
  backgroundColor: string | null = null;

  initDelayMs = 0;
  shouldFailInit = false;
  initErrorMessage = 'Fake initialization failed';

  private record(method: string, ...args: unknown[]) {
    this.calls.push({ method, args, time: Date.now() });
  }

  callsTo(method: string): MethodCall[] {
    return this.calls.filter((c) => c.method === method);
  }

  async initialize(
    canvas: HTMLCanvasElement
  ): Promise<{ renderer: 'webgl'; capabilities: RendererCapabilities }> {
    this.record('initialize', canvas);
    this.canvas = canvas;

    if (this.initDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.initDelayMs));
    }

    if (this.shouldFailInit) {
      throw new Error(this.initErrorMessage);
    }

    this.isInitialized = true;
    return {
      renderer: 'webgl',
      capabilities: {
        supportsWebGL: true,
        maxTextureSize: 4096,
        maxVertexAttributes: 16
      }
    };
  }

  dispose(): void {
    this.record('dispose');
    this.isDisposed = true;
    this.isInitialized = false;
  }

  updateCamera(config: CameraConfig): void {
    this.record('updateCamera', config);
    this.camera = config;
  }

  addMesh(config: MeshConfig): void {
    this.record('addMesh', config);
    this.meshes.set(config.id, config);
  }

  updateMesh(id: string, updates: Partial<MeshConfig>): void {
    this.record('updateMesh', id, updates);
    const existing = this.meshes.get(id);
    if (existing) {
      this.meshes.set(id, { ...existing, ...updates });
    }
  }

  removeMesh(id: string): void {
    this.record('removeMesh', id);
    this.meshes.delete(id);
  }

  addLight(config: LightConfig): void {
    this.record('addLight', config);
    this.lights.set(config.id, config);
  }

  updateLight(id: string, config: LightConfig): void {
    this.record('updateLight', id, config);
    this.lights.set(id, config);
  }

  removeLight(id: string): void {
    this.record('removeLight', id);
    this.lights.delete(id);
  }

  setBackgroundColor(color: string): void {
    this.record('setBackgroundColor', color);
    this.backgroundColor = color;
  }
}
