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

export interface TextureValidationResult {
	valid: boolean;
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

	constructor(gl: WebGLRenderingContext) {
		this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
		console.info(`[WebGLOverlay] Max texture size: ${this.maxTextureSize}x${this.maxTextureSize}`);
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
				reason: `Texture ${width}x${height} exceeds device max ${this.maxTextureSize}`,
				scaled
			};
		}

		// Check memory budget
		const estimatedBytes = width * height * 4; // RGBA = 4 bytes per pixel
		if (this.currentMemoryUsage + estimatedBytes > this.maxMemoryBudget) {
			return {
				valid: false,
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
	 * Set custom memory budget
	 *
	 * Default is 200MB. Adjust based on application needs.
	 *
	 * @param bytes - Memory budget in bytes
	 */
	setMemoryBudget(bytes: number): void {
		this.maxMemoryBudget = bytes;
		console.info(`[WebGLOverlay] Memory budget set to ${this.formatBytes(bytes)}`);
	}

	/**
	 * Get maximum supported texture size for this device
	 *
	 * @returns Max texture dimension (e.g., 8192 means 8192x8192)
	 */
	getMaxTextureSize(): number {
		return this.maxTextureSize;
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
