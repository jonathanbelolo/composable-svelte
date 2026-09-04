/**
 * What happens when GL will not allocate — the branches nothing could reach.
 *
 * Real WebGL returns `null` from **every** `create*` while the context is lost,
 * and six places in this package check for that: three in `texture-factory.ts`,
 * two in `shader-compiler.ts`, one pair in `render-pipeline.ts`.
 *
 * Five of the six had never been executed by a test, because the fake had no
 * lost state at all — no `isContextLost`, and `createTexture` handed out a
 * handle whatever was happening. The existing `CONTEXT_LOST` tests dispatch the
 * event and assert the overlay's own bookkeeping flag, which is a different
 * thing entirely.
 *
 * The sixth — the image path's — *was* covered, by two suites that reached it by
 * monkey-patching `fake.context.createTexture` to return `null` once. They had
 * improvised exactly what `failNextCreate` now provides. I first wrote "not one
 * of them had ever been executed", which was wrong: a mutation over each of the
 * six is what said so, and it is the only reason this paragraph is accurate.
 *
 * So the fake models it now, and these are the arms that walk into those
 * branches. The first describe is non-vacuity: every "it was refused" below is
 * worthless unless the same registration succeeds when the context is healthy.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createOverlay } from '../../src/lib/overlay/webgl-overlay.js';
import type { OverlayContextAPI, OverlayOptions } from '../../src/lib/overlay/overlay-types.js';
import { OverlayError, OverlayErrorCode } from '../../src/lib/utils/overlay-error.js';
import { ShaderCompiler } from '../../src/lib/shaders/shader-compiler.js';
import {
	createFakeGL,
	installFakeGL,
	installFakeObservers,
	type FakeGL
} from '../helpers/fake-gl.js';

let undo: Array<() => void> = [];
afterEach(() => {
	undo.forEach((fn) => fn());
	undo = [];
	vi.restoreAllMocks();
});

function overlay(options: OverlayOptions = {}): { fake: FakeGL; api: OverlayContextAPI } {
	const fake = createFakeGL();
	undo.push(installFakeGL(fake), installFakeObservers());
	const api = createOverlay(options);
	if (!('destroy' in api)) throw new Error(`overlay failed to initialise: ${String(api)}`);
	return { fake, api };
}

function sizedCanvas(size: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	return canvas;
}

const SHADER = 'wave-gentle-horizontal';
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// `validateShaderSource` rejects a source with no `precision` qualifier before
// GL is reached at all, so a shader missing one never gets as far as the branch
// under test — which is how the first version of these two arms failed.
const VERTEX =
	'precision mediump float; attribute vec2 aPosition; void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }';
const FRAGMENT = 'precision mediump float; void main() { gl_FragColor = vec4(1.0); }';

describe('a healthy context', () => {
	it('is not lost, and registering works', async () => {
		// The precondition for everything below.
		const { api, fake } = overlay();

		expect(fake.isContextLost()).toBe(false);
		api.registerElement('a', sizedCanvas(64), { type: 'canvas', shader: SHADER });
		await settle();

		expect(api.getElement('a')?.texture).toBeDefined();
		api.destroy();
	});

	it('survives the support probe, which releases a context of its own', async () => {
		// `checkWebGLSupport` creates a throwaway canvas, probes it, and frees it
		// with `WEBGL_lose_context` — on every `createOverlay`. In a browser that
		// touches only the probe's own context. This fake hands the *same* context
		// object to every canvas, so modelling lostness as one flag made the probe
		// lose the overlay's context and 112 tests failed, none about context
		// loss. Lostness is per canvas for that reason, and this is the arm that
		// says so.
		const { api, fake } = overlay();

		expect(fake.calls, 'the probe no longer releases anything').toContain('loseContext');
		expect(fake.isContextLost(), 'the probe took the overlay down with it').toBe(false);

		api.registerElement('a', sizedCanvas(64), { type: 'canvas', shader: SHADER });
		await settle();
		expect(api.getElement('a')?.texture).toBeDefined();
		api.destroy();
	});
});

describe('while the context is lost', () => {
	it('every create* returns null, as a driver does', () => {
		const { fake } = overlay();
		const gl = fake.context;
		fake.loseContext();

		expect(fake.isContextLost()).toBe(true);
		expect(gl.createTexture()).toBeNull();
		expect(gl.createBuffer()).toBeNull();
		expect(gl.createProgram()).toBeNull();
		expect(gl.createShader(gl.VERTEX_SHADER)).toBeNull();
	});

	it('the context agrees with itself', () => {
		// `isContextLost()` on the context, not just on the harness handle: it is
		// what a caller would ask, and it did not exist at all before.
		const { fake } = overlay();
		fake.loseContext();

		expect(fake.context.isContextLost()).toBe(true);
	});

	it('registering an element is refused, not crashed on', async () => {
		// `texture-factory.ts:136/253/320` — `if (!texture) return { error: … }`,
		// three guards that no test could reach.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const onError = vi.fn();
		const { api, fake } = overlay({ onError });
		fake.loseContext();

		api.registerElement('a', sizedCanvas(64), { type: 'canvas', shader: SHADER });
		await settle();

		expect(api.getElement('a')?.texture, 'a texture was made from a lost context').toBeUndefined();
		expect(onError).toHaveBeenCalled();
		api.destroy();
	});

	it('says the context is lost, rather than blaming the texture', async () => {
		// I expected `TEXTURE_CREATION_FAILED` here and the code was right: the
		// overlay checks for a lost context in `registerElement` and refuses
		// before the factory is reached, which is the more useful answer — the
		// texture is not the problem.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const onError = vi.fn();
		const { api, fake } = overlay({ onError });
		fake.loseContext();

		api.registerElement('a', sizedCanvas(64), { type: 'canvas', shader: SHADER });
		await settle();

		const error = onError.mock.calls[0]?.[0] as OverlayError;
		expect(error.code).toBe(OverlayErrorCode.CONTEXT_LOST);
		api.destroy();
	});

	it('a shader cannot be compiled, and says so', () => {
		// `shader-compiler.ts:125` — `if (!shader)`.
		const { fake } = overlay();
		const compiler = new ShaderCompiler(fake.context);
		fake.loseContext();

		const result = compiler.compileShader(FRAGMENT, fake.context.FRAGMENT_SHADER);

		expect(result.error?.code).toBe(OverlayErrorCode.SHADER_COMPILATION_FAILED);
		// The reason is in `details.log`, not the message: `message` is the fixed
		// "Failed to compile fragment shader" for every cause, so asserting on it
		// would pass for a source that simply had a syntax error and would not
		// distinguish this branch at all.
		expect(result.error?.details?.log).toMatch(/create shader/i);
	});

	it('a program cannot be linked, and says so', () => {
		// `shader-compiler.ts:167` — `if (!program)`. Compiled first, while the
		// context still works, so the failure is the link and not the shaders.
		const { fake } = overlay();
		const compiler = new ShaderCompiler(fake.context);
		const vertex = compiler.compileShader(VERTEX, fake.context.VERTEX_SHADER);
		const fragment = compiler.compileShader(FRAGMENT, fake.context.FRAGMENT_SHADER);
		expect(vertex.shader, 'the vertex shader did not compile while healthy').toBeTruthy();
		expect(fragment.shader).toBeTruthy();

		fake.loseContext();
		const result = compiler.linkProgram(vertex.shader!, fragment.shader!);

		expect(result.error?.code).toBe(OverlayErrorCode.SHADER_COMPILATION_FAILED);
		expect(result.error?.details?.log).toMatch(/create program/i);
	});
});

describe('when the context comes back', () => {
	it('allocation works again', () => {
		// Non-vacuity for the whole file from the other side: if `loseContext`
		// were permanent, "refused while lost" would be indistinguishable from
		// "refused always".
		const { fake } = overlay();
		fake.loseContext();
		expect(fake.context.createTexture()).toBeNull();

		fake.restoreContext();

		expect(fake.isContextLost()).toBe(false);
		expect(fake.context.createTexture()).not.toBeNull();
	});

	it('an element registered while lost can be registered again', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { api, fake } = overlay();
		fake.loseContext();

		api.registerElement('a', sizedCanvas(64), { type: 'canvas', shader: SHADER });
		await settle();
		expect(api.getElement('a')?.texture).toBeUndefined();

		fake.restoreContext();
		await settle();

		expect(api.getElement('a')?.texture, 'the restore did not rebuild it').toBeDefined();
		api.destroy();
	});
});

describe('when GL simply will not allocate', () => {
	// The other way `create*` returns null, and the only one that reaches
	// `texture-factory.ts`: a driver out of memory, with a perfectly live
	// context. Losing the context cannot get there, because `registerElement`
	// refuses first — so tying allocation failure to lostness would have left
	// these three guards unreachable and this file would have claimed to cover
	// branches it never touched.
	it('a refused texture is reported, not crashed on', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const onError = vi.fn();
		const { api, fake } = overlay({ onError });
		fake.failNextCreate('texture');

		api.registerElement('a', sizedCanvas(64), { type: 'canvas', shader: SHADER });
		await settle();

		expect(api.getElement('a')?.texture).toBeUndefined();
		expect((onError.mock.calls[0]?.[0] as OverlayError)?.code).toBe(
			OverlayErrorCode.TEXTURE_CREATION_FAILED
		);
		api.destroy();
	});

	it('and the next element still works', async () => {
		// Non-vacuity: `failNextCreate` must fail exactly one allocation, or
		// "refused" above would be indistinguishable from a fake that never
		// allocates again.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { api, fake } = overlay();
		fake.failNextCreate('texture');

		api.registerElement('a', sizedCanvas(64), { type: 'canvas', shader: SHADER });
		await settle();
		api.registerElement('b', sizedCanvas(64), { type: 'canvas', shader: SHADER });
		await settle();

		expect(api.getElement('a')?.texture).toBeUndefined();
		expect(api.getElement('b')?.texture, 'the failure was not limited to one call').toBeDefined();
		api.destroy();
	});
});

describe('the video path, which nothing reached either way', () => {
	// Found by the hostile review of this file: disabling `texture-factory`'s
	// three `if (!texture)` guards one at a time showed the image path covered by
	// two older suites, the canvas path covered by the arm above — and the video
	// path covered by nothing at all, before this work or after it. The commit
	// that added this file claimed six guards reached; it was five.
	it('reports a refused video texture rather than crashing', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const onError = vi.fn();
		const { api, fake } = overlay({ onError });

		const video = document.createElement('video');
		Object.defineProperty(video, 'videoWidth', { value: 64 });
		Object.defineProperty(video, 'videoHeight', { value: 64 });
		Object.defineProperty(video, 'paused', { value: true });

		fake.failNextCreate('texture');
		api.registerElement('a', video, { type: 'video', shader: SHADER });
		await settle();

		expect(api.getElement('a')?.texture).toBeUndefined();
		expect((onError.mock.calls[0]?.[0] as OverlayError)?.code).toBe(
			OverlayErrorCode.TEXTURE_CREATION_FAILED
		);
		api.destroy();
	});

	it('and accepts the same video when allocation works', async () => {
		// Non-vacuity: a video the fake refuses for some *other* reason would
		// satisfy the arm above without the guard being involved.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { api } = overlay();

		const video = document.createElement('video');
		Object.defineProperty(video, 'videoWidth', { value: 64 });
		Object.defineProperty(video, 'videoHeight', { value: 64 });
		Object.defineProperty(video, 'paused', { value: true });

		api.registerElement('a', video, { type: 'video', shader: SHADER });
		await settle();

		expect(api.getElement('a')?.texture, 'the video never uploaded at all').toBeDefined();
		api.destroy();
	});
});
