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
		// `source.replace(/\n/g, '')` satisfied both of the original
		// assertions, so this pinned nothing but newline removal.
		const source = 'void main()  {\n    gl_FragColor  =  vec4(1.0);\n}';

		const result = minifyShader(source);

		expect(result).not.toContain('\n');
		expect(result, 'runs of spaces survived').not.toMatch(/ {2}/);
		expect(result, 'the shader stopped being the shader').toContain('gl_FragColor');
		expect(result, 'spacing around operators survived').toContain('=vec4(1.0)');
	});

	it('strips comments as well as whitespace', () => {
		const result = minifyShader('void main() {\n  // set it\n  gl_FragColor = c;\n}');

		expect(result, 'a comment survived minification').not.toContain('set it');
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
		//
		// Asserting `errors.length > 1` on an input that yields three let any
		// one check be deleted for free — the precision check was, and this
		// still passed. Name them.
		const { valid, errors } = validateShaderSource('float x = 1.0;', 'fragment');
		const joined = errors.join(' ');

		expect(valid).toBe(false);
		expect(joined, 'the missing main() was not reported').toMatch(/main\(\)/);
		expect(joined, 'the missing precision qualifier was not reported').toMatch(/precision/);
		expect(joined, 'the missing gl_FragColor was not reported').toMatch(/gl_FragColor/);
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
	const SOURCE = [
		'precision mediump float;',
		'attribute vec2 aPosition;',
		'attribute vec2 aTexCoord;',
		'uniform sampler2D uTexture;',
		'uniform float uTime;',
		'varying vec2 vTexCoord;',
		'void main() { gl_FragColor = texture2D(uTexture, vTexCoord); }'
	].join('\n');

	// `expect(info).toBeTruthy()` and `typeof info === 'object'` were the whole
	// of this describe, and `return {}` satisfies both — on a function whose
	// entire job is to name what it found.

	it('names the attributes', () => {
		expect(getShaderInfo(SOURCE).attributes).toEqual(['aPosition', 'aTexCoord']);
	});

	it('names the uniforms', () => {
		expect(getShaderInfo(SOURCE).uniforms).toEqual(['uTexture', 'uTime']);
	});

	it('names the varyings', () => {
		expect(getShaderInfo(SOURCE).varyings).toEqual(['vTexCoord']);
	});

	it('counts the lines', () => {
		expect(getShaderInfo(SOURCE).lines).toBe(7);
	});

	it('finds nothing in a shader that declares nothing', () => {
		// The paired half: a parser that reported the same names regardless
		// would pass every assertion above.
		const info = getShaderInfo('void main() {}');

		expect(info.attributes).toEqual([]);
		expect(info.uniforms).toEqual([]);
		expect(info.varyings).toEqual([]);
	});
});
