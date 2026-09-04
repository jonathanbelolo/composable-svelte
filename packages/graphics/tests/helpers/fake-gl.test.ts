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

	it('reads an allocated buffer back as raw bytes until something names a type', () => {
		// This used to assert `Float32Array(8)` from a 32-byte allocation — 32
		// bytes and floats being the one combination where the hardcoded default
		// was accidentally right, which is why the fixture never caught it. A
		// byte count states a size and nothing else.
		const fake = createFakeGL();
		const gl = fake.context;
		const buffer = gl.createBuffer();

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, 32, gl.DYNAMIC_DRAW);

		expect(fake.bufferContents(buffer)).toEqual(new Uint8Array(32));
	});

	it('learns the element type from the first sub-upload', () => {
		// The case the old default made impossible. Six bytes is not a whole
		// number of floats, so `bufferContents` built a `Float32Array` over them
		// and threw `RangeError` — on a sequence real GL performs without
		// complaint, and the obvious one for an index buffer.
		const fake = createFakeGL();
		const gl = fake.context;
		const buffer = gl.createBuffer();

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, 6, gl.STATIC_DRAW);
		gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, new Uint16Array([0, 1, 2]));

		const contents = fake.bufferContents(buffer);
		expect(contents).toBeInstanceOf(Uint16Array);
		expect(Array.from(contents!)).toEqual([0, 1, 2]);
	});

	it('still reads a float buffer back as floats', () => {
		// The ordinary path, kept: the fix must not have made the common case
		// worse, and this is the assertion the old fixture was really making.
		const fake = createFakeGL();
		const gl = fake.context;
		const buffer = gl.createBuffer();

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, 32, gl.DYNAMIC_DRAW);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, quad());

		expect(fake.bufferContents(buffer)).toBeInstanceOf(Float32Array);
		expect(Array.from(fake.bufferContents(buffer)!)).toEqual([0, 0, 1, 0, 0, 1, 1, 1]);
	});

	it('says so when the bytes do not divide into whole elements', () => {
		// If a type is named and the size contradicts it, that is worth a
		// sentence rather than a bare `RangeError` from a constructor.
		const fake = createFakeGL();
		const gl = fake.context;
		const buffer = gl.createBuffer();

		// Six bytes, then told they are floats. Four of the six are written and
		// the type is learned from that write, so the buffer holds six bytes of a
		// four-byte type — which is the contradiction.
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, 6, gl.STATIC_DRAW);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array([1]));

		expect(() => fake.bufferContents(buffer)).toThrow(/whole number of/);
	});

	describe('the sources WebGL actually accepts', () => {
		// `BufferSource` is a typed array, a `DataView` **or** a bare
		// `ArrayBuffer`. The fake matched only the first, so the other two fell
		// through every branch: `bufferData` stored nothing and the next call
		// blamed the caller for never uploading, and a `DataView` handed to
		// `bufferSubData` was skipped in silence — a write that did not happen,
		// reported as a success.
		const upload = (data: unknown) => {
			const fake = createFakeGL();
			const gl = fake.context;
			const buffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.bufferData(gl.ARRAY_BUFFER, data as never, gl.STATIC_DRAW);
			return { fake, gl, buffer };
		};

		it('stores a bare ArrayBuffer', () => {
			const { fake, buffer } = upload(new Uint8Array([1, 2, 3, 4]).buffer);

			expect(fake.bufferContents(buffer)).toEqual(new Uint8Array([1, 2, 3, 4]));
		});

		it('does not then claim the buffer was never uploaded', () => {
			// The false accusation, from the caller's side.
			const { gl, fake, buffer } = upload(new Uint8Array([0, 0, 0, 0]).buffer);

			expect(() => gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Uint8Array([9, 9]))).not.toThrow();
			expect(Array.from(fake.bufferContents(buffer)!)).toEqual([9, 9, 0, 0]);
		});

		it('writes through a DataView instead of ignoring it', () => {
			const { gl, fake, buffer } = upload(new Uint8Array([0, 0, 0, 0]));
			const view = new DataView(new Uint8Array([7, 7]).buffer);

			gl.bufferSubData(gl.ARRAY_BUFFER, 0, view as never);

			expect(
				Array.from(fake.bufferContents(buffer)!),
				'the DataView write was skipped and the old contents reported as current'
			).toEqual([7, 7, 0, 0]);
		});

		it('refuses something that is not a BufferSource at all, by name', () => {
			const fake = createFakeGL();
			const gl = fake.context;
			const buffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

			expect(() => gl.bufferData(gl.ARRAY_BUFFER, 'nonsense' as never, gl.STATIC_DRAW)).toThrow(
				/neither a byte count nor a BufferSource/
			);
		});

		it('refuses it on the sub-upload path too, not just the first', () => {
			// Both paths, because a fix that lands on one and not its twin is the
			// mistake this campaign keeps making.
			const { gl } = upload(new Float32Array([1, 2, 3, 4]));

			expect(() => gl.bufferSubData(gl.ARRAY_BUFFER, 0, 42 as never)).toThrow(
				/not a BufferSource/
			);
		});
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

describe('a buffer told two different element types', () => {
	// Found by a hostile review of the commit that introduced the type tracking,
	// which never tested the case where two uploads disagree.
	it('reads back as the type of the most recent upload', () => {
		// A buffer is bytes to the driver; the element type is a convenience this
		// harness offers, so the question is only which answer misleads least.
		// Preferring the *first* type read the new bytes through the old lens:
		// `[9, 9, 9, 9]` written as `Uint16` came back
		// `[8.265320771080998e-40, 8.265320771080998e-40]`.
		const fake = createFakeGL();
		const gl = fake.context;
		const buffer = gl.createBuffer();

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 2]), gl.STATIC_DRAW);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Uint16Array([9, 9, 9, 9]));

		const contents = fake.bufferContents(buffer);
		expect(contents).toBeInstanceOf(Uint16Array);
		expect(Array.from(contents!)).toEqual([9, 9, 9, 9]);
	});

	it('keeps the type it knows when an upload carries none', () => {
		// A `DataView` states no element type, so it must not erase the one the
		// buffer already had — the failure mode the other direction.
		const fake = createFakeGL();
		const gl = fake.context;
		const buffer = gl.createBuffer();

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Uint16Array([1, 2, 3, 4]), gl.STATIC_DRAW);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, new DataView(new Uint8Array([5, 0]).buffer) as never);

		expect(fake.bufferContents(buffer)).toBeInstanceOf(Uint16Array);
	});
});

describe('the refusal names what it was given', () => {
	// `describeValue` shapes every refusal message and nothing asserted its
	// output — so a change that made every message read "a undefined" would have
	// passed the arms above, which match only the fixed half of the sentence.
	it.each([
		['a string', 'nonsense', 'a String'],
		['a function', () => {}, 'a Function'],
		['null', null, 'null'],
		['undefined', undefined, 'undefined'],
		['a null-prototype object', Object.create(null), 'an object with no constructor']
	])('names %s', (_label, value, expected) => {
		const fake = createFakeGL();
		const gl = fake.context;
		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

		expect(() => gl.bufferData(gl.ARRAY_BUFFER, value as never, gl.STATIC_DRAW)).toThrow(
			new RegExp(`given ${expected},`)
		);
	});
});
