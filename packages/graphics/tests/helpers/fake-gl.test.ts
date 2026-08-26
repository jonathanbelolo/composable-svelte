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
		expect(() => gl.bufferSubData(gl.ARRAY_BUFFER, 2, new Float32Array([1]))).toThrow(
			/not float-aligned/
		);
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
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Float32Array([7, 7]), gl.STATIC_DRAW);

		expect(Array.from(fake.bufferContents(vertices)!)).toEqual([0, 0, 1, 0, 0, 1, 1, 1]);
		expect(Array.from(fake.bufferContents(indices)!)).toEqual([7, 7]);
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
