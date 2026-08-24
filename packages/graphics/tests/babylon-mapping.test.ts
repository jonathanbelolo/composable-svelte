/**
 * `roughness` reaches the material.
 *
 * It was declared on `MaterialConfig`, documented across an entire "PBR
 * Workflow" section with ~20 examples, passed on five meshes by the styleguide's
 * `SceneDemo`, and read by nothing — `applyMaterial` applied colour, metallic,
 * emissive, alpha and wireframe under a comment reading "Set metallic/roughness".
 *
 * These cover the *mapping* arithmetic. What Babylon does with the resulting
 * numbers is covered too, in `tests/babylon-adapter.test.ts` — this header used
 * to say it could not be, "the adapter needs a WebGL context and these tests
 * run under jsdom". `NullEngine` needs no context, and that assumption is why a
 * per-frame material leak and an inert `roughness` both shipped.
 */

import { describe, it, expect } from 'vitest';
import {
	DEFAULT_ORTHO_SIZE,
	DEFAULT_SPECULAR_POWER,
	orthographicBounds,
	specularFor,
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

	it('scales the framed area with orthoSize', () => {
		// This test used to be called 'frames roughly what the perspective camera
		// does at its default radius' and assert `top - bottom === 10` — which is
		// `2 × DEFAULT_ORTHO_SIZE` restated, already pinned above, and never
		// touched the perspective camera. The claim was also false: with the
		// shipped defaults the perspective camera frames 9.26 world units, not 10.
		const small = orthographicBounds(DEFAULT_ORTHO_SIZE, 16 / 9);
		const large = orthographicBounds(DEFAULT_ORTHO_SIZE * 2, 16 / 9);

		expect(large.top - large.bottom).toBeCloseTo((small.top - small.bottom) * 2);
		expect(large.right - large.left).toBeCloseTo((small.right - small.left) * 2);
	});
});


describe('specularFor', () => {
	const GREY: [number, number, number] = [0.5, 0.5, 0.5];

	it('leaves a non-metal a highlight for roughness to act on', () => {
		// The defect this exists for: `metallic` was mapped straight onto
		// `specularColor` as a grey, so `metallic: 0` gave black — and Babylon's
		// shader is `finalSpecular = specularBase * specularColor`, a multiply.
		// `specularPower` then could not change a single pixel, for the 7 of 13
		// documented presets that set `metallic: 0.0`.
		const { color } = specularFor(GREY, 0, 0.2);

		expect(Math.max(...color), 'a dielectric still reflects light').toBeGreaterThan(0);
	});

	it('tints the highlight toward the surface colour as metallic rises', () => {
		const red: [number, number, number] = [1, 0, 0];
		const dielectric = specularFor(red, 0, 0.3);
		const metal = specularFor(red, 1, 0.3);

		// A non-metal reflects white; a metal reflects its own colour.
		expect(dielectric.color[1]).toBeCloseTo(dielectric.color[0]);
		expect(metal.color[1]).toBeLessThan(metal.color[0]);
	});

	it('matches Babylon untouched when neither field is set', () => {
		// So omitting the fields is not itself a visual change.
		const { color, power } = specularFor(GREY, undefined, undefined);

		expect(color).toEqual([1, 1, 1]);
		expect(power).toBe(DEFAULT_SPECULAR_POWER);
	});

	it('dims a very rough surface so it reads as matte, not wet', () => {
		const matte = specularFor(GREY, 0, 1);
		const glossy = specularFor(GREY, 0, 0);

		expect(Math.max(...matte.color)).toBeLessThan(Math.max(...glossy.color));
		expect(Math.max(...matte.color), 'a surface with no specular reads as unlit').toBeGreaterThan(0);
	});

	it('separates every documented material preset from the others', () => {
		// The skill file's presets, which the previous mapping collapsed: all
		// seven with `metallic: 0.0` produced an identical black highlight.
		const presets: Array<[string, number, number]> = [
			['gold', 1.0, 0.2],
			['aluminium', 1.0, 0.4],
			['wood', 0.0, 0.8],
			['plastic', 0.0, 0.4],
			['stone', 0.0, 0.9],
			['rubber', 0.0, 1.0],
			['mirror', 0.0, 0.0]
		];

		const signatures = presets.map(([, m, r]) => {
			const { color, power } = specularFor(GREY, m, r);
			return `${color.map((c) => c.toFixed(3)).join(',')}|${power.toFixed(2)}`;
		});

		expect(new Set(signatures).size, 'two presets render identically').toBe(presets.length);
	});

	it('clamps rather than inverting or producing NaN', () => {
		for (const [m, r] of [[-1, -1], [2, 2], [Number.NaN, Number.NaN]]) {
			const { color, power } = specularFor(GREY, m, r);
			expect(color.every((c) => Number.isFinite(c) && c >= 0)).toBe(true);
			expect(power).toBeGreaterThan(0);
		}
	});

	it('leaves a dark metal a highlight too', () => {
		// The first fix moved the black-specular case rather than removing it:
		// tinting toward the diffuse colour means a near-black surface at
		// `metallic: 1` gets a near-black highlight, and Babylon's shader
		// multiplies — so `specularPower` again cannot change a pixel. Polished
		// black metal is an ordinary thing to ask for (gunmetal, black chrome,
		// dark car paint), and it rendered as flat matte black.
		const { color } = specularFor([0, 0, 0], 1, 0.1);

		expect(Math.max(...color), 'a black metal has no highlight').toBeGreaterThan(0);
	});

	it('keeps roughness visible on a dark metal', () => {
		const smooth = specularFor([0.02, 0.02, 0.02], 1, 0.0);
		const rough = specularFor([0.02, 0.02, 0.02], 1, 1.0);

		expect(smooth.power).not.toBe(rough.power);
		expect(Math.max(...smooth.color)).toBeGreaterThan(Math.max(...rough.color));
	});
});