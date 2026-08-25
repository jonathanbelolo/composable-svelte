/**
 * Texture Size Validator
 *
 * Validates texture dimensions against device limits and memory budgets.
 *
 * Different devices have different max texture sizes:
 * - Desktop: Typically 8192x8192 or 16384x16384
 * - Mobile: Often 2048x2048 or 4096x4096
 *
 * Exceeding limits causes silent failures - textures won't render.
 */

import { noDebug, type DebugLog } from './debug.js';

export interface TextureValidationResult {
	valid: boolean;
	/**
	 * Which limit refused it.
	 *
	 * Callers used to have only `reason`, a human string, so every failure here
	 * became `OverlayError.textureTooLarge` — including the ones caused by
	 * `memoryBudget`. A consumer who set a budget and hit it was told the
	 * texture exceeded the *device* maximum and advised to reduce image size,
	 * while `OverlayError.memoryBudgetExceeded` sat with no callers.
	 */
	failure?: 'size' | 'budget';
	reason?: string;
	scaled?: { width: number; height: number };
}

export interface MemoryUsage {
	used: number;
	budget: number;
	percentage: number;
}

export class TextureValidator {
	private maxTextureSize: number;
	private maxMemoryBudget = 200 * 1024 * 1024; // 200MB default
	private currentMemoryUsage = 0;

	/**
	 * @param gl - the context, for the driver's own maximum
	 * @param maxTextureSize - a lower cap from `OverlayOptions`; the driver limit
	 *   still applies, so this can only narrow
	 * @param memoryBudget - a cap from `OverlayOptions`, in bytes
	 *
	 * Both were consumer-facing options that reached nothing. `maxTextureSize`
	 * was read only to interpolate into an error *message*, after this class had
	 * already decided pass or fail from the driver value — so passing 512 did
	 * not reject a 1024px texture, it only made the text lie. `memoryBudget` was
	 * stored on `TextureFactory` and never read again, while the real budget was
	 * the hard-coded default below, whose only setter had zero callers.
	 */
	constructor(
		gl: WebGLRenderingContext,
		maxTextureSize?: number,
		memoryBudget?: number,
		private log: DebugLog = noDebug
	) {
		const driverMax = gl.getParameter(gl.MAX_TEXTURE_SIZE);

		// The consumer can only narrow: asking for more than the driver allows
		// would produce textures it refuses to allocate.
		this.maxTextureSize =
			maxTextureSize !== undefined ? Math.min(maxTextureSize, driverMax) : driverMax;

		if (memoryBudget !== undefined) {
			this.maxMemoryBudget = memoryBudget;
		}

		this.log(`[WebGLOverlay] Max texture size: ${this.maxTextureSize}x${this.maxTextureSize}`);
	}

	/**
	 * Validate texture dimensions
	 *
	 * Checks if texture size is within device limits and memory budget.
	 * If oversized, provides scaled dimensions that fit within limits.
	 *
	 * @param width - Texture width in pixels
	 * @param height - Texture height in pixels
	 * @returns Validation result with optional scaled dimensions
	 */
	validateSize(width: number, height: number): TextureValidationResult {
		// Check individual dimensions
		if (width > this.maxTextureSize || height > this.maxTextureSize) {
			const scaled = this.scaleToFit(width, height);
			return {
				valid: false,
				failure: 'size',
				reason: `Texture ${width}x${height} exceeds device max ${this.maxTextureSize}`,
				scaled
			};
		}

		// Check memory budget
		const estimatedBytes = width * height * 4; // RGBA = 4 bytes per pixel
		if (this.currentMemoryUsage + estimatedBytes > this.maxMemoryBudget) {
			return {
				valid: false,
				failure: 'budget',
				reason: `Texture would exceed memory budget (${this.formatBytes(
					this.currentMemoryUsage + estimatedBytes
				)} > ${this.formatBytes(this.maxMemoryBudget)})`
			};
		}

		return { valid: true };
	}

	/**
	 * Scale dimensions to fit within device limits
	 *
	 * Maintains aspect ratio while ensuring both dimensions fit.
	 * Never upscales - only downscales if needed.
	 *
	 * @param width - Original width
	 * @param height - Original height
	 * @returns Scaled dimensions
	 */
	scaleToFit(width: number, height: number): { width: number; height: number } {
		const scale = Math.min(
			this.maxTextureSize / width,
			this.maxTextureSize / height,
			1 // Don't upscale
		);

		return {
			width: Math.floor(width * scale),
			height: Math.floor(height * scale)
		};
	}

	/**
	 * Track texture memory allocation
	 *
	 * Call this after successfully creating a texture.
	 *
	 * @param width - Texture width
	 * @param height - Texture height
	 */
	trackAllocation(width: number, height: number): void {
		const bytes = width * height * 4; // RGBA
		this.currentMemoryUsage += bytes;

		const usage = this.getMemoryUsage();
		if (usage.percentage > 80) {
			console.warn(
				`[WebGLOverlay] Memory usage at ${usage.percentage.toFixed(1)}% (${this.formatBytes(usage.used)}/${this.formatBytes(usage.budget)})`
			);
		}
	}

	/**
	 * Track texture memory deallocation
	 *
	 * Call this when deleting a texture.
	 *
	 * @param width - Texture width
	 * @param height - Texture height
	 */
	trackDeallocation(width: number, height: number): void {
		const bytes = width * height * 4; // RGBA
		this.currentMemoryUsage = Math.max(0, this.currentMemoryUsage - bytes);
	}

	/**
	 * Get current memory usage statistics
	 *
	 * @returns Memory usage information
	 */
	getMemoryUsage(): MemoryUsage {
		return {
			used: this.currentMemoryUsage,
			budget: this.maxMemoryBudget,
			percentage: (this.currentMemoryUsage / this.maxMemoryBudget) * 100
		};
	}



	/**
	 * Format bytes to human-readable string
	 *
	 * @param bytes - Number of bytes
	 * @returns Formatted string (e.g., "12.5 MB")
	 */
	private formatBytes(bytes: number): string {
		const units = ['B', 'KB', 'MB', 'GB'];
		let size = bytes;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}

		return `${size.toFixed(1)} ${units[unitIndex]}`;
	}
}
