<script lang="ts">
	import Scene from '../../src/components/Scene.svelte';
	import Camera from '../../src/components/Camera.svelte';
	import Light from '../../src/components/Light.svelte';
	import Mesh from '../../src/components/Mesh.svelte';
	import type { Store } from '@composable-svelte/core';
	import type {
		GraphicsState,
		GraphicsAction,
		CameraType,
		GeometryConfig,
		MaterialConfig,
		Vector3
	} from '../../src/core/types.js';
	import type { Snippet } from 'svelte';

	/**
	 * A consumer forwarding its own `$props()` straight through.
	 *
	 * Nothing renders this — it exists to be **typechecked**. Under
	 * `exactOptionalPropertyTypes` an optional prop read from `$props()` is
	 * `T | undefined`, which cannot land on a bare `T?`, so every optional prop
	 * these components declare has to say `| undefined` or they cannot be
	 * wrapped.
	 *
	 * **This file's own props are deliberately bare.** That is the mechanism:
	 * they simulate the naïve consumer whose `$props()` yields `T | undefined`.
	 * A sweep that "fixed" them here would neutralise the fixture and nothing
	 * would go red — which is why every `tests` directory is out of its scope.
	 */
	let {
		store,
		width,
		height,
		children,
		type,
		position,
		lookAt,
		fov,
		orthoSize,
		lightId,
		intensity,
		color,
		meshId,
		geometry,
		material,
		meshPosition,
		rotation,
		visible
	}: {
		store: Store<GraphicsState, GraphicsAction>;
		width?: string | number;
		height?: string | number;
		children?: Snippet;
		type?: CameraType;
		position: Vector3;
		lookAt: Vector3;
		fov?: number;
		orthoSize?: number;
		lightId?: string;
		intensity: number;
		color?: string;
		meshId: string;
		geometry: GeometryConfig;
		material: MaterialConfig;
		meshPosition: Vector3;
		rotation?: Vector3;
		visible?: boolean;
	} = $props();
</script>

<Scene {store} {width} {height} {children} />
<Camera {store} {type} {position} {lookAt} {fov} {orthoSize} />
<Light {store} id={lightId} type="point" {position} {intensity} {color} />
<Mesh {store} id={meshId} {geometry} {material} position={meshPosition} {rotation} {visible} />
