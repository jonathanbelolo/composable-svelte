/**
 * WebGL Support Detection
 *
 * Simple utility to detect WebGL support and provide graceful degradation.
 *
 * Graceful Degradation Strategy:
 * 1. Check if WebGL is supported
 * 2. If not supported, don't hide original HTML elements
 * 3. Elements render normally without shader effects
 * 4. No error messages shown to users (confusing)
 *
 * This is progressive enhancement - WebGL is an enhancement, not a requirement.
 */

export interface WebGLSupportInfo {
	supported: boolean;
	version: 1 | 2 | null;
	reason?: string;
}

/**
 * Check if WebGL is supported in this browser
 *
 * @returns Support information
 */
export function checkWebGLSupport(): WebGLSupportInfo {
	// Check if browser supports canvas element
	const canvas = document.createElement('canvas');
	if (!canvas) {
		return {
			supported: false,
			version: null,
			reason: 'Canvas element not supported'
		};
	}

	// Try to get WebGL context
	let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
	let version: 1 | 2 | null = null;

	try {
		// Try WebGL2 first
		gl = canvas.getContext('webgl2');
		if (gl) {
			version = 2;
		} else {
			// Fallback to WebGL1
			gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
			if (gl) {
				version = 1;
			}
		}
	} catch (e) {
		return {
			supported: false,
			version: null,
			reason: `WebGL context creation failed: ${e}`
		};
	}

	if (!gl) {
		return {
			supported: false,
			version: null,
			reason: 'WebGL not available (may be disabled or blocked)'
		};
	}

	return {
		supported: true,
		version,
		reason: undefined
	};
}

/**
 * Check if WebGL 2 is supported
 *
 * @returns true if WebGL 2 is supported
 */
export function isWebGL2Supported(): boolean {
	const canvas = document.createElement('canvas');
	return !!canvas.getContext('webgl2');
}

/**
 * Get WebGL context capabilities
 *
 * Returns useful info about what the browser supports.
 *
 * @param gl - WebGL context
 * @returns Capabilities object
 */
export function getWebGLCapabilities(
	gl: WebGLRenderingContext
): Record<string, string | number | boolean> {
	return {
		vendor: gl.getParameter(gl.VENDOR),
		renderer: gl.getParameter(gl.RENDERER),
		version: gl.getParameter(gl.VERSION),
		shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
		maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
		maxTextureImageUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
		maxVertexTextureImageUnits: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
		maxCombinedTextureImageUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
		maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
		maxVaryingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS),
		maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS)
	};
}

/**
 * Log WebGL support info to console
 *
 * Useful for debugging
 */
export function logWebGLSupportInfo(): void {
	const support = checkWebGLSupport();

	if (support.supported) {
		console.info(`[WebGLOverlay] WebGL ${support.version} is supported`);

		// Get capabilities
		const canvas = document.createElement('canvas');
		const gl = canvas.getContext('webgl');
		if (gl) {
			const caps = getWebGLCapabilities(gl);
			console.info('[WebGLOverlay] WebGL capabilities:', caps);
		}
	} else {
		console.warn(`[WebGLOverlay] WebGL not supported: ${support.reason}`);
		console.info('[WebGLOverlay] Falling back to original HTML rendering');
	}
}

/**
 * Get user-friendly message for WebGL not supported
 *
 * @returns Message to show users
 */
export function getUnsupportedMessage(): string {
	return 'Your browser does not support WebGL. Content will be displayed without visual effects.';
}

/**
 * Check if WebGL is likely disabled by user or policy
 *
 * @returns true if likely disabled intentionally
 */
export function isWebGLLikelyDisabled(): boolean {
	const support = checkWebGLSupport();

	if (support.supported) {
		return false;
	}

	// If reason mentions "disabled" or "blocked", it's likely intentional
	if (support.reason) {
		const reason = support.reason.toLowerCase();
		return reason.includes('disabled') || reason.includes('blocked');
	}

	return false;
}
