/**
 * The program cache must return the program for the sources it was asked about.
 *
 * Both defects here were found by review rather than by use, and both are the
 * kind that produce a wrong picture rather than an error.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { ShaderProgramManager } from '../../src/lib/shaders/shader-program-manager.js';
import { DEFAULT_VERTEX_SHADER } from '../../src/lib/shaders/default-shaders.js';
import { createFakeGL, type FakeGL } from '../helpers/fake-gl.js';

afterEach(() => {
	vi.restoreAllMocks();
});

function manager(): { fake: FakeGL; programs: ShaderProgramManager } {
	const fake = createFakeGL();
	return { fake, programs: new ShaderProgramManager(fake.context) };
}

/**
 * A valid fragment shader with a trailing comment.
 *
 * `'aB'` and ``'`a'`` collide under the 31-polynomial hash this cache used to
 * key on, for any shared prefix: `(97 * 31 + 66)` and `(96 * 31 + 97)` are both
 * 3073. So these two sources are different programs that hashed identically.
 */
const fragmentEndingIn = (comment: string) =>
	`precision mediump float;\nvoid main() { gl_FragColor = vec4(1.0); }\n//${comment}`;

describe('the cache distinguishes sources that a hash could not', () => {
	it('compiles two programs for two sources whose hashes collide', () => {
		const { fake, programs } = manager();

		const first = programs.getProgram(DEFAULT_VERTEX_SHADER, fragmentEndingIn('aB'));
		const second = programs.getProgram(DEFAULT_VERTEX_SHADER, fragmentEndingIn('`a'));

		expect(fake.created('program'), 'the two sources shared one program').toBe(2);
		expect(first, 'the second source was served the first one').not.toBe(second);
		programs.destroy();
	});

	it('still shares one program between two identical sources', () => {
		// The paired half. Keying on the source itself must not defeat the
		// caching the class exists for.
		const { fake, programs } = manager();

		const first = programs.getProgram(DEFAULT_VERTEX_SHADER, fragmentEndingIn('aB'));
		const second = programs.getProgram(DEFAULT_VERTEX_SHADER, fragmentEndingIn('aB'));

		expect(fake.created('program'), 'an identical source was recompiled').toBe(1);
		expect(first).toBe(second);
		programs.destroy();
	});
});

describe('getDefaultProgram', () => {
	it('takes a reference on every call, not just the first', () => {
		const { fake, programs } = manager();

		const first = programs.getDefaultProgram();
		const second = programs.getDefaultProgram();
		expect(fake.created('program')).toBe(1);
		expect(first).toBe(second);

		if (first instanceof Error || second instanceof Error) throw new Error('compile failed');
		programs.releaseProgram(first);
		expect(fake.live('program'), 'one release freed a program held twice').toBe(1);

		programs.releaseProgram(second);
		expect(fake.live('program'), 'the second release did not free it').toBe(0);
		programs.destroy();
	});

	it('compiles a fresh program after the last reference is released', () => {
		// It used to memoise the result in a field the release path never
		// cleared, so the call after a release-to-zero handed back a deleted
		// program — a live-looking handle backed by nothing.
		const { fake, programs } = manager();

		const first = programs.getDefaultProgram();
		if (first instanceof Error) throw new Error('compile failed');
		programs.releaseProgram(first);
		expect(fake.live('program')).toBe(0);

		programs.getDefaultProgram();

		expect(fake.created('program'), 'no new program was compiled').toBe(2);
		expect(fake.live('program'), 'the returned program is not live').toBe(1);
		programs.destroy();
	});
});
