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

/**
 * A refusal the caller can rescue by shrinking.
 *
 * `scaled` is the size to retry at. Every caller does retry, which is why
 * nothing downstream turns this into an error.
 */
export interface TextureTooLarge {
	valid: false;
	scaled: { width: number; height: number };
	requestedBytes?: undefined;
	empty?: undefined;
}

/**
 * A refusal shrinking cannot rescue: the budget is full.
 *
 * `requestedBytes` is what the refused texture would have cost **as judged** —
 * required, not optional, because the caller cannot recompute it. When the
 * refusal is about a *scaled* size the caller still holds the original
 * dimensions, and the error used to report those: a figure four times too large
 * for a half-scale fit. A `?? width * height * 4` fallback covered that, and
 * was structurally unreachable — two dead parameters on `validationError`,
 * created by the commit that removed a third from the same signature for being
 * dead. Making the field required is what removes the fallback for good.
 */
export interface TextureBudgetExceeded {
	valid: false;
	scaled?: undefined;
	requestedBytes: number;
	empty?: undefined;
}

/**
 * A refusal nothing can rescue: the source has no pixels.
 *
 * A `<canvas width=256 height=0>` — a collapsed layout, or a chart before it
 * measures — used to pass as a valid source, because a zero-area texture costs
 * no bytes and no budget refuses it. `onTextureLoaded` fired, `onError` never
 * did, and the element rendered nothing. The one-pixel floor in `scaleToFit`
 * cannot reach this: there is nothing to scale down from.
 *
 * The check lives here rather than at the three creation call sites because
 * this is the one function all of them share, creation and update alike — the
 * first attempt patched `elementSize`, which only the update path uses.
 */
export interface TextureSourceEmpty {
	valid: false;
	scaled?: undefined;
	requestedBytes?: undefined;
	empty: true;
}

/**
 * Why a texture was refused, or that it was not.
 *
 * A union rather than one shape with four optional fields, because the
 * invariant every caller depends on — "a failure without `scaled` is a budget
 * refusal" — was previously a comment, and a comment cannot be narrowed on.
 * That looseness is what let `reason` survive as a write-only field: a
 * human-readable duplicate of the three numbers `memoryBudgetExceeded` already
 * carries, whose only reader was the `TEXTURE_TOO_LARGE` branch `c94a312`
 * deleted. It is the same defect as the `failure` discriminant removed one
 * commit earlier, in the same file, missed because the shape did not force
 * anyone to look.
 */
export type TextureValidationResult =
	| { valid: true; scaled?: undefined; requestedBytes?: undefined; empty?: undefined }
	| TextureTooLarge
	| TextureBudgetExceeded
	| TextureSourceEmpty;

/** A refusal the caller must turn into an error — everything except "retry smaller". */
export type TextureRefusal = TextureBudgetExceeded | TextureSourceEmpty;

export interface MemoryUsage {
	used: number;
	budget: number;
	percentage: number;
}

/** What a driver falls back to when it cannot report its own limit. */
export const FALLBACK_MAX_TEXTURE_SIZE = 2048;

/**
 * A texture dimension limit, or `undefined` if the value cannot be one.
 *
 * Exported because `MAX_TEXTURE_SIZE` has **two** readers and only this one was
 * ever guarded. `DeviceCapabilities` took the driver's answer raw, and
 * `WebGLOverlay` uses that as the default for `options.maxTextureSize` — so an
 * unreadable driver value came back round as though the *consumer* had supplied
 * it, and the warning added here blamed them for it. On mobile it was worse:
 * `Math.min(undefined, 2048)` is `NaN`, stored in a field typed `number` and
 * handed out by `getCapabilities()`.
 */
export function usableLimit(value: unknown): number | undefined {
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
		// A source with no pixels, before anything about limits or budgets. It
		// would otherwise pass every check below — zero area costs zero bytes.
		if (!(width >= 1) || !(height >= 1)) {
			return { valid: false, empty: true };
		}

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
					requestedBytes: scaled.width * scaled.height * 4
				};
			}

			return { valid: false, scaled };
		}

		// Check memory budget
		if (!this.fitsBudget(width, height)) {
			return { valid: false, requestedBytes: width * height * 4 };
		}

		return { valid: true };
	}

	/** Whether a texture of these dimensions fits in what is left of the budget. */
	private fitsBudget(width: number, height: number): boolean {
		return this.currentMemoryUsage + width * height * 4 <= this.maxMemoryBudget;
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
	 * The highest budget percentage already reported, so pressure is announced
	 * when it worsens rather than on every allocation.
	 */
	private warnedMemoryLevel = 0;

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
		if (usage.percentage <= 80) return;

		// Only when the pressure is *worse* than anything already reported.
		//
		// This used to warn on every call above the threshold, and a re-upload
		// calls it twice — `updateTexture` releases the outgoing texture,
		// re-tracks it to validate against the budget, then settles the incoming
		// one. Measured on a 256² canvas at 87% of budget: **21 warnings for 10
		// updates**, which for a `frame`-strategy element is 120 a second.
		//
		// An edge trigger on "crossed 80%" would not have helped: that same
		// release-and-re-track dips the usage to 0% and back on every update, so
		// every update is a fresh crossing. Watching the high-water mark is what
		// survives the accounting, and it still reports growth — 87% then 92%
		// is two lines, because the second says something the first did not.
		const level = Math.round(usage.percentage);
		if (level <= this.warnedMemoryLevel) return;
		this.warnedMemoryLevel = level;

		console.warn(
			`[WebGLOverlay] Memory usage at ${usage.percentage.toFixed(1)}% (${this.formatBytes(usage.used)}/${this.formatBytes(usage.budget)})`
		);
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
