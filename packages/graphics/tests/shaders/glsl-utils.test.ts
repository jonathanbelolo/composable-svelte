/**
 * The GLSL string utilities: exported from the package root, called by nothing.
 *
 * Zero callers means a defect here is latent rather than live — but they are
 * public API, so a consumer reaching for them gets whatever they do today.
 *
 * Note one hazard that does *not* apply: `stripComments` uses a naive
 * `//.*$` regex, which is exactly what has repeatedly broken
 * `animation-policy.test.ts`'s comment stripper — but that breaks on `//`
 * inside a *string literal*, and GLSL has no string literals. The naive version
 * is sound here.
 */

import { describe, it, expect } from 'vitest';
import {
	ensurePrecision,
	stripComments,
	minifyShader,
	validateShaderSource,
	getShaderInfo
} from '../../src/lib/shaders/default-shaders.js';

describe('stripComments', () => {
	it('removes both comment forms', () => {
		const source = 'void main() {\n  // set colour\n  gl_FragColor = c; /* done */\n}';

		const result = stripComments(source);

		expect(result).not.toContain('set colour');
		expect(result).not.toContain('done');
		expect(result).toContain('gl_FragColor = c;');
	});

	it('leaves code containing a slash alone', () => {
		const source = 'float half = x / 2.0;';

		expect(stripComments(source)).toContain('x / 2.0');
	});
});

describe('ensurePrecision', () => {
	it('adds a qualifier when there is none', () => {
		expect(ensurePrecision('void main() {}')).toContain('precision mediump float;');
	});

	it('does not add a second one', () => {
		const source = 'precision highp float;\nvoid main() {}';

		expect(ensurePrecision(source)).toBe(source);
	});

	it('is fooled by the word appearing in a comment', () => {
		// `source.includes('precision')` is a substring test over the whole
		// source, comments included — so a shader that only *mentions* precision
		// is left without a qualifier and fails to compile on drivers that
		// require one. Pinned as current behaviour rather than silently fixed:
		// this function has no callers, so changing it is a behaviour change to
		// public API with no evidence of what depends on it.
		const source = '// no precision qualifier below this line\nvoid main() {}';

		expect(ensurePrecision(source)).toBe(source);
		expect(ensurePrecision(source)).not.toContain('precision mediump float;');
	});
});

describe('minifyShader', () => {
	it('collapses whitespace in a plain shader', () => {
		const source = 'void main() {\n    gl_FragColor = vec4(1.0);\n}';

		const result = minifyShader(source);

		expect(result).not.toContain('\n');
		expect(result.length).toBeLessThan(source.length);
	});

	it('destroys preprocessor directives', () => {
		// GLSL preprocessor directives are line-based: `#define` and `#ifdef`
		// must each end at a newline. Collapsing `\s+` to a single space puts
		// them all on one line, which does not compile.
		//
		// Pinned as current behaviour, not fixed, for the same reason as above —
		// and recorded so the next person reaching for this knows before they
		// ship it, rather than after.
		const source = '#define X 1.0\n#ifdef HIGH\nprecision highp float;\n#endif\nvoid main() {}';

		const result = minifyShader(source);

		expect(result, 'if this now contains newlines, the function was fixed').not.toContain('\n');
	});
});

describe('validateShaderSource', () => {
	const FRAGMENT = 'precision mediump float;\nvoid main() { gl_FragColor = vec4(1.0); }';

	it('accepts a complete fragment shader', () => {
		expect(validateShaderSource(FRAGMENT, 'fragment').valid).toBe(true);
	});

	it('names each thing that is missing', () => {
		// It reports every problem rather than the first, which is the useful
		// shape for a compile-time helper.
		const { valid, errors } = validateShaderSource('float x = 1.0;', 'fragment');

		expect(valid).toBe(false);
		expect(errors.length, 'only one problem was reported').toBeGreaterThan(1);
	});

	it('applies the rule that belongs to the shader type', () => {
		// The same source is a valid fragment shader and an invalid vertex one:
		// a vertex shader must set `gl_Position`.
		expect(validateShaderSource(FRAGMENT, 'fragment').valid).toBe(true);
		expect(validateShaderSource(FRAGMENT, 'vertex').valid).toBe(false);
		expect(validateShaderSource(FRAGMENT, 'vertex').errors.join(' ')).toContain('gl_Position');
	});
});

describe('getShaderInfo', () => {
	it('reports something about a real shader', () => {
		const info = getShaderInfo('precision mediump float;\nuniform sampler2D uTexture;\nvoid main() {}');

		expect(info).toBeTruthy();
		expect(typeof info).toBe('object');
	});
});
