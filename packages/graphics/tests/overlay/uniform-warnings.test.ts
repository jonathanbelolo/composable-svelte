/**
 * A shader that does not declare what the caller sets is worth one warning.
 *
 * `setUniform` and `bindTexture` are both reached from `RenderPipeline.render`,
 * which the render loop calls for every element on every frame. Neither guarded
 * its `console.warn`, so a program missing `uTexture` — or a caller passing a
 * uniform name the shader does not declare — produced a warning per element per
 * frame. Measured before the fix: **60 warnings over 60 frames**.
 *
 * Found while reviewing a fix for the identical defect one file away. The
 * message is right and worth keeping; saying it sixty times a second is what
 * buries whatever else the console holds.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { RenderPipeline } from '../../src/lib/shaders/render-pipeline.js';
import { ShaderProgramManager } from '../../src/lib/shaders/shader-program-manager.js';
import type { CompiledProgram } from '../../src/lib/shaders/shader-compiler.js';
import { createFakeGL, installFakeGL, installFakeObservers } from '../helpers/fake-gl.js';

let undo: Array<() => void> = [];
afterEach(() => {
	undo.forEach((fn) => fn());
	undo = [];
	vi.restoreAllMocks();
});

function harness() {
	const fake = createFakeGL();
	undo.push(installFakeGL(fake), installFakeObservers());
	const gl = fake.context;
	const manager = new ShaderProgramManager(gl);
	return { fake, gl, manager, pipeline: new RenderPipeline(gl, manager) };
}

/** A program declaring no uniforms, so every lookup misses. */
const bareProgram = () =>
	({ program: {}, uniforms: new Map(), attributes: new Map() }) as unknown as CompiledProgram;

/** One that declares `uTexture`, so the texture bind lands. */
const withTexture = () =>
	({
		program: {},
		uniforms: new Map([['uTexture', { name: 'uTexture' }]]),
		attributes: new Map()
	}) as unknown as CompiledProgram;

describe('a missing uniform', () => {
	it('is reported', () => {
		// Non-vacuity: "said once" is satisfied by a system that says nothing.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { manager } = harness();

		manager.setUniform(bareProgram(), 'uMissing', 1);

		expect(warn.mock.calls.flat().join(' ')).toMatch(/uMissing.*not found/);
	});

	it('is reported once, not on every frame', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { manager } = harness();
		const program = bareProgram();

		for (let frame = 0; frame < 60; frame += 1) {
			manager.setUniform(program, 'uMissing', 1);
		}

		expect(warn.mock.calls.length, 'a missing uniform warned on every frame').toBe(1);
	});

	it('still reports a *different* missing uniform', () => {
		// Suppression must be about repetition, not about going quiet after the
		// first mistake — otherwise the second fault is invisible.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { manager } = harness();
		const program = bareProgram();

		manager.setUniform(program, 'uOne', 1);
		manager.setUniform(program, 'uTwo', 2);

		expect(warn.mock.calls.length).toBe(2);
	});
});

describe('a texture bind against a program with no uTexture', () => {
	it('warns once across a run of frames', () => {
		// The site that actually fires in practice: `render()` binds `uTexture`
		// every frame whether the program declares it or not.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { pipeline } = harness();
		const program = bareProgram();

		for (let frame = 0; frame < 60; frame += 1) {
			pipeline.render(program, {} as WebGLTexture);
		}

		expect(warn.mock.calls.length, 'the texture bind warned on every frame').toBe(1);
	});

	it('says nothing when the program does declare it', () => {
		// The control: suppression must not be hiding a warning that should never
		// have been raised.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { pipeline } = harness();

		for (let frame = 0; frame < 10; frame += 1) {
			pipeline.render(withTexture(), {} as WebGLTexture);
		}

		expect(warn.mock.calls.length).toBe(0);
	});
});

describe('an unsupported uniform array length', () => {
	it('is also said once', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { manager } = harness();
		const program = { ...bareProgram(), uniforms: new Map([['uOdd', {}]]) } as CompiledProgram;

		for (let frame = 0; frame < 10; frame += 1) {
			manager.setUniform(program, 'uOdd', [1, 2, 3, 4, 5]);
		}

		expect(warn.mock.calls.length).toBe(1);
		expect(warn.mock.calls.flat().join(' ')).toMatch(/array length: 5/);
	});
});
