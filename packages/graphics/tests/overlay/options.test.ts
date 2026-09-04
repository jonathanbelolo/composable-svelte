/**
 * Options a consumer can pass must reach something.
 *
 * `OverlayOptions` is documented and reachable, and nothing in the repo passes
 * any of it — `examples/shader-gallery` renders `<WebGLOverlay />` bare — so
 * every field here was exercised by exactly zero code before these tests.
 *
 * And for two of them, by exactly zero code afterwards either. The
 * `maxTextureSize` and `memoryBudget` describes below construct a
 * `TextureValidator` directly, so they proved that class's arithmetic — which
 * was never broken — while the one line the fix actually changed,
 * `new TextureValidator(gl)` discarding both values in `TextureFactory`, could
 * be restored with the whole suite still green. The unit tests are kept; the
 * plumbing has its own describe now, and that is the one that bites.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createOverlay } from '../../src/lib/overlay/webgl-overlay.js';
import { TextureValidator } from '../../src/lib/utils/texture-validator.js';
import { OverlayErrorCode } from '../../src/lib/utils/overlay-error.js';
import type { OverlayContextAPI, OverlayOptions } from '../../src/lib/overlay/overlay-types.js';
import {
	createFakeGL,
	installFakeGL,
	installFakeObservers,
	type FakeGL
} from '../helpers/fake-gl.js';

let undo: Array<() => void> = [];
afterEach(() => {
	undo.forEach((fn) => fn());
	undo = [];
	vi.restoreAllMocks();
});

function overlay(options: OverlayOptions = {}): { fake: FakeGL; api: OverlayContextAPI } {
	const fake = createFakeGL();
	undo.push(installFakeGL(fake), installFakeObservers());
	const api = createOverlay(options);
	if (!('destroy' in api)) throw new Error(`overlay failed to initialise: ${String(api)}`);
	return { fake, api };
}

function loadedImage(width = 64, height = 64): HTMLImageElement {
	const img = document.createElement('img');
	Object.defineProperty(img, 'complete', { value: true });
	Object.defineProperty(img, 'naturalWidth', { value: width });
	Object.defineProperty(img, 'naturalHeight', { value: height });
	return img;
}

describe('maxTextureSize', () => {
	it('rejects a texture larger than the limit the consumer set', () => {
		// The option was read only to interpolate into an error *message*, after
		// the driver's `MAX_TEXTURE_SIZE` had already decided pass or fail. So
		// passing 512 did not reject a 1024px texture; it only made the text lie
		// on the occasions some other limit tripped.
		const fake = createFakeGL();
		const validator = new TextureValidator(fake.context, 512);

		const result = validator.validateSize(1024, 1024);

		expect(result.valid, 'a 1024px texture passed a 512px limit').toBe(false);
	});

	it('still accepts one within it', () => {
		const fake = createFakeGL();
		const validator = new TextureValidator(fake.context, 512);

		expect(validator.validateSize(256, 256).valid).toBe(true);
	});

	it('cannot be used to exceed what the driver allows', () => {
		// The option can only narrow. Asking for more than the driver's own
		// maximum would produce textures it refuses to allocate, so the request
		// is clamped rather than honoured — and the fake reports 4096.
		// The budget is raised out of the way deliberately: 8192² × 4 bytes is
		// 268MB, over the 200MB default, so with the default budget this fails
		// for the wrong reason and passes whether the clamp is there or not.
		const fake = createFakeGL();
		const validator = new TextureValidator(fake.context, 8192, 1024 * 1024 * 1024);

		expect(
			validator.validateSize(8192, 8192).valid,
			'an 8192px texture passed a 4096px driver limit'
		).toBe(false);
	});

	it('falls back to the driver limit when the consumer sets none', () => {
		// The fake reports 4096 for MAX_TEXTURE_SIZE.
		const fake = createFakeGL();
		const validator = new TextureValidator(fake.context);

		expect(validator.validateSize(2048, 2048).valid).toBe(true);
		expect(validator.validateSize(8192, 8192).valid).toBe(false);
	});
});

describe('the options reach the validator the overlay builds', () => {
	// The describes above test `TextureValidator`. These test that a consumer's
	// values arrive at one — through `createOverlay`, which is the only route
	// that existed to break.
	const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

	it('scales a registration down to the maxTextureSize the consumer set', async () => {
		const { api } = overlay({ maxTextureSize: 512 });

		api.registerElement('a', loadedImage(1024, 1024), {
			type: 'image',
			shader: 'wave-gentle-horizontal'
		});
		await settle();

		expect(api.getElement('a')?.width, 'the 512px limit never reached the validator').toBe(512);
		api.destroy();
	});

	it('leaves the same registration at full size when no limit is given', async () => {
		// The paired half: the driver reports 4096, so 1024 passes untouched.
		const { api } = overlay();

		api.registerElement('a', loadedImage(1024, 1024), {
			type: 'image',
			shader: 'wave-gentle-horizontal'
		});
		await settle();

		expect(api.getElement('a')?.width, 'something scaled a texture nobody limited').toBe(1024);
		api.destroy();
	});

	it('refuses a registration over the memoryBudget the consumer set', async () => {
		const onError = vi.fn();
		const { api } = overlay({ memoryBudget: 1024 * 1024, onError });

		// 1024×1024×4 = 4MB, over a 1MB budget.
		api.registerElement('a', loadedImage(1024, 1024), {
			type: 'image',
			shader: 'wave-gentle-horizontal'
		});
		await settle();

		expect(onError, 'the budget never reached the validator').toHaveBeenCalledTimes(1);
		expect(api.getElement('a')?.texture, 'a texture was created over budget').toBeUndefined();
		api.destroy();
	});

	it('admits the same registration under the default budget', async () => {
		const onError = vi.fn();
		const { api } = overlay({ onError });

		api.registerElement('a', loadedImage(1024, 1024), {
			type: 'image',
			shader: 'wave-gentle-horizontal'
		});
		await settle();

		expect(onError, 'a 4MB texture was refused by the 200MB default').not.toHaveBeenCalled();
		expect(api.getElement('a')?.texture).toBeDefined();
		api.destroy();
	});
});

describe('memoryBudget', () => {
	it('refuses a texture that would exceed the budget the consumer set', () => {
		// `memoryBudget` was stored on `TextureFactory` and never read again; the
		// real budget was a hard-coded 200MB inside `TextureValidator`, whose
		// only setter had zero callers anywhere.
		const fake = createFakeGL();
		const validator = new TextureValidator(fake.context, 4096, 1024 * 1024);

		// 1024×1024×4 bytes = 4MB, over a 1MB budget.
		expect(validator.validateSize(1024, 1024).valid).toBe(false);
	});

	it('allows one that fits', () => {
		const fake = createFakeGL();
		const validator = new TextureValidator(fake.context, 4096, 1024 * 1024);

		// 64×64×4 = 16KB.
		expect(validator.validateSize(64, 64).valid).toBe(true);
	});
});

describe('onError', () => {
	it('reports a texture that could not be created', async () => {
		// `registerElement` returns synchronously and the texture resolves later,
		// so the failure arrives through `onError` rather than the return value.
		// The first draft of this test asserted on the return and failed for that
		// reason, not for the one it was written for.
		const onError = vi.fn();
		const { api } = overlay({ onError });

		api.registerElement('a', document.createElement('img'), {
			type: 'image',
			shader: 'wave-gentle-horizontal'
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(onError, 'an unloadable image reported nothing to the consumer').toHaveBeenCalled();
		api.destroy();
	});

	it('does not fire for an element that registers cleanly', async () => {
		const onError = vi.fn();
		const { api } = overlay({ onError });

		api.registerElement('a', loadedImage(), { type: 'image', shader: 'wave-gentle-horizontal' });
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(onError, 'a clean registration reported an error').not.toHaveBeenCalled();
		api.destroy();
	});
});

describe('handleContextLoss', () => {
	it('still reports a loss to the consumer when recovery is disabled', async () => {
		// The callbacks lived *inside* the block the flag disables, so setting it
		// false — which is exactly what someone intending to handle loss
		// themselves would do — silently removed the notification they need. The
		// flag means "do not recover for me", not "do not tell me".
		const onContextLost = vi.fn();
		const onContextRestored = vi.fn();
		const { fake, api } = overlay({
			handleContextLoss: false,
			onContextLost,
			onContextRestored
		});
		const canvas = fake.canvas!;

		canvas.dispatchEvent(new Event('webglcontextlost'));
		canvas.dispatchEvent(new Event('webglcontextrestored'));

		expect(onContextLost, 'the consumer was never told the context was lost').toHaveBeenCalled();
		expect(onContextRestored, 'nor that it came back').toHaveBeenCalled();
		api.destroy();
	});

	it('does not recover on its own when recovery is disabled', () => {
		// The paired half, and the flag's actual job: no rebuild.
		const { fake, api } = overlay({ handleContextLoss: false });
		const canvas = fake.canvas!;
		const builtBefore = fake.created('buffer');

		canvas.dispatchEvent(new Event('webglcontextlost'));
		canvas.dispatchEvent(new Event('webglcontextrestored'));

		expect(
			fake.created('buffer'),
			'handleContextLoss: false rebuilt the resources anyway'
		).toBe(builtBefore);
		api.destroy();
	});

	it('does recover when left at its default', () => {
		const { fake, api } = overlay({});
		const canvas = fake.canvas!;
		const builtBefore = fake.created('buffer');

		canvas.dispatchEvent(new Event('webglcontextlost'));
		canvas.dispatchEvent(new Event('webglcontextrestored'));

		expect(fake.created('buffer'), 'the default stopped recovering').toBeGreaterThan(builtBefore);
		api.destroy();
	});
});
