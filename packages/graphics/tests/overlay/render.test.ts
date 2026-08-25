/**
 * The draw path must actually run — and a uniform must actually reach GL.
 *
 * Nothing in this suite drew anything until this file existed. Making
 * `RenderPipeline.render()` throw on every call left 216 tests green, as did
 * making `ShaderProgramManager.setUniform()` an immediate `return`. That is
 * what let `describe('updateUniforms reaches the shader')` assert only that a
 * JS record changed, under a name claiming otherwise.
 *
 * The harness had to become faithful first. `getUniformLocation` returned a
 * truthy handle for every name asked of it, so "the program has no location for
 * this uniform" — the actual failure mode — could not occur in a test. It now
 * returns a location only for a uniform one of the program's attached sources
 * declares, which is what a driver does.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createOverlay } from '../../src/lib/overlay/webgl-overlay.js';
import type { OverlayContextAPI } from '../../src/lib/overlay/overlay-types.js';
import {
	createFakeGL,
	installFakeGL,
	installFakeObservers,
	type FakeGL
} from '../helpers/fake-gl.js';

let undo: Array<() => void> = [];
let live: OverlayContextAPI[] = [];

afterEach(() => {
	live.forEach((api) => api.destroy());
	live = [];
	vi.useRealTimers();
	undo.forEach((fn) => fn());
	undo = [];
	document.body.innerHTML = '';
	vi.restoreAllMocks();
});

/**
 * Fake timers throughout: the render loop is driven by rAF, and jsdom's rAF
 * clock does not share an origin with `performance.now()` the way a browser's
 * does. One clock for both is the only way a frame is deterministic here.
 */
function overlay(): { fake: FakeGL; api: OverlayContextAPI } {
	vi.useFakeTimers({
		toFake: [
			'requestAnimationFrame',
			'cancelAnimationFrame',
			'performance',
			'setTimeout',
			'clearTimeout',
			'Date'
		]
	});
	const fake = createFakeGL();
	undo.push(installFakeGL(fake), installFakeObservers());

	const canvas = document.createElement('canvas');
	canvas.width = 800;
	canvas.height = 600;
	document.body.appendChild(canvas);

	const api = createOverlay({ canvas });
	if (!('destroy' in api)) throw new Error(`overlay failed to initialise: ${String(api)}`);
	live.push(api);
	return { fake, api };
}

function boundedImage(): HTMLImageElement {
	const img = document.createElement('img');
	Object.defineProperty(img, 'complete', { value: true });
	Object.defineProperty(img, 'naturalWidth', { value: 64 });
	Object.defineProperty(img, 'naturalHeight', { value: 64 });
	img.getBoundingClientRect = () =>
		({ left: 10, top: 10, width: 100, height: 100, right: 110, bottom: 110 }) as DOMRect;
	document.body.appendChild(img);
	return img;
}

/** Let async texture creation settle, then run at least one frame. */
async function frame(api: OverlayContextAPI): Promise<void> {
	await vi.advanceTimersByTimeAsync(0);
	api.start();
	await vi.advanceTimersByTimeAsync(50);
	api.stop();
}

describe('the overlay draws', () => {
	it('issues a draw call for a registered element', async () => {
		const { fake, api } = overlay();

		api.registerElement('a', boundedImage(), { type: 'image', shader: 'ripple-gentle' });
		await frame(api);

		expect(fake.drawCalls(), 'nothing was ever drawn').toBeGreaterThan(0);
	});

	it('draws nothing when no element is registered', async () => {
		// The paired half: a draw count that rises on its own would make every
		// assertion above meaningless.
		const { fake, api } = overlay();

		await frame(api);

		expect(fake.drawCalls(), 'something was drawn with no elements').toBe(0);
	});

	it('binds the preset uniforms the shader declares', async () => {
		const { fake, api } = overlay();

		api.registerElement('a', boundedImage(), { type: 'image', shader: 'ripple-gentle' });
		await frame(api);

		const bound = fake.uniforms();
		expect(bound.has('uTexture'), 'the texture sampler never reached GL').toBe(true);
		expect(bound.has('uTime'), 'the time uniform never reached GL').toBe(true);
		expect(bound.get('uAmplitude'), "the preset's own amplitude never reached GL").toBe(0.01);
	});
});

describe('updateUniforms reaches GL', () => {
	it('binds a value set after registration', async () => {
		const { fake, api } = overlay();

		api.registerElement('a', boundedImage(), { type: 'image', shader: 'ripple-gentle' });
		await frame(api);

		api.updateUniforms('a', { uAmplitude: 0.5 });
		fake.clearCalls();
		await frame(api);

		expect(fake.uniforms().get('uAmplitude'), 'the new value never reached GL').toBe(0.5);
	});

	it('binds a uniform the shader declares but registration did not list', async () => {
		// The defect. `uniformNames` is fixed at registration from the shader
		// object's `uniforms` keys, `CompiledProgram.uniforms` is populated only
		// from that list, and `setUniform` warns and returns on a miss — sixty
		// times a second, per uniform, for the life of the element.
		const { fake, api } = overlay();
		const fragment = `
			precision mediump float;
			uniform sampler2D uTexture;
			uniform float uIntensity;
			varying vec2 vTexCoord;
			void main() { gl_FragColor = texture2D(uTexture, vTexCoord) * uIntensity; }
		`;

		api.registerElement('a', boundedImage(), { type: 'image', shader: { fragment } });
		await frame(api);

		api.updateUniforms('a', { uIntensity: 0.25 });
		fake.clearCalls();
		await frame(api);

		expect(
			fake.uniforms().get('uIntensity'),
			'a uniform the shader declares was never bindable'
		).toBe(0.25);
	});

	it('binds the second element\'s uniforms when it shares a source with the first', async () => {
		// The program cache is keyed on shader source alone and discards the
		// caller's uniform list on a hit, so whichever element registers second
		// inherits the first one's set of bindable names.
		const { fake, api } = overlay();
		const fragment = `
			precision mediump float;
			uniform sampler2D uTexture;
			uniform float uIntensity;
			varying vec2 vTexCoord;
			void main() { gl_FragColor = texture2D(uTexture, vTexCoord) * uIntensity; }
		`;

		api.registerElement('a', boundedImage(), { type: 'image', shader: { fragment } });
		api.registerElement('b', boundedImage(), {
			type: 'image',
			shader: { fragment, uniforms: { uIntensity: 0.75 } }
		});
		await frame(api);

		expect(fake.uniforms().get('uIntensity'), "b's declared uniform never reached GL").toBe(0.75);
	});
});
