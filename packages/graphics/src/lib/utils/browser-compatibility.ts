/**
 * Browser Compatibility Layer
 *
 * Detects browser type and handles browser-specific WebGL quirks.
 *
 * Different browsers have subtle WebGL differences:
 * - Safari: Stricter CORS, different texture filtering
 * - Firefox: Different extension support
 * - Edge: Chromium-based but some differences
 */

export type BrowserType = 'chrome' | 'firefox' | 'safari' | 'edge' | 'unknown';

export interface BrowserInfo {
	browser: BrowserType;
	version: number;
	needsCORSWorkaround: boolean;
	supportsRequestVideoFrameCallback: boolean;
}

export class BrowserCompatibility {
	readonly browser: BrowserType;
	readonly version: number;

	constructor() {
		const ua = navigator.userAgent;

		// Detect browser type and version
		if (ua.includes('Edg/')) {
			this.browser = 'edge';
			this.version = parseInt(ua.match(/Edg\/(\d+)/)?.[1] || '0');
		} else if (ua.includes('Chrome/')) {
			this.browser = 'chrome';
			this.version = parseInt(ua.match(/Chrome\/(\d+)/)?.[1] || '0');
		} else if (ua.includes('Firefox/')) {
			this.browser = 'firefox';
			this.version = parseInt(ua.match(/Firefox\/(\d+)/)?.[1] || '0');
		} else if (ua.includes('Safari/')) {
			this.browser = 'safari';
			this.version = parseInt(ua.match(/Version\/(\d+)/)?.[1] || '0');
		} else {
			this.browser = 'unknown';
			this.version = 0;
		}

		this.logBrowserInfo();
	}

	/**
	 * Log browser information to console
	 */
	logBrowserInfo(): void {
		console.info('[WebGLOverlay] Browser:', {
			browser: this.browser,
			version: this.version,
			needsCORSWorkaround: this.needsCORSWorkaround(),
			supportsRequestVideoFrameCallback: this.supportsRequestVideoFrameCallback()
		});
	}

	/**
	 * Check if browser needs CORS workaround
	 *
	 * Safari is stricter with CORS than other browsers.
	 * Images without proper CORS headers will taint the canvas.
	 *
	 * @returns true if browser needs extra CORS handling
	 */
	needsCORSWorkaround(): boolean {
		return this.browser === 'safari';
	}

	/**
	 * Check if requestVideoFrameCallback is supported
	 *
	 * Chrome 83+, Edge 83+ support this API for efficient video frame updates.
	 * Firefox and Safari don't support it yet.
	 *
	 * @returns true if requestVideoFrameCallback is available
	 */
	supportsRequestVideoFrameCallback(): boolean {
		return 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
	}

	/**
	 * Get texture filtering hint for this browser
	 *
	 * Safari benefits from anisotropic filtering extension.
	 *
	 * @returns Extension constant or null
	 */
	getTextureFilteringHint(): number | null {
		if (this.browser === 'safari') {
			// WEBKIT_TEXTURE_FILTER_ANISOTROPIC_EXT
			return 0x84fe;
		}
		return null;
	}

	/**
	 * Check if browser supports WebGL extensions
	 *
	 * @param gl - WebGL context
	 * @param extension - Extension name
	 * @returns true if extension is supported
	 */
	supportsExtension(gl: WebGLRenderingContext, extension: string): boolean {
		return gl.getExtension(extension) !== null;
	}

	/**
	 * Get list of supported WebGL extensions
	 *
	 * @param gl - WebGL context
	 * @returns Array of extension names
	 */
	getSupportedExtensions(gl: WebGLRenderingContext): string[] {
		return gl.getSupportedExtensions() || [];
	}

	/**
	 * Check if browser has known WebGL issues
	 *
	 * @returns true if known issues exist
	 */
	hasKnownIssues(): boolean {
		// Safari versions < 14 had WebGL stability issues
		if (this.browser === 'safari' && this.version < 14) {
			return true;
		}

		// Old Firefox versions had performance issues
		if (this.browser === 'firefox' && this.version < 80) {
			return true;
		}

		return false;
	}

	/**
	 * Get recommended workarounds for this browser
	 *
	 * @returns Array of workaround descriptions
	 */
	getRecommendedWorkarounds(): string[] {
		const workarounds: string[] = [];

		if (this.browser === 'safari') {
			workarounds.push('Ensure all images have crossOrigin="anonymous" attribute');
			workarounds.push('Use anisotropic filtering extension for better texture quality');
		}

		if (this.browser === 'firefox' && this.version < 90) {
			workarounds.push('Reduce texture updates for better performance');
		}

		if (this.hasKnownIssues()) {
			workarounds.push('Consider recommending users upgrade their browser');
		}

		return workarounds;
	}

	/**
	 * Get browser info as plain object
	 *
	 * Useful for logging or analytics
	 *
	 * @returns Browser information object
	 */
	getBrowserInfo(): BrowserInfo {
		return {
			browser: this.browser,
			version: this.version,
			needsCORSWorkaround: this.needsCORSWorkaround(),
			supportsRequestVideoFrameCallback: this.supportsRequestVideoFrameCallback()
		};
	}

	/**
	 * Check if browser is Chromium-based
	 *
	 * Chrome and Edge share Chromium codebase
	 *
	 * @returns true if Chromium-based
	 */
	isChromiumBased(): boolean {
		return this.browser === 'chrome' || this.browser === 'edge';
	}
}
