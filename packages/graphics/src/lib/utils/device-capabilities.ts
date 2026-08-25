/**
 * Device Capabilities Detection
 *
 * Detects device type and sets platform-specific performance targets.
 *
 * Mobile devices have lower limits:
 * - Smaller max texture sizes (2048 vs 8192)
 * - Lower recommended FPS (30 vs 60)
 * - Fewer recommended elements (10 vs 50)
 * - Slower GPUs and less memory
 */

import { noDebug, type DebugLog } from './debug.js';

export interface DeviceInfo {
	isMobile: boolean;
	isIOS: boolean;
	isAndroid: boolean;
	platform: 'iOS' | 'Android' | 'Desktop';
	maxTextureSize: number;
	recommendedFPS: number;
	recommendedMaxElements: number;
	supportsWebGL2: boolean;
}

export class DeviceCapabilities {
	readonly isMobile: boolean;
	readonly isIOS: boolean;
	readonly isAndroid: boolean;
	readonly platform: 'iOS' | 'Android' | 'Desktop';
	readonly maxTextureSize: number;
	readonly recommendedFPS: number;
	readonly recommendedMaxElements: number;
	readonly supportsWebGL2: boolean;

	constructor(gl: WebGLRenderingContext, private log: DebugLog = noDebug) {
		const ua = navigator.userAgent;

		// Detect platform
		this.isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
		this.isIOS = /iPhone|iPad|iPod/i.test(ua);
		this.isAndroid = /Android/i.test(ua);

		if (this.isIOS) {
			this.platform = 'iOS';
		} else if (this.isAndroid) {
			this.platform = 'Android';
		} else {
			this.platform = 'Desktop';
		}

		// Get device max texture size
		const deviceMaxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

		// Check WebGL2 support
		const testCanvas = document.createElement('canvas');
		this.supportsWebGL2 = !!testCanvas.getContext('webgl2');

		// Set conservative limits for mobile
		if (this.isMobile) {
			// Mobile devices often report 4096 but we cap at 2048 for safety and performance
			this.maxTextureSize = Math.min(deviceMaxTextureSize, 2048);
			this.recommendedFPS = 30; // Conservative for battery life
			this.recommendedMaxElements = 10; // Fewer elements on mobile
		} else {
			this.maxTextureSize = deviceMaxTextureSize;
			this.recommendedFPS = 60; // Full 60 FPS on desktop
			this.recommendedMaxElements = 50; // More elements on desktop
		}

		this.logCapabilities();
	}

	/**
	 * Log device capabilities to console
	 */
	private logCapabilities(): void {
		this.log('[WebGLOverlay] Device capabilities:', {
			isMobile: this.isMobile,
			platform: this.platform,
			maxTextureSize: this.maxTextureSize,
			recommendedFPS: this.recommendedFPS,
			recommendedMaxElements: this.recommendedMaxElements,
			webGL2: this.supportsWebGL2
		});
	}

	/**
	 * Get device info as plain object
	 *
	 * Useful for logging or analytics
	 *
	 * @returns Device information object
	 */
	getDeviceInfo(): DeviceInfo {
		return {
			isMobile: this.isMobile,
			isIOS: this.isIOS,
			isAndroid: this.isAndroid,
			platform: this.platform,
			maxTextureSize: this.maxTextureSize,
			recommendedFPS: this.recommendedFPS,
			recommendedMaxElements: this.recommendedMaxElements,
			supportsWebGL2: this.supportsWebGL2
		};
	}
}
