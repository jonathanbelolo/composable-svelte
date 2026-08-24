/**
 * `roughness` reaches the material.
 *
 * It was declared on `MaterialConfig`, documented across an entire "PBR
 * Workflow" section with ~20 examples, passed on five meshes by the styleguide's
 * `SceneDemo`, and read by nothing — `applyMaterial` applied colour, metallic,
 * emissive, alpha and wireframe under a comment reading "Set metallic/roughness".
 *
 * These cover the *mapping*. What Babylon does with the resulting number is not
 * covered by anything in this package: the adapter needs a WebGL context and
 * these tests run under jsdom.
 */

import { describe, it, expect } from 'vitest';
import {
	DEFAULT_ORTHO_SIZE,
	DEFAULT_SPECULAR_POWER,
	orthographicBounds,
	specularPowerFromRoughness
} from '../src/core/babylon-mapping';

describe('specularPowerFromRoughness', () => {
	it('is inverted — rougher means a blurrier highlight', () => {
		const smooth = specularPowerFromRoughness(0.1);
		const rough = specularPowerFromRoughness(0.9);

		expect(smooth, 'a smooth material should have the sharper highlight').toBeGreaterThan(rough);
	});

	it('puts mid-roughness near Babylon default, so it is not a surprise', () => {
		// A material that sets roughness to the middle should look like one that
		// sets nothing at all.
		expect(specularPowerFromRoughness(0.5)).toBe(DEFAULT_SPECULAR_POWER);
	});

	it('is monotonic across the range', () => {
		const samples = [0, 0.25, 0.5, 0.75, 1].map(specularPowerFromRoughness);
		const descending = [...samples].sort((a, b) => b - a);

		expect(samples).toEqual(descending);
		expect(new Set(samples).size, 'some inputs collapse to the same output').toBe(samples.length);
	});

	it('clamps out-of-range input rather than inverting the highlight', () => {
		expect(specularPowerFromRoughness(-1)).toBe(specularPowerFromRoughness(0));
		expect(specularPowerFromRoughness(2)).toBe(specularPowerFromRoughness(1));
	});

	it('stays positive at maximum roughness', () => {
		// A specularPower of 0 or below is not a rough surface — it is undefined
		// behaviour in the shader.
		expect(specularPowerFromRoughness(1)).toBeGreaterThan(0);
	});
});

describe('orthographicBounds', () => {
	it('makes the half-height the orthoSize, and the half-width follow the aspect', () => {
		const bounds = orthographicBounds(5, 2);

		expect(bounds.top).toBe(5);
		expect(bounds.bottom).toBe(-5);
		expect(bounds.right, 'a wide viewport should show more world horizontally').toBe(10);
		expect(bounds.left).toBe(-10);
	});

	it('is square when the viewport is', () => {
		const bounds = orthographicBounds(3, 1);
		expect(bounds.right - bounds.left).toBe(bounds.top - bounds.bottom);
	});

	it('survives a degenerate aspect rather than collapsing the frustum', () => {
		// A zero-height canvas gives 0 or Infinity, and either would collapse or
		// explode the view.
		for (const aspect of [0, Number.POSITIVE_INFINITY, Number.NaN, -1]) {
			const bounds = orthographicBounds(4, aspect);
			expect(Number.isFinite(bounds.left), `aspect ${aspect} produced ${bounds.left}`).toBe(true);
			expect(bounds.right).toBeGreaterThan(bounds.left);
			expect(bounds.top).toBeGreaterThan(bounds.bottom);
		}
	});

	it('frames roughly what the perspective camera does at its default radius', () => {
		// So switching `type` reframes rather than jumps.
		const bounds = orthographicBounds(DEFAULT_ORTHO_SIZE, 16 / 9);
		expect(bounds.top - bounds.bottom).toBe(10);
	});
});

