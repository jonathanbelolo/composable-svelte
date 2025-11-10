/**
 * Default Shaders
 *
 * Phase 2.1: Default shaders (vertex/fragment)
 *
 * Provides standard vertex and fragment shaders used as:
 * - Fallbacks when custom shaders fail
 * - Base shaders for simple texture rendering
 * - Building blocks for shader presets
 */

/**
 * Default Vertex Shader
 *
 * Standard passthrough vertex shader that:
 * - Maps vertex positions to clip space
 * - Passes texture coordinates to fragment shader
 *
 * Attributes:
 * - aPosition: Vertex position (vec2)
 * - aTexCoord: Texture coordinate (vec2)
 *
 * Varyings:
 * - vTexCoord: Interpolated texture coordinate
 */
export const DEFAULT_VERTEX_SHADER = `
precision mediump float;

// Attributes
attribute vec2 aPosition;
attribute vec2 aTexCoord;

// Varyings (passed to fragment shader)
varying vec2 vTexCoord;

void main() {
  // Pass texture coordinate to fragment shader
  vTexCoord = aTexCoord;

  // Convert position from [0,1] to clip space [-1,1]
  gl_Position = vec4(aPosition * 2.0 - 1.0, 0.0, 1.0);
}
`.trim();

/**
 * Default Fragment Shader
 *
 * Simple texture sampling shader that:
 * - Samples texture at interpolated coordinates
 * - Outputs texture color directly
 *
 * Uniforms:
 * - uTexture: Texture sampler (sampler2D)
 *
 * Varyings:
 * - vTexCoord: Texture coordinate from vertex shader
 */
export const DEFAULT_FRAGMENT_SHADER = `
precision mediump float;

// Uniforms
uniform sampler2D uTexture;

// Varyings (from vertex shader)
varying vec2 vTexCoord;

void main() {
  // Sample texture
  vec4 color = texture2D(uTexture, vTexCoord);

  // Output color
  gl_FragColor = color;
}
`.trim();

/**
 * Default shader program configuration
 *
 * Standard configuration used for basic texture rendering.
 */
export const DEFAULT_SHADER_CONFIG = {
	vertex: DEFAULT_VERTEX_SHADER,
	fragment: DEFAULT_FRAGMENT_SHADER,
	attributes: ['aPosition', 'aTexCoord'],
	uniforms: ['uTexture']
} as const;

/**
 * Get shader info for debugging
 *
 * @param shaderSource - Shader source code
 * @returns Shader info object
 */
export function getShaderInfo(shaderSource: string): {
	lines: number;
	attributes: string[];
	uniforms: string[];
	varyings: string[];
} {
	const lines = shaderSource.split('\n').length;
	const attributes: string[] = [];
	const uniforms: string[] = [];
	const varyings: string[] = [];

	// Parse attributes
	const attrRegex = /attribute\s+\w+\s+(\w+);/g;
	let match: RegExpExecArray | null;
	while ((match = attrRegex.exec(shaderSource)) !== null) {
		attributes.push(match[1]);
	}

	// Parse uniforms
	const uniformRegex = /uniform\s+\w+\s+(\w+);/g;
	while ((match = uniformRegex.exec(shaderSource)) !== null) {
		uniforms.push(match[1]);
	}

	// Parse varyings
	const varyingRegex = /varying\s+\w+\s+(\w+);/g;
	while ((match = varyingRegex.exec(shaderSource)) !== null) {
		varyings.push(match[1]);
	}

	return { lines, attributes, uniforms, varyings };
}

/**
 * Validate shader source for common issues
 *
 * Basic validation to catch common mistakes before compilation.
 *
 * @param source - Shader source code
 * @param type - Shader type ('vertex' or 'fragment')
 * @returns Validation result
 */
export function validateShaderSource(
	source: string,
	type: 'vertex' | 'fragment'
): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	// Check for empty source
	if (!source || source.trim().length === 0) {
		errors.push('Shader source is empty');
		return { valid: false, errors };
	}

	// Check for main function
	if (!source.includes('void main()')) {
		errors.push('Shader missing main() function');
	}

	// Check for precision qualifier (required in WebGL)
	if (!source.includes('precision')) {
		errors.push('Shader missing precision qualifier (e.g., precision mediump float;)');
	}

	// Type-specific validation
	if (type === 'vertex') {
		// Vertex shaders must write to gl_Position
		if (!source.includes('gl_Position')) {
			errors.push('Vertex shader must set gl_Position');
		}
	} else if (type === 'fragment') {
		// Fragment shaders must write to gl_FragColor
		if (!source.includes('gl_FragColor')) {
			errors.push('Fragment shader must set gl_FragColor');
		}
	}

	return {
		valid: errors.length === 0,
		errors
	};
}

/**
 * Inject precision qualifier if missing
 *
 * WebGL requires precision qualifiers but they're easy to forget.
 * This helper adds them automatically.
 *
 * @param source - Shader source
 * @returns Source with precision qualifier
 */
export function ensurePrecision(source: string): string {
	if (source.includes('precision')) {
		return source;
	}

	// Add precision qualifier at the top
	return `precision mediump float;\n\n${source}`;
}

/**
 * Strip comments from shader source
 *
 * Useful for size optimization and debugging.
 *
 * @param source - Shader source
 * @returns Source without comments
 */
export function stripComments(source: string): string {
	// Remove single-line comments
	let result = source.replace(/\/\/.*$/gm, '');

	// Remove multi-line comments
	result = result.replace(/\/\*[\s\S]*?\*\//g, '');

	return result;
}

/**
 * Minify shader source
 *
 * Removes unnecessary whitespace to reduce shader size.
 *
 * @param source - Shader source
 * @returns Minified source
 */
export function minifyShader(source: string): string {
	// Strip comments first
	let result = stripComments(source);

	// Remove extra whitespace
	result = result.replace(/\s+/g, ' ');

	// Remove whitespace around operators and punctuation
	result = result.replace(/\s*([(){}\[\],;=+\-*/<>!&|])\s*/g, '$1');

	return result.trim();
}

/**
 * Get shader type name for debugging
 *
 * @param gl - WebGL context
 * @param type - Shader type constant
 * @returns Human-readable type name
 */
export function getShaderTypeName(gl: WebGLRenderingContext, type: number): string {
	switch (type) {
		case gl.VERTEX_SHADER:
			return 'vertex';
		case gl.FRAGMENT_SHADER:
			return 'fragment';
		default:
			return 'unknown';
	}
}
