/**
 * The harness, tested.
 *
 * A test double that lies is worse than no double: it makes a wrong assertion
 * pass and a right one fail, and neither is visible in the test that suffers
 * it. The buffer store modelled six things wrongly — none misleading a test at
 * the time, all of them traps for the next one — so the modelling now has to
 * answer for itself here.
 */

import { describe, it, expect } from 'vitest';
import { createFakeGL } from './fake-gl.js';

const quad = () => new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

describe('fake-gl buffer store', () => {
	it('reads bufferSubData offsets as bytes, the way WebGL does', () => {
		const fake = createFakeGL();
		const gl = fake.context;
		const buffer = gl.createBuffer();

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, quad(), gl.STATIC_DRAW);
		// Byte offset 16 is float index 4 — the second half of the quad.
		gl.bufferSubData(gl.ARRAY_BUFFER, 16, new Float32Array([9, 9, 9, 9]));

		expect(Array.from(fake.bufferContents(buffer)!)).toEqual([0, 0, 1, 0, 9, 9, 9, 9]);
	});

	it('accepts a legal offset that the index reading rejected', () => {
		const fake = createFakeGL();
		const gl = fake.context;
		const buffer = gl.createBuffer();

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, quad(), gl.STATIC_DRAW);

		// As a float index this is 28 + 4 > 8 and threw RangeError. As bytes it
		// is the last float, which is what the call means.
		expect(() => gl.bufferSubData(gl.ARRAY_BUFFER, 28, new Float32Array([5]))).not.toThrow();
		expect(fake.bufferContents(buffer)![7]).toBe(5);
	});

	it('refuses a write past the end, and an unaligned offset', () => {
		const fake = createFakeGL();
		const gl = fake.context;
		const buffer = gl.createBuffer();

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, quad(), gl.STATIC_DRAW);

		expect(() => gl.bufferSubData(gl.ARRAY_BUFFER, 24, quad())).toThrow(/past the end/);
		expect(() => gl.bufferSubData(gl.ARRAY_BUFFER, 2, new Float32Array([1]))).toThrow(/not aligned to 4-byte elements/);
	});

	it('refuses bufferSubData before any bufferData', () => {
		const fake = createFakeGL();
		const gl = fake.context;
		const buffer = gl.createBuffer();

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

		// Real GL raises INVALID_OPERATION. Succeeding silently made a missing
		// allocation invisible.
		expect(() => gl.bufferSubData(gl.ARRAY_BUFFER, 0, quad())).toThrow(/INVALID_OPERATION/);
	});

	it('honours the allocate-only form of bufferData', () => {
		const fake = createFakeGL();
		const gl = fake.context;
		const buffer = gl.createBuffer();

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, 32, gl.DYNAMIC_DRAW);

		expect(fake.bufferContents(buffer)).toEqual(new Float32Array(8));

		// And the whole point of allocating: a later sub-upload now lands.
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, quad());
		expect(Array.from(fake.bufferContents(buffer)!)).toEqual([0, 0, 1, 0, 0, 1, 1, 1]);
	});

	it('keeps one binding per target', () => {
		const fake = createFakeGL();
		const gl = fake.context;
		const vertices = gl.createBuffer();
		const indices = gl.createBuffer();

		// Interleaved deliberately: bind both targets *first*, then upload. Bind
		// and upload in lockstep and a single shared `boundArrayBuffer` gives the
		// right answer by accident, because it happens to point at the buffer
		// just bound — which is how the first version of this test passed against
		// the very defect it names.
		gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);

		// GL keeps one binding per target, so ARRAY_BUFFER is still `vertices`.
		gl.bufferData(gl.ARRAY_BUFFER, quad(), gl.STATIC_DRAW);
		// `Uint16Array`, which is what index data actually is. The first version
		// of this test uploaded a `Float32Array` here — the only element type
		// the store recorded — so the assertion below was observable purely by
		// accident of an unrealistic fixture. Interleaving the binds was not
		// enough; the *type* was hiding a second defect underneath.
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([7, 7]), gl.STATIC_DRAW);

		// Non-vacuity before value: a discarded upload reads back as null, and
		// `Array.from(null!)` would throw rather than fail informatively.
		expect(fake.bufferContents(indices), 'the index upload was discarded').not.toBeNull();

		expect(Array.from(fake.bufferContents(vertices)!)).toEqual([0, 0, 1, 0, 0, 1, 1, 1]);
		expect(Array.from(fake.bufferContents(indices)!)).toEqual([7, 7]);
		expect(fake.bufferContents(indices), 'index data came back as floats').toBeInstanceOf(
			Uint16Array
		);
	});

	it('keeps index data uploaded as Uint16Array, and lets it be sub-uploaded', () => {
		// The store held `Float32Array` and dropped everything else in silence.
		// That also made the INVALID_OPERATION guard unreachable for index data,
		// and produced a *false* refusal — "has had no bufferData" — when a
		// Uint16-allocated buffer was later sub-uploaded with floats.
		const fake = createFakeGL();
		const gl = fake.context;
		const indices = gl.createBuffer();

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

		expect(fake.bufferContents(indices), 'the upload was discarded').not.toBeNull();
		expect(Array.from(fake.bufferContents(indices)!)).toEqual([0, 1, 2, 0, 2, 3]);

		// Byte offset 6 is index element 3 for 2-byte elements.
		gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 6, new Uint16Array([9, 9, 9]));
		expect(Array.from(fake.bufferContents(indices)!)).toEqual([0, 1, 2, 9, 9, 9]);
	});

	it('refuses a bufferData size that is not a whole number of bytes', () => {
		const fake = createFakeGL();
		const gl = fake.context;
		gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());

		expect(() => gl.bufferData(gl.ARRAY_BUFFER, -16, gl.STATIC_DRAW)).toThrow(/INVALID_VALUE/);
		expect(() => gl.bufferData(gl.ARRAY_BUFFER, 6.5, gl.STATIC_DRAW)).toThrow(/INVALID_VALUE/);
		expect(() => gl.bufferData(gl.ARRAY_BUFFER, Number.NaN, gl.STATIC_DRAW)).toThrow(
			/INVALID_VALUE/
		);
	});

	it('hands back a copy, so inspecting the store cannot corrupt it', () => {
		const fake = createFakeGL();
		const gl = fake.context;
		const buffer = gl.createBuffer();

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, quad(), gl.STATIC_DRAW);

		fake.bufferContents(buffer)![0] = 999;

		expect(fake.bufferContents(buffer)![0], 'a reader mutated the harness').toBe(0);
	});

	it('counts a redundant delete once, so a double free cannot mask a leak', () => {
		// `free()` checked only the handle kind, never whether it had already
		// been freed, so `live()` could go negative — and a −1 silently absorbs
		// a +1 elsewhere. Real GL ignores a redundant delete.
		const fake = createFakeGL();
		const gl = fake.context;
		const buffer = gl.createBuffer();

		gl.deleteBuffer(buffer);
		gl.deleteBuffer(buffer);
		expect(fake.live('buffer'), 'live() went negative').toBe(0);

		// And the leak it would otherwise have hidden.
		const leaked = gl.createTexture();
		const freed = gl.createTexture();
		gl.deleteTexture(freed);
		gl.deleteTexture(freed);
		void leaked;
		expect(fake.live('texture'), 'a double free cancelled a real leak').toBe(1);
	});

	it('unbinds a deleted buffer, so it cannot be written again', () => {
		const fake = createFakeGL();
		const gl = fake.context;
		const buffer = gl.createBuffer();

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, quad(), gl.STATIC_DRAW);
		gl.deleteBuffer(buffer);

		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 2]), gl.STATIC_DRAW);

		expect(fake.bufferContents(buffer), 'a deleted buffer was repopulated').toBeNull();
	});

	it('unbinds on an explicit null bind', () => {
		const fake = createFakeGL();
		const gl = fake.context;
		const buffer = gl.createBuffer();

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.bufferData(gl.ARRAY_BUFFER, quad(), gl.STATIC_DRAW);

		expect(fake.bufferContents(buffer)).toBeNull();
	});

	it('keeps buffer contents across clearCalls, and scopes a frame with argsFor', () => {
		const fake = createFakeGL();
		const gl = fake.context;
		const buffer = gl.createBuffer();

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, quad(), gl.STATIC_DRAW);

		fake.clearCalls();

		// GL state survives a frame; the observation of it does not. This is how
		// "positioned *this frame*" is expressed.
		expect(fake.bufferContents(buffer)).not.toBeNull();
		expect(fake.argsFor('bufferData')).toEqual([]);

		gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array([3, 3, 3, 3, 3, 3, 3, 3]));
		expect(fake.argsFor('bufferSubData')).toHaveLength(1);
	});
});
