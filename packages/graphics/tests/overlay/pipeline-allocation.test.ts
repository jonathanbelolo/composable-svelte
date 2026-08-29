/**
 * A pipeline that could not allocate its geometry must not report itself ready.
 *
 * `initializeBuffers` creates two buffers, guards each with `if (buffer)`, and
 * then set `initialized = true` unconditionally. The guards read as careful
 * handling and were the mechanism: a failed `createBuffer` skipped the upload,
 * the pipeline announced itself ready, and `render()` went on to bind the
 * program, set the uniforms and call `drawArrays` with no vertex buffer bound —
 * drawing nothing, every frame, in silence.
 *
 * `createBuffer` returns `null` when the context is lost or the driver is out of
 * memory, so this is an ordinary failure. It was unreachable from any test until
 * the fake learned to model allocation failure, which is how it stayed.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { RenderPipeline } from '../../src/lib/shaders/render-pipeline.js';
import { ShaderProgramManager } from '../../src/lib/shaders/shader-program-manager.js';
import type { CompiledProgram } from '../../src/lib/shaders/shader-compiler.js';
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

function harness(failBuffers = 0): { fake: FakeGL; pipeline: RenderPipeline } {
	const fake = createFakeGL();
	undo.push(installFakeGL(fake), installFakeObservers());
	const gl = fake.context;
	if (failBuffers > 0) fake.failNextCreate('buffer', failBuffers);
	const pipeline = new RenderPipeline(gl, new ShaderProgramManager(gl));
	return { fake, pipeline };
}

/**
 * Enough of a program for `render()` to reach `drawArrays`.
 *
 * `attributes` and `uniforms` are **Maps**, not plain objects: `setupAttributes`
 * calls `program.attributes.get(...)`, so an object literal throws there — which
 * is what the first version of this fixture did, and the healthy-path arm caught
 * it rather than the refusal arms, since those return before ever looking.
 */
const dummyProgram = {
	program: {},
	uniforms: new Map(),
	attributes: new Map()
} as unknown as CompiledProgram;

describe('when the buffers allocate', () => {
	it('the pipeline holds both of them', () => {
		// Non-vacuity: every arm below is about the *absence* of buffers, which
		// says nothing unless the ordinary case has them.
		const { fake } = harness();

		expect(fake.live('buffer')).toBe(2);
	});

	it('and it draws', () => {
		const { fake, pipeline } = harness();

		pipeline.render(dummyProgram, {} as WebGLTexture);

		expect(fake.drawCalls()).toBe(1);
	});
});

describe('when neither buffer allocates', () => {
	it('does not draw, rather than drawing nothing', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { fake, pipeline } = harness(2);

		pipeline.render(dummyProgram, {} as WebGLTexture);

		expect(
			fake.drawCalls(),
			'the pipeline reported itself ready and issued a draw with no geometry'
		).toBe(0);
	});

	it('says so on the console', () => {
		// The failure was silent, which is the part that made it survive: a
		// renderer drawing nothing looks exactly like a scene with nothing in it.
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		harness(2);

		expect(error.mock.calls.flat().join(' ')).toMatch(/could not allocate/i);
	});

	it('says it once, not on every frame', () => {
		// Found by reviewing the fix that made this audible at all. `render()` is
		// called for every element on every frame, and its "not initialized"
		// branch was unreachable until `initializeBuffers` stopped claiming a
		// success it had not had — so making the failure speak made it speak
		// sixty times a second. Measured before this arm existed: 61 console
		// errors for 60 frames.
		//
		// Trading silence for a flood is not a fix. It is the same trade
		// `reportRefusal` exists for in the overlay, missed again one commit
		// after citing it.
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { pipeline } = harness(2);
		const afterConstruction = error.mock.calls.length;
		expect(afterConstruction, 'construction said nothing').toBeGreaterThan(0);

		for (let frame = 0; frame < 60; frame += 1) {
			pipeline.render(dummyProgram, {} as WebGLTexture);
		}

		expect(
			error.mock.calls.length - afterConstruction,
			'an unusable pipeline shouted on every frame'
		).toBeLessThanOrEqual(1);
	});
});

describe('when only one buffer allocates', () => {
	it('still refuses to draw', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { fake, pipeline } = harness(1);

		pipeline.render(dummyProgram, {} as WebGLTexture);

		expect(fake.drawCalls()).toBe(0);
	});

	it('frees the one it got, rather than holding a handle it cannot use', () => {
		// The leak oracle this package uses everywhere. Half a quad is no more
		// drawable than none, and keeping it costs a GL handle for the life of
		// the pipeline.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { fake } = harness(1);

		expect(fake.created('buffer'), 'nothing was allocated to leak').toBe(1);
		expect(fake.live('buffer'), 'the surviving buffer was never released').toBe(0);
	});
});
