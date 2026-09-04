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
		gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
		if (gl) {
			version = 2;
		} else {
			// Fallback to WebGL1
			gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
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

	// Release the probe.
	//
	// This runs once per `createOverlay`, and the context it creates was never
	// freed. Browsers cap live WebGL contexts — around 16 — and force-lose the
	// oldest when the cap is reached, so an app that mounts and unmounts the
	// overlay enough times eventually has its own live context killed by its own
	// support check.
	gl.getExtension('WEBGL_lose_context')?.loseContext();

	// `reason` is omitted rather than set to undefined: it is optional, and the
	// two failure paths above are the only ones that carry a reason.
	return {
		supported: true,
		version
	};
}
