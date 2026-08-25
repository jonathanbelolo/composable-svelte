/**
 * The preset registry, which is public and almost entirely uncalled.
 *
 * All five functions are exported from the package root; only `getPreset` and
 * `hasPreset` have a caller anywhere, and only two of the 21 presets are used
 * by anything (`shader-gallery`, by string name). None of it had a test.
 *
 * The registry also encodes its 21 names in five hand-maintained places — the
 * `PresetName` union, `PRESET_REGISTRY`, the metadata record, and two re-export
 * blocks — so the properties worth pinning are the ones that break when those
 * drift apart.
 */

import { describe, it, expect } from 'vitest';
import {
	getPreset,
	hasPreset,
	getAllPresetNames,
	getPresetsByCategory,
	getPresetMetadata,
	type PresetName
} from '../../src/lib/shaders/presets/index.js';

const CATEGORIES = ['ripple', 'wave', 'pixelate', 'blur', 'glitch', 'zoom'] as const;

describe('the registry agrees with itself', () => {
	it('lists presets, so the arms below are not vacuous', () => {
		expect(getAllPresetNames()).toHaveLength(21);
	});

	it('resolves every name it lists', () => {
		const missing = getAllPresetNames().filter((name) => getPreset(name) === undefined);

		expect(missing, 'a listed preset resolves to nothing').toEqual([]);
	});

	it('has metadata for every name it lists', () => {
		// The metadata is a separate hand-written record of the same 21 names.
		const missing = getAllPresetNames().filter((name) => getPresetMetadata(name) === undefined);

		expect(missing, 'a listed preset has no metadata').toEqual([]);
	});

	it('gives every preset a fragment shader', () => {
		const empty = getAllPresetNames().filter((name) => !getPreset(name)?.fragment?.trim());

		expect(empty, 'a preset resolves to an effect with no fragment shader').toEqual([]);
	});

	it('accepts exactly the names it lists', () => {
		expect(getAllPresetNames().every((name) => hasPreset(name))).toBe(true);
		expect(hasPreset('not-a-preset')).toBe(false);
	});
});

describe('getPresetsByCategory', () => {
	it('covers every preset exactly once across the categories', () => {
		const byCategory = CATEGORIES.flatMap((c) => getPresetsByCategory(c));

		expect(new Set(byCategory).size, 'a preset appears in two categories').toBe(byCategory.length);
		expect(byCategory.sort()).toEqual(getAllPresetNames().sort());
	});

	it('agrees with the category each preset reports in its metadata', () => {
		// It filters by `name.startsWith(category)` rather than reading the
		// `category` field the metadata carries. That happens to work while every
		// name is prefixed with its category, and silently stops working the
		// moment one is not — a preset would vanish from its own category with
		// nothing to say so.
		const disagreements: string[] = [];
		for (const category of CATEGORIES) {
			for (const name of getPresetsByCategory(category)) {
				const declared = getPresetMetadata(name)?.category;
				if (declared !== category) disagreements.push(`${name}: listed under ${category}, declares ${declared}`);
			}
		}

		expect(disagreements).toEqual([]);
	});
});

describe('getPreset returns the shared instance', () => {
	it('hands back the same object each time', () => {
		// Not a defect — it is how `webgl-overlay` resolves a string shader — but
		// it is why mutating `preset.uniforms` for one element used to leak into
		// every other element using that preset. Pinned so the sharing is a
		// stated property rather than an accident.
		const first = getPreset('wave-gentle-horizontal' as PresetName);
		const second = getPreset('wave-gentle-horizontal' as PresetName);

		expect(first).toBe(second);
	});
});
