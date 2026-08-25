/**
 * Custom geometry validation.
 *
 * Lives in `core` rather than the adapter because the reducer is what has to
 * refuse it. The adapter's `createGeometry` returned `null` for `custom` behind
 * a TODO and `addMesh` bailed cleanly — but the reducer had already admitted
 * the mesh into `state.meshes`, so state and scene diverged permanently and
 * every later `updateMesh` for that id was a silent no-op against a renderer
 * that had never heard of it.
 *
 * Guarding in the reducer matches what it already does for a duplicate id:
 * warn, ignore, and keep the state it can honour.
 */

import type { GeometryConfig } from './types.js';

/**
 * Why a custom geometry cannot be built, or `null` if it can.
 *
 * Babylon does not validate these: bad indices produce garbage geometry or
 * throw from inside the engine, and a mismatched `uvs` length silently
 * mistextures every face.
 */
export function customGeometryProblem(config: GeometryConfig): string | null {
	if (config.type !== 'custom') return null;

	const { vertices, indices, normals, uvs } = config;

	if (vertices.length === 0) return 'vertices is empty';
	if (vertices.length % 3 !== 0) {
		return `vertices has ${vertices.length} entries, which is not a whole number of xyz triples`;
	}

	const vertexCount = vertices.length / 3;

	if (indices.length === 0) return 'indices is empty';
	if (indices.length % 3 !== 0) {
		return `indices has ${indices.length} entries, which is not a whole number of triangles`;
	}

	for (const index of indices) {
		if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
			return `indices contains ${index}, which is not a vertex in 0..${vertexCount - 1}`;
		}
	}

	if (normals && normals.length !== vertices.length) {
		return `normals has ${normals.length} entries but vertices has ${vertices.length}`;
	}

	if (uvs && uvs.length !== vertexCount * 2) {
		return `uvs has ${uvs.length} entries but ${vertexCount} vertices need ${vertexCount * 2}`;
	}

	return null;
}
