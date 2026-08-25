/**
 * @file babylon-adapter.ts
 * @description Babylon.js adapter over the WebGL engine
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
  VertexData,
  StandardMaterial,
  DirectionalLight,
  PointLight,
  SpotLight,
  type Nullable
} from '@babylonjs/core';

import { Camera as BabylonCamera } from '@babylonjs/core';
import {
  DEFAULT_ORTHO_SIZE,
  orthographicBounds,
  specularFor
} from '../core/babylon-mapping.js';
import type {
  RendererCapabilities,
  CameraConfig,
  MeshConfig,
  LightConfig,
  GeometryConfig,
  MaterialConfig,
  Vector3
} from '../core/types.js';
import { customGeometryProblem } from '../core/geometry.js';

/**
 * Babylon.js adapter - handles WebGL rendering
 */
export class BabylonAdapter {
  private engine: Nullable<Engine> = null;
  private scene: Nullable<Scene> = null;
  private camera: Nullable<ArcRotateCamera> = null;
  private meshes: Map<string, Mesh> = new Map();
  private lights: Map<string, HemisphericLight | DirectionalLight | PointLight | SpotLight> =
    new Map();

  /**
   * The last camera config, kept so a resize can recompute what depends on the
   * viewport. Orthographic bounds are derived from the aspect ratio, and were
   * computed once in `updateCamera` and never again — so resizing the window
   * with an orthographic camera stretched the view until the next camera
   * dispatch, which for a static scene is never.
   */
  private lastCamera: Nullable<CameraConfig> = null;

  /**
   * Kept so `dispose` can remove it. This was an anonymous arrow passed
   * straight to `addEventListener`, which made it unremovable: every mounted
   * `<Scene>` left a listener holding its engine alive for the life of the
   * page.
   */
  private onResize: Nullable<() => void> = null;

  /**
   * Initialize the Babylon WebGL engine.
   *
   * The `preferWebGPU` parameter is gone: it selected between two branches that
   * built the same `Engine`, so it only ever changed the label this returned.
   */
  async initialize(
    canvas: HTMLCanvasElement
  ): Promise<{ renderer: 'webgl'; capabilities: RendererCapabilities }> {
    // This package renders through Babylon's WebGL `Engine`, always.
    //
    // There used to be a "WebGPU first" branch here, and it constructed the
    // same `new Engine(canvas, …)` as the fallback — its own comment said
    // "Babylon.js automatically uses WebGPU when available". So detecting a
    // WebGPU adapter changed nothing about rendering; it only changed the
    // *label* this method returned, which the store surfaces as
    // `renderer.activeRenderer` and `SceneDemo` prints to users. It reported
    // `webgpu`, and `supportsWebGL: false`, while running WebGL.
    //
    // Real WebGPU is `WebGPUEngine` with its own async initialisation. That is
    // a feature nobody built, so it is recorded as a gap rather than claimed —
    // see the README and plans/hardening/README.md.
    if (!this.engine) {
      this.engine = new Engine(canvas, true, {
        adaptToDeviceRatio: true,
        antialias: true,
        preserveDrawingBuffer: true
      });
    }

    // `alreadyRunning` before `attachEngine`, which is what sets `this.scene`.
    // Calling `initialize` twice used to register a second `runRenderLoop` — a
    // fresh closure each time, so Babylon's identity-based dedupe did not catch
    // it — and the scene then rendered twice per frame, while `attachControl`
    // bound to a canvas the engine was not drawing to.
    const alreadyRunning = this.scene !== null;

    if (alreadyRunning) {
      // Warned, not silent. `attachEngine` says so in the exactly analogous
      // case, and saying nothing here traded a wrong binding for a quiet
      // nothing: the second call returned `{ renderer: 'webgl' }` while leaving
      // the engine drawing to the first canvas and never binding controls to
      // the second.
      console.warn(
        '[graphics] initialize: this adapter is already initialized; ' +
          'dispose() it before initializing with another canvas'
      );
    }

    this.attachEngine(this.engine);

    if (!alreadyRunning) {
      this.camera?.attachControl(canvas, true);
      this.engine.runRenderLoop(() => {
        this.scene?.render();
      });
    }

    // Get capabilities
    const capabilities: RendererCapabilities = {
      supportsWebGL: true,
      maxTextureSize: this.engine.getCaps().maxTextureSize,
      maxVertexAttributes: this.engine.getCaps().maxVertexAttribs
    };

    return {
      renderer: 'webgl',
      capabilities
    };
  }

  /**
   * Build the scene and default camera on an engine that already exists.
   *
   * Split out of `initialize` so a test can pass a `NullEngine` — Babylon's
   * headless backend, which builds real `Scene`, `Mesh`, `Material` and `Light`
   * objects and needs no GL context, so it runs under jsdom unchanged. Three
   * commits in this package's hardening sweep asserted that this class could
   * not be tested "because jsdom cannot give Babylon a WebGL context"; that was
   * never true, and it is why a per-frame material leak shipped.
   *
   * `initialize` keeps everything that genuinely needs the DOM: the canvas, the
   * control attachment, the render loop and the resize listener.
   */
  attachEngine(engine: Engine): Scene {
    // Idempotence rather than a second scene: this is public, `initialize`'s
    // `if (!this.engine)` implies a second call was anticipated, and building
    // another `Scene` on the same engine would also register a second resize
    // listener and orphan the first.
    //
    // Warned when the engine differs, because returning silently would hand
    // back a scene bound to the *old* engine — so viewport-derived state, such
    // as the orthographic bounds, would keep following an engine the caller
    // believes it replaced. Call `dispose()` first to re-attach.
    if (this.scene) {
      if (this.engine !== engine) {
        console.warn(
          '[graphics] attachEngine: this adapter is already attached; ' +
            'dispose() it before attaching a different engine'
        );
      }
      return this.scene;
    }

    this.engine = engine;

    this.scene = new Scene(engine);
    this.scene.clearColor = new Color4(0.1, 0.1, 0.1, 1);

    this.camera = new ArcRotateCamera(
      'camera',
      Math.PI / 2,
      Math.PI / 3,
      10,
      BabylonVector3.Zero(),
      this.scene
    );

    // Resize belongs to the engine, so it is set up alongside it. Named and
    // retained so `dispose` can remove it — it used to be an anonymous arrow
    // passed straight to `addEventListener`, which made it unremovable, so
    // every mounted `<Scene>` left a listener holding its engine alive for the
    // life of the page.
    this.onResize = () => {
      this.engine?.resize();
      // Only the orthographic bounds, which are the sole camera state derived
      // from the aspect ratio. Re-applying the whole config here snapped the
      // camera back to the store's `position` and `lookAt` — and `initialize`
      // hands this camera to the user via `attachControl`, so the store config
      // is a starting point, not a leash. `resize` fires continuously while a
      // window is dragged.
      if (this.lastCamera) this.applyOrthographicBounds(this.lastCamera);
    };
    window.addEventListener('resize', this.onResize);

    return this.scene;
  }

  /**
   * Update camera configuration
   */
  updateCamera(config: CameraConfig): void {
    if (!this.camera || !this.scene) return;

    this.lastCamera = config;

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

    // Projection mode. `config.type` was accepted, stored by the reducer, and
    // read by nothing: this method handled position, lookAt, fov, near and far,
    // and the camera was always the `ArcRotateCamera` built at init. So
    // `<Camera type="orthographic" />` — a copy-pasteable example in the skill
    // file — did nothing at all.
    //
    // `mode` is settable on a live camera, so no reconstruction is needed.
    if (config.type === 'orthographic') {
      this.camera.mode = BabylonCamera.ORTHOGRAPHIC_CAMERA;
      this.applyOrthographicBounds(config);
    } else {
      this.camera.mode = BabylonCamera.PERSPECTIVE_CAMERA;
    }
  }

  /**
   * The four frustum edges, which are the only camera state the viewport
   * decides. Separate from `updateCamera` so a resize can recompute them
   * without also re-applying position and target.
   */
  private applyOrthographicBounds(config: CameraConfig): void {
    if (!this.camera || config.type !== 'orthographic') return;

    const aspect = this.engine
      ? this.engine.getRenderWidth() / this.engine.getRenderHeight()
      : 1;
    const bounds = orthographicBounds(config.orthoSize ?? DEFAULT_ORTHO_SIZE, aspect);
    this.camera.orthoLeft = bounds.left;
    this.camera.orthoRight = bounds.right;
    this.camera.orthoTop = bounds.top;
    this.camera.orthoBottom = bounds.bottom;
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

    // Apply material. The `'color' in config.material` narrow this used to
    // carry existed only to exclude `CustomShaderMaterial`, which the union no
    // longer has — and which that narrow dropped without a warning.
    this.applyMaterial(mesh, config.material);

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
      // `disposeMaterialAndTextures` defaults to false, so the plain
      // `mesh.dispose()` this used to call left the material behind on
      // `scene.materials`. Every mesh here owns its material exclusively
      // (`${mesh.id}-material`, built in `applyMaterial`), so nothing else can
      // be holding it — and the scene sync rebuilds a mesh via remove + add
      // whenever its geometry changes, which made that a leak per rebuild.
      mesh.dispose(false, true);
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

    // Update material. The truthiness check stays — `updates` is a Partial —
    // but the `'color' in` half goes with `CustomShaderMaterial`.
    if (updates.material) {
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
          `ambient-${config.id}`,
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
          `directional-${config.id}`,
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
          `point-${config.id}`,
          new BabylonVector3(x, y, z),
          this.scene
        );
        light.intensity = config.intensity;
        // `?? Number.MAX_VALUE`, matching `updateLight`. This was
        // `if (config.radius)`, which skips 0 and leaves Babylon's infinite
        // default — so `radius: 0` lit everything when the light arrived by
        // `addLight` and nothing when the same config arrived by `updateLight`.
        light.range = config.radius ?? Number.MAX_VALUE;
        if (config.color) {
          light.diffuse = this.hexToColor3(config.color);
        }
        break;
      }

      case 'spot': {
        const [x, y, z] = config.position;
        const [dx, dy, dz] = config.direction;
        light = new SpotLight(
          `spot-${config.id}`,
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

    this.lights.set(config.id, light);
  }

  /**
   * Update a light in place, rebuilding only when its `type` changed.
   *
   * `LightConfig` is a discriminated union, so a change of `type` really is a
   * different Babylon class and there is no way round rebuilding it. Every
   * other change is a uniform write.
   *
   * This used to be an unconditional `removeLight` + `addLight`. That was
   * inert while `<Light>` had no `$effect` at all; the moment its props became
   * reactive it turned every intensity tweak into a dispose-and-reconstruct —
   * churning `scene.lights` and marking every affected mesh's submeshes
   * light-dirty, per frame, for a value that could have been assigned.
   */
  updateLight(id: string, config: LightConfig): void {
    const existing = this.lights.get(id);

    if (!existing || !this.matchesLightType(existing, config.type)) {
      this.removeLight(id);
      this.addLight(config);
      return;
    }

    existing.intensity = config.intensity;
    existing.diffuse = config.color ? this.hexToColor3(config.color) : new Color3(1, 1, 1);

    switch (config.type) {
      case 'ambient':
        break;
      case 'directional': {
        const [x, y, z] = config.position;
        (existing as DirectionalLight).direction = new BabylonVector3(x, y, z);
        break;
      }
      case 'point': {
        const [x, y, z] = config.position;
        (existing as PointLight).position = new BabylonVector3(x, y, z);
        (existing as PointLight).range = config.radius ?? Number.MAX_VALUE;
        break;
      }
      case 'spot': {
        const spot = existing as SpotLight;
        const [x, y, z] = config.position;
        const [dx, dy, dz] = config.direction;
        spot.position = new BabylonVector3(x, y, z);
        spot.direction = new BabylonVector3(dx, dy, dz);
        spot.angle = config.angle;
        break;
      }
    }
  }

  /**
   * Whether a live Babylon light is the class a given config `type` builds.
   *
   * A plain `instanceof` per case, because the four classes are siblings:
   * `SpotLight`, `DirectionalLight` and `PointLight` all extend `ShadowLight`
   * and `HemisphericLight` extends `Light`. Verified against the installed
   * 8.36.1 — `new SpotLight(...) instanceof PointLight` is `false`.
   *
   * This carried a `&& !(light instanceof SpotLight)` exclusion on the `point`
   * case, under a comment claiming `SpotLight extends PointLight` "so the order
   * matters". That hierarchy does not exist in this version, so the exclusion
   * could never be false for a spot light and the ordering was irrelevant. It
   * was dead, and it survived a mutation test precisely because it was.
   */
  private matchesLightType(
    light: HemisphericLight | DirectionalLight | PointLight | SpotLight,
    type: LightConfig['type']
  ): boolean {
    switch (type) {
      case 'ambient':
        return light instanceof HemisphericLight;
      case 'directional':
        return light instanceof DirectionalLight;
      case 'spot':
        return light instanceof SpotLight;
      case 'point':
        return light instanceof PointLight;
    }
  }

  /**
   * Remove light from scene
   */
  removeLight(id: string): void {
    const light = this.lights.get(id);
    if (light) {
      light.dispose();
      this.lights.delete(id);
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
    if (this.onResize) {
      window.removeEventListener('resize', this.onResize);
      this.onResize = null;
    }

    // `disposeMaterialAndTextures`, for the reason `removeMesh` gives.
    this.meshes.forEach((mesh) => mesh.dispose(false, true));
    this.meshes.clear();

    // Dispose lights
    this.lights.forEach((light) => light.dispose());
    this.lights.clear();

    // Dispose scene and engine
    this.scene?.dispose();
    this.engine?.dispose();

    this.camera = null;
    this.scene = null;
    this.engine = null;
    this.lastCamera = null;
    this.warnedColors.clear();
    this.warnedColorCapReached = false;
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

      case 'torus': {
        return MeshBuilder.CreateTorus(
          id,
          { diameter: config.diameter, thickness: config.thickness, tessellation: config.segments || 32 },
          this.scene
        );
      }

      case 'custom': {
        // The reducer refuses geometry it cannot build, so this is belt and
        // braces for anything constructed against the adapter directly.
        const problem = customGeometryProblem(config);
        if (problem) {
          console.warn(`[BabylonAdapter] Custom geometry for '${id}' is invalid: ${problem}`);
          return null;
        }

        const mesh = new Mesh(id, this.scene);
        const data = new VertexData();
        // Babylon calls them `positions`; the config calls them `vertices`.
        data.positions = config.vertices;
        data.indices = config.indices;

        if (config.normals) {
          data.normals = config.normals;
        } else {
          // Without normals every face is lit flat by whatever the shader
          // defaults to, which reads as an untextured silhouette.
          const normals: number[] = [];
          VertexData.ComputeNormals(config.vertices, config.indices, normals);
          data.normals = normals;
        }

        if (config.uvs) data.uvs = config.uvs;

        data.applyToMesh(mesh);
        return mesh;
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

    // Reuse the mesh's own material rather than building a new one.
    //
    // This used to be `new StandardMaterial(...)` on every call, with the
    // outgoing material never disposed — and Babylon keeps every material on
    // `scene.materials` until the scene dies. `updateMesh` calls this whenever
    // `updates.material` is present, and `MeshConfig.material` is *required*,
    // so the whole config arriving each frame from an animation made it present
    // every frame: 60 leaked materials a second, each with its own uniform
    // buffer. Harmless while animations reached nothing; live the moment they
    // worked.
    const existing = mesh.material;
    const material =
      existing instanceof StandardMaterial
        ? existing
        : new StandardMaterial(`${mesh.id}-material`, this.scene);

    material.diffuseColor = this.hexToColor3(config.color);

    // Every field is assigned unconditionally, including the absent ones. With
    // a fresh material each time, omitting a field meant "Babylon's default";
    // reusing one, it would mean "whatever it was last time" — so a mesh that
    // stopped setting `wireframe` would stay wireframed forever. Assigning the
    // default explicitly keeps the material a pure function of the config.
    const specular = specularFor(material.diffuseColor.asArray() as [number, number, number], config.metallic, config.roughness);
    material.specularColor = new Color3(...specular.color);
    material.specularPower = specular.power;

    material.emissiveColor = config.emissive
      ? this.hexToColor3(config.emissive)
      : new Color3(0, 0, 0);
    material.alpha = config.alpha ?? 1;
    material.wireframe = config.wireframe ?? false;

    if (material !== existing) {
      existing?.dispose();
      mesh.material = material;
    }
  }

  /**
   * Convert hex color string to Babylon.js Color3
   */
  /**
   * Colour strings already warned about.
   *
   * `applyMaterial` runs on every `updateMesh`, and `syncScene` passes the whole
   * `MeshConfig` — whose `material` is required — so an animated mesh reaches
   * this per frame. Warning unconditionally turned one bad colour into 60
   * console lines a second, which buries the very message it exists to deliver.
   */
  private warnedColors: Set<string> = new Set();

  /**
   * Whether the cap notice has been printed.
   *
   * A separate flag rather than a sentinel inside `warnedColors`. The sentinel
   * was `'__capped__'`, which is a colour string a consumer can pass: doing so
   * kept `size` pinned at the cap — `Set.add` of an existing member does not
   * grow it — so the "suppressing further warnings" line fired once per
   * distinct bad colour, which is the unbounded spam the cap exists to stop.
   */
  private warnedColorCapReached = false;

  /**
   * Cap on the above, because the set is keyed by the bad value itself.
   *
   * The path this warning exists for is the animated one — and that is exactly
   * where the colour *varies*: a per-frame `hsl(...)` string is a new key every
   * frame, so neither the set nor the console output was bounded. A leak fix
   * that leaked. Past the cap it stops recording and stops warning, once.
   */
  private static readonly MAX_WARNED_COLORS = 20;

  private hexToColor3(hex: string): Color3 {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    const [, r, g, b] = result ?? [];
    if (!r || !g || !b) {
      // Warned rather than silent. Only 6-digit hex parses — `'red'`,
      // `'rgb(255,0,0)'` and `'#f00'` all land here — and falling back to white
      // without a word is indistinguishable from a colour that simply did not
      // apply, which is exactly the kind of quiet nothing this package has been
      // swept for. The docs said "hex or CSS color"; the parser never agreed.
      if (!this.warnedColors.has(hex)) {
        if (this.warnedColors.size < BabylonAdapter.MAX_WARNED_COLORS) {
          this.warnedColors.add(hex);
          console.warn(`[graphics] "${hex}" is not a 6-digit hex colour; using white`);
        } else if (!this.warnedColorCapReached) {
          this.warnedColorCapReached = true;
          console.warn(
            `[graphics] more than ${BabylonAdapter.MAX_WARNED_COLORS} unparseable colours; ` +
              'suppressing further warnings'
          );
        }
      }
      return new Color3(1, 1, 1);
    }

    return new Color3(parseInt(r, 16) / 255, parseInt(g, 16) / 255, parseInt(b, 16) / 255);
  }
}
