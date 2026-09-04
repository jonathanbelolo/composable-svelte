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

describe('a failed recompile does not blank the element', () => {
	const badShader = { fragment: 'precision mediump float; void main() { gl_FragColor = broken; }' };

	it('keeps drawing what it was drawing', async () => {
		// `compileElementShader` set `registration.error`, `render()` skipped any
		// element with one, and nothing cleared it. So one bad shader stopped
		// the element for good — and the fix's own comment claimed it "keeps the
		// element rendering what it was rendering", which was the opposite of
		// what happened.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { fake, api } = overlay();

		api.registerElement('a', boundedImage(), { type: 'image', shader: 'ripple-gentle' });
		await frame(api);
		expect(fake.drawCalls(), 'nothing drew before the failure').toBeGreaterThan(0);

		(fake.context as unknown as Record<string, unknown>).getShaderParameter = () => false;
		api.setShader('a', badShader);
		(fake.context as unknown as Record<string, unknown>).getShaderParameter = () => true;

		fake.clearCalls();
		await frame(api);

		expect(fake.drawCalls(), 'a failed recompile stopped the element drawing').toBeGreaterThan(0);
	});

	it('recovers when a valid shader is set afterwards', async () => {
		// The other half of the same defect: even setting a *working* shader
		// could not revive the element, because the error latched.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { fake, api } = overlay();

		api.registerElement('a', boundedImage(), { type: 'image', shader: 'ripple-gentle' });
		await frame(api);

		(fake.context as unknown as Record<string, unknown>).getShaderParameter = () => false;
		api.setShader('a', badShader);
		(fake.context as unknown as Record<string, unknown>).getShaderParameter = () => true;

		api.setShader('a', 'wave-flowing');
		fake.clearCalls();
		await frame(api);

		expect(api.getElement('a')?.error, 'the error latched past a successful recompile').toBeUndefined();
		expect(fake.drawCalls(), 'the element never came back').toBeGreaterThan(0);
	});

	it('still refuses to draw an element whose texture never arrived', async () => {
		// The paired half. Dropping the error gate must not start drawing
		// elements that have nothing to draw.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { fake, api } = overlay();

		api.registerElement('a', document.createElement('img'), {
			type: 'image',
			shader: 'ripple-gentle'
		});
		await frame(api);

		expect(fake.drawCalls(), 'an element with no texture was drawn').toBe(0);
	});
});

describe('a lost context stops the work', () => {
	it('draws nothing while the context is gone', async () => {
		// `render()` guarded on `this.gl && !this.destroyed` only.
		// `WebGLContextManager` has tracked the loss all along and returns null
		// from `getContext()` while lost; the overlay never asked, and went on
		// spending a frame's work per frame producing nothing.
		const { fake, api } = overlay();

		api.registerElement('a', boundedImage(), { type: 'image', shader: 'ripple-gentle' });
		await frame(api);
		expect(fake.drawCalls(), 'nothing drew before the loss').toBeGreaterThan(0);

		fake.canvas?.dispatchEvent(new Event('webglcontextlost'));
		fake.clearCalls();
		await frame(api);

		expect(fake.drawCalls(), 'the loop drew into a dead context').toBe(0);
	});

	it('draws again once the context comes back', async () => {
		// The paired half: refusing to draw while lost must not be permanent.
		const { fake, api } = overlay();

		api.registerElement('a', boundedImage(), { type: 'image', shader: 'ripple-gentle' });
		await frame(api);

		fake.canvas?.dispatchEvent(new Event('webglcontextlost'));
		fake.canvas?.dispatchEvent(new Event('webglcontextrestored'));
		fake.clearCalls();
		await frame(api);

		expect(fake.drawCalls(), 'the overlay never resumed after the restore').toBeGreaterThan(0);
	});
});

describe('the quad reaches GL', () => {
	/**
	 * `boundedImage()` sits at (10, 10) 100×100 on an 800×600 canvas with a
	 * device pixel ratio of 1, so `domToNDC` gives left = 10/800*2-1, right =
	 * 110/800*2-1, top = 1-10/600*2, bottom = 1-110/600*2. `createQuadVertices`
	 * then lays out two triangles as six xy pairs.
	 */
	const EXPECTED_QUAD = [
		-0.975, 0.9666667, -0.725, 0.9666667, -0.975, 0.6333333, -0.725, 0.9666667, -0.725,
		0.6333333, -0.975, 0.6333333
	];

	it('uploads the element’s own coordinates, not the default fullscreen quad', async () => {
		// Nothing observed positioning at all. Deleting the `updateQuadPosition`
		// call, so every element renders as the default fullscreen quad, broke
		// no test — nor did `const dpr = 0`, which collapses every bound to
		// nothing.
		const { fake, api } = overlay();

		api.registerElement('a', boundedImage(), { type: 'image', shader: 'ripple-gentle' });
		await frame(api);

		const uploads = fake.argsFor('bufferSubData');
		expect(uploads, 'no vertex data was ever uploaded per element').not.toHaveLength(0);

		const vertices = uploads[uploads.length - 1]![2] as Float32Array;
		expect(Array.from(vertices), 'the quad is not the element’s').toHaveLength(12);
		Array.from(vertices).forEach((value, i) => {
			expect(value, `vertex component ${i}`).toBeCloseTo(EXPECTED_QUAD[i]!, 4);
		});
	});

	it('binds the position buffer to aPosition and the texcoords to aTexCoord', async () => {
		// `setupAttributes` could be gutted entirely, its two buffers swapped,
		// or one index used twice, and the recorded call *names* were identical
		// in every case: bindBuffer, enableVertexAttribArray,
		// vertexAttribPointer, twice over.
		const { fake, api } = overlay();

		api.registerElement('a', boundedImage(), { type: 'image', shader: 'ripple-gentle' });
		await frame(api);

		// `frame()` runs several frames, so these repeat. That is the stronger
		// assertion anyway: every frame must make the same two bindings.
		const pointers = fake.argsFor('vertexAttribPointer');
		expect(pointers, 'no attributes were ever pointed at a buffer').not.toHaveLength(0);

		const indices = pointers.map((args) => args[0] as number);
		expect(new Set(indices).size, 'both attributes were bound to one index').toBe(2);
		indices.forEach((index) => {
			expect(index, 'an undeclared attribute (-1) was pointed at a buffer').toBeGreaterThanOrEqual(0);
		});

		// `aPosition` is declared first in DEFAULT_VERTEX_SHADER, so it is
		// location 0; the buffer bound for it must be the one carrying the NDC
		// quad, and the other must carry the static texture coordinates.
		const bindsBeforePointer = fake.records
			.filter((entry) => entry.name === 'bindBuffer' || entry.name === 'vertexAttribPointer')
			.reduce<Array<{ buffer: unknown; index: number }>>((out, entry) => {
				if (entry.name === 'bindBuffer') out.push({ buffer: entry.args[1], index: -1 });
				else if (out.length) out[out.length - 1]!.index = entry.args[0] as number;
				return out;
			}, [])
			.filter((pair) => pair.index >= 0);

		const buffersFor = (index: number) =>
			new Set(bindsBeforePointer.filter((pair) => pair.index === index).map((p) => p.buffer));
		const positionBuffers = buffersFor(0);
		const texCoordBuffers = buffersFor(1);

		expect(positionBuffers.size, 'aPosition was not bound to exactly one buffer').toBe(1);
		expect(texCoordBuffers.size, 'aTexCoord was not bound to exactly one buffer').toBe(1);

		const forPosition = { buffer: [...positionBuffers][0] };
		const forTexCoord = { buffer: [...texCoordBuffers][0] };
		expect(
			forPosition.buffer,
			'aPosition and aTexCoord were handed the same buffer'
		).not.toBe(forTexCoord.buffer);

		const positions = fake.bufferContents(forPosition.buffer);
		expect(positions, 'the buffer bound for aPosition holds nothing').not.toBeNull();
		Array.from(positions!).forEach((value, i) => {
			expect(value, `aPosition component ${i}`).toBeCloseTo(EXPECTED_QUAD[i]!, 4);
		});

		const texCoords = Array.from(fake.bufferContents(forTexCoord.buffer) ?? []);
		expect(
			texCoords,
			'the buffer bound for aTexCoord holds the quad, not texture coordinates'
		).toEqual([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]);
	});

	it('disables every attribute it enabled', async () => {
		const { fake, api } = overlay();

		api.registerElement('a', boundedImage(), { type: 'image', shader: 'ripple-gentle' });
		await frame(api);

		const enabled = new Set(fake.argsFor('enableVertexAttribArray').map((args) => args[0]));
		const disabled = new Set(fake.argsFor('disableVertexAttribArray').map((args) => args[0]));
		expect(enabled.size, 'no attribute arrays were enabled').toBeGreaterThan(0);
		expect([...enabled].sort(), 'the attributes enabled and disabled differ').toEqual(
			[...disabled].sort()
		);
	});
});
