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
	reason?: string;
	/**
	 * The dimensions to retry at, when shrinking would help.
	 *
	 * Presence is the discriminant: a size failure always carries one and every
	 * caller scales, so a failure *without* one is a budget refusal. There used
	 * to be an explicit `failure: 'size' | 'budget'` beside this, and once
	 * `c94a312` deleted `TEXTURE_TOO_LARGE` its `'size'` arm had no reader —
	 * relabelling it survived the whole suite, as did deleting the branch that
	 * consumed it.
	 */
	scaled?: { width: number; height: number };
	/**
	 * Bytes the refused texture would have cost, as judged.
	 *
	 * Carried because the caller cannot recompute it: when the refusal is about
	 * a *scaled* size, the caller still holds the original dimensions, and the
	 * error used to report those — a figure four times too large for a
	 * half-scale fit.
	 */
	requestedBytes?: number;
}

export interface MemoryUsage {
	used: number;
	budget: number;
	percentage: number;
}

/** What a driver falls back to when it cannot report its own limit. */
const FALLBACK_MAX_TEXTURE_SIZE = 2048;

/** A texture dimension limit, or `undefined` if the value cannot be one. */
function usableLimit(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : undefined;
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
		// Both limits are taken on trust no longer.
		//
		// `Math.min(maxTextureSize, driverMax)` accepted whatever it was given.
		// A consumer passing `-1` sent `scaleToFit` into a recursion that ran
		// ~2480 frames before the stack blew, surfacing as
		// `TEXTURE_CREATION_FAILED: Cannot read properties of undefined`. `0`
		// produced silent 0×0 textures. And a driver answering `undefined`
		// disabled the cap altogether, because `width > undefined` is false for
		// every width.
		const driverMax = usableLimit(gl.getParameter(gl.MAX_TEXTURE_SIZE));
		const requested = maxTextureSize === undefined ? undefined : usableLimit(maxTextureSize);

		if (maxTextureSize !== undefined && requested === undefined) {
			console.warn(
				`[WebGLOverlay] maxTextureSize must be a whole number of pixels of at least 1; ignoring ${maxTextureSize}`
			);
		}

		if (driverMax === undefined) {
			// A driver that cannot report its own limit must not mean "no
			// limit". 2048 is small enough to be safe on anything that runs
			// WebGL at all.
			console.warn(
				'[WebGLOverlay] The driver reported no usable MAX_TEXTURE_SIZE; falling back to 2048'
			);
		}

		const ceiling = driverMax ?? FALLBACK_MAX_TEXTURE_SIZE;

		// The consumer can only narrow: asking for more than the driver allows
		// would produce textures it refuses to allocate.
		this.maxTextureSize = requested === undefined ? ceiling : Math.min(requested, ceiling);

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

			// The budget applies to what would actually be uploaded. Returning
			// here without checking it left the size cap and the budget in a
			// race the size cap always won: an 8MB budget accepted a 512²
			// canvas grown to 8192², scaled to 2048² — 16MB allocated, and
			// `onError` never called. Offering no `scaled` says the caller
			// cannot rescue this by shrinking, because shrinking is what it
			// already tried.
			if (!this.fitsBudget(scaled.width, scaled.height)) {
				return {
					valid: false,
					reason: this.budgetReason(scaled.width, scaled.height),
					requestedBytes: scaled.width * scaled.height * 4
				};
			}

			return {
				valid: false,
				reason: `Texture ${width}x${height} exceeds the ${this.maxTextureSize} limit in force`,
				scaled
			};
		}

		// Check memory budget
		if (!this.fitsBudget(width, height)) {
			return {
				valid: false,
				reason: this.budgetReason(width, height),
				requestedBytes: width * height * 4
			};
		}

		return { valid: true };
	}

	/** Whether a texture of these dimensions fits in what is left of the budget. */
	private fitsBudget(width: number, height: number): boolean {
		return this.currentMemoryUsage + width * height * 4 <= this.maxMemoryBudget;
	}

	private budgetReason(width: number, height: number): string {
		const total = this.currentMemoryUsage + width * height * 4;
		return `Texture would exceed memory budget (${this.formatBytes(total)} > ${this.formatBytes(
			this.maxMemoryBudget
		)})`;
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

		// At least one pixel in each direction. `Math.floor` alone turned an
		// 8192×1 strip into 4096×**0** at a 4096 cap, and a zero-area texture
		// re-validates as *valid* — it costs no bytes, so no budget refuses it.
		// The element then rendered nothing while `onTextureLoaded` fired and
		// `onError` never did.
		return {
			width: Math.max(1, Math.floor(width * scale)),
			height: Math.max(1, Math.floor(height * scale))
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
