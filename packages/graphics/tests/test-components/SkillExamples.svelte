<script lang="ts">
	/**
	 * The component examples from
	 * `.claude/skills/composable-svelte-graphics/SKILL.md`, verbatim.
	 *
	 * `doc-typecheck` compiles the `<script>` body of a svelte fence and says so —
	 * markup expressions are out of its scope. This file is the markup half, and
	 * it is typechecked because `svelte-check` reads every `.svelte` under
	 * `tests`. `packages/core/tests/repo/skill-examples.test.ts` fails if a fence
	 * in the skill stops appearing here, so this is a copy that is compared.
	 *
	 * Twelve of the skill's fences are not here. They are fences the skill
	 * labels `svelte` that a clean component cannot hold: script text with no
	 * `<script>` tag, literal `...` placeholders in place of required props, JS
	 * comments as markup, and "Future API" props no component declares. Each is
	 * registered in the guard's NOT_COMPILED with its finding (DA-X2), a
	 * documentation defect recorded against the skill, not a fixture choice. An
	 * earlier form of this file carried them inside HTML comments, which the
	 * guard strips, so they pinned nothing.
	 */
	import { Camera, Light, Mesh, Scene, WebGLOverlay } from '../../src/index.js';
	import type { Store } from '@composable-svelte/core';
	import type { GraphicsAction, GraphicsState } from '../../src/core/types.js';

	let { store }: { store: Store<GraphicsState, GraphicsAction> } = $props();

	// COMPLETE EXAMPLE
	let rotation = $state(0);

	function rotateShapes() {
		rotation += Math.PI / 4;
	}

	// ADDITIONAL EXPORTS › WebGLOverlay
	let overlay: WebGLOverlay | null = $state(null);
	let hero: HTMLImageElement | null = $state(null);

	function applyEffect(): void {
		if (!overlay || !hero) return;
		overlay.registerElement({
			id: 'hero',
			domElement: hero,
			shader: 'ripple-gentle'
		});
	}
</script>

<!-- SCENE COMPONENT › Usage -->
<Scene {store} height="500px">
  <!-- Children render here -->
</Scene>

<!-- CAMERA COMPONENT › Usage -->
<!-- Perspective camera (default) -->
<Camera
  {store}
  position={[0, 4, 12]}
  lookAt={[0, 0, 0]}
  fov={45}
/>

<!-- Orthographic camera -->
<Camera
  {store}
  type="orthographic"
  orthoSize={8}
  position={[0, 10, 0]}
  lookAt={[0, 0, 0]}
/>

<!-- LIGHT COMPONENT › every light has an id -->
<Light {store} id="key" type="directional" direction={[5, 10, 7]} intensity={1.2} />

<!-- LIGHT COMPONENT › Ambient Light -->
<Light {store} type="ambient" intensity={0.4} color="#ffffff" />

<!-- LIGHT COMPONENT › Directional Light -->
<Light {store} type="directional" direction={[5, 10, 7.5]} intensity={1.2} />

<!-- LIGHT COMPONENT › Point Light -->
<Light {store} type="point" position={[0, 3, 0]} intensity={1.5} radius={10} />

<!-- LIGHT COMPONENT › Spot Light -->
<Light
  {store}
  type="spot"
  position={[0, 5, 0]}
  direction={[0, -1, 0]}
  angle={Math.PI / 6}
  intensity={2.0}
/>

<!-- LIGHT COMPONENT › Common Lighting Setups -->
<!-- Three-point lighting (photography standard) -->
<Light {store} type="ambient" intensity={0.3} />
<Light {store} type="directional" direction={[5, 5, 5]} intensity={1.0} />     <!-- Key -->
<Light {store} type="directional" direction={[-3, 3, -3]} intensity={0.5} />   <!-- Fill -->
<Light {store} type="directional" direction={[0, 2, -5]} intensity={0.3} />    <!-- Back -->

<!-- Outdoor scene (sun + ambient) -->
<Light {store} type="ambient" intensity={0.4} color="#87ceeb" />
<Light {store} type="directional" direction={[10, 20, 10]} intensity={1.5} color="#fff8dc" />

<!-- Indoor scene (ambient + point lights) -->
<Light {store} type="ambient" intensity={0.2} />
<Light {store} type="point" position={[0, 3, 0]} intensity={1.0} radius={5} />
<Light {store} type="point" position={[5, 2, 5]} intensity={0.8} radius={4} />

<!-- MESH COMPONENT › Usage -->
<Mesh
  {store}
  id="my-cube"
  geometry={{ type: 'box', size: 1.5 }}
  material={{ color: '#ff6b6b', metallic: 0.7, roughness: 0.3 }}
  position={[0, 1, 0]}
  rotation={[0, Math.PI / 4, 0]}
  scale={[1, 1, 1]}
/>

<!-- GEOMETRY TYPES › Box -->
<Mesh
  {store}
  id="cube"
  geometry={{ type: 'box', size: 1.5 }}
  material={{ color: '#ff6b6b' }}
  position={[0, 1, 0]}
/>

<!-- GEOMETRY TYPES › Sphere -->
<Mesh
  {store}
  id="ball"
  geometry={{ type: 'sphere', radius: 0.8, segments: 32 }}
  material={{ color: '#4ecdc4', metallic: 0.8, roughness: 0.2 }}
  position={[0, 1, 0]}
/>

<!-- GEOMETRY TYPES › Cylinder -->
<Mesh
  {store}
  id="pillar"
  geometry={{ type: 'cylinder', height: 2, diameter: 1 }}
  material={{ color: '#95e1d3' }}
  position={[0, 1, 0]}
/>

<!-- GEOMETRY TYPES › Torus -->
<Mesh
  {store}
  id="ring"
  geometry={{ type: 'torus', diameter: 1.5, thickness: 0.3, segments: 32 }}
  material={{ color: '#f38181', metallic: 0.9, roughness: 0.1 }}
  position={[0, 1, 0]}
/>

<!-- GEOMETRY TYPES › Plane -->
<!-- Ground plane (rotated to horizontal) -->
<Mesh
  {store}
  id="ground"
  geometry={{ type: 'plane', width: 12, height: 12 }}
  material={{ color: '#aa96da', metallic: 0.3, roughness: 0.7 }}
  position={[0, 0, 0]}
  rotation={[Math.PI / 2, 0, 0]}
/>

<!-- GEOMETRY TYPES › Custom -->
<!-- A single triangle in the XY plane -->
<Mesh
  {store}
  id="tri"
  geometry={{
    type: 'custom',
    vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 2],
    uvs: [0, 0, 1, 0, 0, 1]
  }}
  material={{ color: '#ff6b6b' }}
  position={[0, 0, 0]}
/>

<!-- COMPLETE EXAMPLE (its <script> is stripped by the guard) -->
<!-- Renderer info -->
<div>
  {#if $store.renderer.isInitialized}
    <span>Renderer: {$store.renderer.activeRenderer?.toUpperCase()}</span>
    <span>Max Texture: {$store.renderer.capabilities.maxTextureSize}px</span>
  {:else if $store.renderer.error}
    <span>Error: {$store.renderer.error}</span>
  {:else}
    <span>Initializing...</span>
  {/if}
</div>

<!-- 3D Scene -->
<Scene {store} height="500px">
  <Camera {store} position={[0, 4, 12]} lookAt={[0, 0, 0]} fov={45} />
  <Light {store} type="ambient" intensity={0.4} color="#ffffff" />
  <Light {store} type="directional" direction={[5, 10, 7.5]} intensity={1.2} color="#ffffff" />

  <!-- Row 1: Box, Sphere, Cylinder -->
  <Mesh
    {store}
    id="box"
    geometry={{ type: 'box', size: 1.5 }}
    material={{ color: '#ff6b6b', metallic: 0.7, roughness: 0.3 }}
    position={[-4, 1.5, 0]}
    rotation={[0, rotation, 0]}
  />

  <Mesh
    {store}
    id="sphere"
    geometry={{ type: 'sphere', radius: 0.8, segments: 32 }}
    material={{ color: '#4ecdc4', metallic: 0.8, roughness: 0.2 }}
    position={[-1.5, 1.5, 0]}
    rotation={[0, rotation, 0]}
  />

  <Mesh
    {store}
    id="cylinder"
    geometry={{ type: 'cylinder', height: 2, diameter: 1 }}
    material={{ color: '#95e1d3', metallic: 0.6, roughness: 0.4 }}
    position={[1, 1.5, 0]}
    rotation={[0, rotation, 0]}
  />

  <!-- Row 2: Torus, Plane -->
  <Mesh
    {store}
    id="torus"
    geometry={{ type: 'torus', diameter: 1.5, thickness: 0.3, segments: 32 }}
    material={{ color: '#f38181', metallic: 0.9, roughness: 0.1 }}
    position={[3.5, 1.5, 0]}
    rotation={[0, rotation, 0]}
  />

  <!-- Ground plane -->
  <Mesh
    {store}
    id="plane"
    geometry={{ type: 'plane', width: 12, height: 12 }}
    material={{ color: '#aa96da', metallic: 0.3, roughness: 0.7 }}
    position={[0, -0.5, 0]}
    rotation={[Math.PI / 2, 0, 0]}
  />
</Scene>

<button onclick={rotateShapes}>Rotate All Shapes 45°</button>

<!--
	PERFORMANCE › Draw Calls › Bad. Pinned, not compiled: same as above, and
	`items` is declared nowhere.

// 1000 meshes = 1000 draw calls (very slow!)
{#each items as item}
  <Mesh id={item.id} ... />
{/each}
-->

<!--
	PERFORMANCE › Update Frequency › Good. Pinned, not compiled: script with no
	`<script>` tag, and `...` in place of the required props.

// Update rotation only when button clicked
let rotation = $state(0);
function rotate() { rotation += Math.PI / 4; }

<Mesh rotation={[0, rotation, 0]} ... />
-->

<!--
	PERFORMANCE › Update Frequency › Bad. Pinned, not compiled: same as above.

// Updates every frame (60 FPS) - expensive!
let time = $state(0);
setInterval(() => { time += 0.01; }, 16);

<Mesh rotation={[0, time, 0]} ... />
-->

<!--
	COMMON PATTERNS › Rotation Animation. Pinned, not compiled: script with no
	`<script>` tag, and `...` in place of the required props.

let rotation = $state(0);

function rotateObject() {
  rotation += Math.PI / 4; // 45 degrees
}

<Mesh rotation={[0, rotation, 0]} ... />
<button onclick={rotateObject}>Rotate 45°</button>
-->

<!--
	COMMON PATTERNS › Camera Controls. Pinned, not compiled: the markup itself is
	sound, but the script above it has no `<script>` tag, so the guard cannot
	separate the two.

let cameraDistance = $state(12);

function zoomIn() {
  cameraDistance = Math.max(5, cameraDistance - 2);
}

function zoomOut() {
  cameraDistance = Math.min(20, cameraDistance + 2);
}

<Camera {store} position={[0, 4, cameraDistance]} lookAt={[0, 0, 0]} />
<button onclick={zoomIn}>Zoom In</button>
<button onclick={zoomOut}>Zoom Out</button>
-->

<!--
	COMMON PATTERNS › Dynamic Lighting. Pinned, not compiled: same as Camera
	Controls.

let lightIntensity = $state(1.0);

function adjustBrightness(delta: number) {
  lightIntensity = Math.max(0, Math.min(2, lightIntensity + delta));
}

<Light {store} type="directional" direction={[5, 10, 7.5]} intensity={lightIntensity} />
<button onclick={() => adjustBrightness(0.2)}>Brighter</button>
<button onclick={() => adjustBrightness(-0.2)}>Dimmer</button>
-->

<!--
	COMMON PATTERNS › Toggle Visibility. Pinned, not compiled: script with no
	`<script>` tag, JS comments in markup, and `...` in place of the required
	props.

let showObject = $state(true);

// Option 1: Conditional rendering
{#if showObject}
  <Mesh id="object" ... />
{/if}

// Option 2: Visible prop
<Mesh id="object" visible={showObject} ... />

<button onclick={() => showObject = !showObject}>
  {showObject ? 'Hide' : 'Show'}
</button>
-->

<!--
	FUTURE FEATURES › Textures. Pinned, not compiled: `albedoTexture` and
	`normalMap` are not fields of `MaterialConfig`, and `{store}` is missing.

// Future API
<Mesh
  id="textured"
  geometry={{ type: 'box', size: 1 }}
  material={{
    color: '#ffffff',
    albedoTexture: '/textures/wood.jpg',
    normalMap: '/textures/wood_normal.jpg'
  }}
  position={[0, 0, 0]}
/>
-->

<!--
	FUTURE FEATURES › A declarative `animation` prop. Pinned, not compiled:
	`<Mesh>` declares no `animation` prop.

// Future API
<Mesh
  {store}
  id="animated"
  geometry={{ type: 'box', size: 1 }}
  material={{ color: '#ff6b6b' }}
  position={[0, 0, 0]}
  animation={{
    property: 'rotation',
    from: [0, 0, 0],
    to: [0, Math.PI * 2, 0],
    duration: 2000,
    loop: true,
    easing: 'linear'
  }}
/>
-->

<!--
	FUTURE FEATURES › Post-Processing. Pinned, not compiled: `<Scene>` declares
	no `postProcessing` prop, and `...` stands in for the children.

// Future API
<Scene {store} postProcessing={{
  bloom: { enabled: true, intensity: 0.5 },
  ssao: { enabled: true, radius: 2 },
  fxaa: true
}}>
  ...
</Scene>
-->

<!-- ADDITIONAL EXPORTS › WebGLOverlay (its <script> is stripped by the guard) -->
<WebGLOverlay bind:this={overlay} />
<img bind:this={hero} src="/hero.jpg" alt="Hero" onload={applyEffect} />
