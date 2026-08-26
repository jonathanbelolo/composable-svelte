/**
 * A headless `WebGLRenderingContext` for the overlay subsystem.
 *
 * `NullEngine` covers the Babylon half of this package, but the overlay talks
 * to raw WebGL and has no equivalent — which is a large part of why ~6,700
 * lines shipped with no tests. This is the seam: a stub that records what was
 * asked of it, installed by overriding `HTMLCanvasElement.prototype.getContext`
 * so the code under test reaches it the way it reaches a real context.
 *
 * The counters are the point. Every severe finding in this subsystem is a
 * resource that is created and never released, so `created - deleted` per
 * resource kind turns each one into a plain equality:
 *
 * | pair | proves |
 * |---|---|
 * | `createTexture` / `deleteTexture` | a texture orphaned when unregister races async creation |
 * | `createProgram` / `deleteProgram` | `releaseProgram` having no callers |
 * | `createBuffer` / `deleteBuffer` | resources abandoned on context recreation |
 */

/** A distinguishable stand-in for a `WebGLTexture`, `WebGLProgram`, etc. */
interface Handle {
	readonly kind: string;
	readonly id: number;
	/** Uniform locations carry their name, so a write can be attributed to one. */
	readonly name?: string;
}

export interface FakeGL {
	/** How many of a kind are outstanding: created minus deleted. */
	live(kind: 'texture' | 'program' | 'shader' | 'buffer'): number;
	/** Total ever created, so a test can tell "never made" from "made and freed". */
	created(kind: 'texture' | 'program' | 'shader' | 'buffer'): number;
	/** Names of methods called, in order — for asserting a sequence. */
	calls: string[];
	/** The object handed to the code under test. */
	context: WebGLRenderingContext;
	/** The canvas this context was handed to, once `getContext` has been called. */
	canvas: HTMLCanvasElement | null;
	/** How many times `drawArrays` has been called. */
	drawCalls(): number;
	/**
	 * The last value written to each uniform, by name.
	 *
	 * A uniform the linked program does not declare has no location, so a write
	 * to it never arrives here — which is the point: it is the difference
	 * between "the value is in the shader object" and "the value reached GL".
	 */
	uniforms(): Map<string, unknown>;
	/**
	 * Forget recorded calls, uniform writes and draws.
	 *
	 * Observations only. Resource counters and buffer contents are *GL state*,
	 * and GL state survives a frame — clearing it here would model a device that
	 * forgets its own buffers. "The quad was positioned **this frame**" is
	 * therefore `argsFor('bufferSubData')` after a `clearCalls()`, not a
	 * `bufferContents` that went blank.
	 */
	clearCalls(): void;
	/**
	 * Every call, with its arguments, in order.
	 *
	 * `calls` records names alone, which made `bindBuffer` and
	 * `vertexAttribPointer` indistinguishable from each other no matter what a
	 * test asserted — so a swapped or duplicated vertex-attribute binding, or a
	 * quad never positioned at all, could not be observed. Four such mutations
	 * survived the whole suite.
	 */
	records: ReadonlyArray<{ name: string; args: unknown[] }>;
	/** Calls to one method, with arguments. */
	argsFor(name: string): unknown[][];
	/**
	 * What a buffer handle currently holds, as uploaded — cumulative, and
	 * unaffected by `clearCalls`. See its note for how to scope to one frame.
	 *
	 * Typed as the element type of the last full `bufferData`, so index data
	 * uploaded as `Uint16Array` reads back as `Uint16Array`. A buffer merely
	 * *allocated* by the size-only form reads back as `Float32Array`, since a
	 * byte count implies no type. Always a copy: this used to hand back the live
	 * internal array, so inspecting the store could corrupt it.
	 */
	bufferContents(handle: unknown): TypedArray | null;
}

/**
 * The typed-array types a GL buffer can be filled from.
 *
 * `DataView` is deliberately absent: it has no `BYTES_PER_ELEMENT`, and nothing
 * in this package uploads through one.
 */
type TypedArray =
	| Float32Array
	| Float64Array
	| Int8Array
	| Int16Array
	| Int32Array
	| Uint8Array
	| Uint8ClampedArray
	| Uint16Array
	| Uint32Array;

type TypedArrayCtor = new (buffer: ArrayBufferLike) => TypedArray;

function isTypedArray(value: unknown): value is TypedArray {
	return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

const CONSTANTS: Record<string, number> = {
	TEXTURE_2D: 0x0de1,
	RGBA: 0x1908,
	UNSIGNED_BYTE: 0x1401,
	TEXTURE_MIN_FILTER: 0x2801,
	TEXTURE_MAG_FILTER: 0x2800,
	TEXTURE_WRAP_S: 0x2802,
	TEXTURE_WRAP_T: 0x2803,
	LINEAR: 0x2601,
	CLAMP_TO_EDGE: 0x812f,
	ARRAY_BUFFER: 0x8892,
	ELEMENT_ARRAY_BUFFER: 0x8893,
	STATIC_DRAW: 0x88e4,
	FLOAT: 0x1406,
	TRIANGLE_STRIP: 0x0005,
	COLOR_BUFFER_BIT: 0x4000,
	BLEND: 0x0be2,
	SRC_ALPHA: 0x0302,
	ONE_MINUS_SRC_ALPHA: 0x0303,
	ONE: 1,
	VERTEX_SHADER: 0x8b31,
	FRAGMENT_SHADER: 0x8b30,
	COMPILE_STATUS: 0x8b81,
	LINK_STATUS: 0x8b82,
	VALIDATE_STATUS: 0x8b83,
	ACTIVE_ATTRIBUTES: 0x8b89,
	ACTIVE_UNIFORMS: 0x8b86,
	MAX_TEXTURE_SIZE: 0x0d33,
	TEXTURE0: 0x84c0,
	// `RenderPipeline` passes both of these, and neither was here — so
	// `bufferData`'s usage hint and `drawArrays`' mode were literally
	// `undefined` on every call. Invisible while the harness recorded method
	// names only; the moment it records arguments, it matters.
	DYNAMIC_DRAW: 0x88e8,
	TRIANGLES: 0x0004
};

/** GLSL comments, blanked so declarations inside them are not found. */
function stripGlslComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/** Values `getParameter` returns, keyed by the constant it is asked for. */
const PARAMETERS: Record<number, unknown> = {
	[CONSTANTS.MAX_TEXTURE_SIZE!]: 4096,
	[CONSTANTS.ACTIVE_ATTRIBUTES!]: 0,
	[CONSTANTS.ACTIVE_UNIFORMS!]: 0
};

export function createFakeGL(): FakeGL {
	const counts: Record<string, { made: number; freed: number }> = {
		texture: { made: 0, freed: 0 },
		program: { made: 0, freed: 0 },
		shader: { made: 0, freed: 0 },
		buffer: { made: 0, freed: 0 }
	};
	const calls: string[] = [];
	const records: Array<{ name: string; args: unknown[] }> = [];
	const state: { canvas: HTMLCanvasElement | null } = { canvas: null };
	let nextId = 1;

	// What the code under test actually compiled and linked. Modelled rather
	// than waved through, because a real driver only gives you a location for a
	// uniform the linked program declares — and a harness that hands back a
	// location for every name makes "the uniform did not reach GL" unobservable.
	const shaderSources = new Map<unknown, string>();
	const programShaders = new Map<unknown, unknown[]>();
	const locations = new Map<unknown, Map<string, Handle>>();
	const uniformWrites = new Map<string, unknown>();
	let drawCount = 0;

	/**
	 * Names declared `uniform`/`attribute` across a program's attached sources.
	 *
	 * A regex, deliberately: this models declaration, not the linker. It handles
	 * precision qualifiers, comma-separated lists and array suffixes, and it
	 * ignores comments — an earlier version reported `"float"` for
	 * `uniform highp float uTime`, lost `uB` from `uniform float uA, uB`, and
	 * handed out a location for a uniform that was commented out.
	 *
	 * Two ways it still differs from a driver, neither worth modelling:
	 *
	 * - a driver strips declared-but-*unused* uniforms, so the fake is more
	 *   permissive there and a passing test can still fail on hardware;
	 * - a driver runs the preprocessor, so a uniform inside a false `#ifdef`
	 *   gets a location here that it would not get in a browser.
	 *
	 * The earlier version of this comment claimed the fake was "more permissive
	 * than a driver, never less", which was false in four ways at once.
	 */
	const declared = (program: unknown, keyword: 'uniform' | 'attribute'): string[] => {
		const names: string[] = [];
		// Optional precision qualifier, then the type, then one or more names
		// with optional array suffixes.
		const pattern = new RegExp(
			`\\b${keyword}\\s+(?:lowp|mediump|highp)?\\s*\\w+\\s+([^;]+);`,
			'g'
		);
		for (const shader of programShaders.get(program) ?? []) {
			const source = stripGlslComments(shaderSources.get(shader) ?? '');
			for (const match of source.matchAll(pattern)) {
				for (const part of (match[1] ?? '').split(',')) {
					const name = part.trim().replace(/\[.*$/, '').trim();
					if (name && /^\w+$/.test(name) && !names.includes(name)) names.push(name);
				}
			}
		}
		return names;
	};

	/** Record a uniform write against the name its location carries. */
	const writeUniform = (location: unknown, value: unknown) => {
		const name = (location as Handle | null)?.name;
		if (name) uniformWrites.set(name, value);
	};

	const make = (kind: keyof typeof counts): Handle => {
		counts[kind]!.made += 1;
		return { kind, id: nextId++ };
	};
	// Handles already deleted, so a redundant delete is not counted twice.
	const freed = new WeakSet<object>();

	const free = (kind: keyof typeof counts, handle: unknown) => {
		// Only count a real handle. Deleting `null` is legal and frees nothing,
		// and counting it would let a leak hide behind a no-op call.
		//
		// Idempotent, as real GL is: deleting twice used to count twice and drive
		// `live()` negative, and a −1 silently absorbs a +1 somewhere else. That
		// matters because `live('texture') === 0` is the oracle for the overlay's
		// orphaned-texture tests — the one thing `live()` exists for.
		if (!handle || typeof handle !== 'object') return;
		if ((handle as Handle).kind !== kind) return;
		if (freed.has(handle)) return;
		freed.add(handle);
		counts[kind]!.freed += 1;
	};

	// Contents per buffer handle, so a test can ask what actually went up
	// rather than how many times something did.
	//
	// **Bytes**, because that is what a GL buffer holds. The first version
	// stored a `Float32Array` and silently discarded anything else — so a
	// `Uint16Array`, which is the normal `ELEMENT_ARRAY_BUFFER` index type and
	// the very thing the per-target binding fix was motivated by, vanished
	// without a word. Worse, it made the `INVALID_OPERATION` guard below
	// unreachable for index data, and produced a *false* refusal with a false
	// message when a buffer allocated with `Uint16Array` was then sub-uploaded
	// with floats: "has had no bufferData", when it had.
	//
	// `view` is the element type of the last full upload, so `bufferContents`
	// can hand back something a test can read directly rather than a byte soup.
	const bufferStore = new Map<unknown, { bytes: Uint8Array; view: TypedArrayCtor }>();
	// Keyed by target, because GL is. One variable meant an
	// `ELEMENT_ARRAY_BUFFER` bind silently displaced the array binding, and the
	// next `bufferData` then wrote vertex data into the index buffer's slot.
	const boundBuffers = new Map<number, unknown>();

	const record =
		<T>(name: string, result: (...args: unknown[]) => T) =>
		(...args: unknown[]): T => {
			calls.push(name);
			records.push({ name, args });
			return result(...args);
		};

	const noop = (name: string) => record(name, () => undefined);

	const gl = {
		...CONSTANTS,

		createTexture: record('createTexture', () => make('texture')),
		deleteTexture: record('deleteTexture', (t) => free('texture', t)),
		createProgram: record('createProgram', () => make('program')),
		deleteProgram: record('deleteProgram', (p) => free('program', p)),
		createShader: record('createShader', () => make('shader')),
		deleteShader: record('deleteShader', (s) => free('shader', s)),
		createBuffer: record('createBuffer', () => make('buffer')),
		deleteBuffer: record('deleteBuffer', (b) => {
			bufferStore.delete(b);
			// GL unbinds a deleted buffer from every target it was bound to.
			// Without this the handle stayed bound and stayed writable, so code
			// that uploaded after `deleteBuffer` looked like it worked.
			for (const [target, bound] of boundBuffers) {
				if (bound === b) boundBuffers.delete(target);
			}
			free('buffer', b);
		}),

		// Compilation and linking always succeed: these tests are about resource
		// lifetime, not GLSL. A test that needs a failure overrides the getter.
		getShaderParameter: record('getShaderParameter', () => true),
		getProgramParameter: record('getProgramParameter', (program, pname) =>
			pname === CONSTANTS.ACTIVE_UNIFORMS
				? declared(program, 'uniform').length
				: pname === CONSTANTS.ACTIVE_ATTRIBUTES
					? declared(program, 'attribute').length
					: true
		),
		getShaderInfoLog: record('getShaderInfoLog', () => ''),
		getProgramInfoLog: record('getProgramInfoLog', () => ''),
		getParameter: record('getParameter', (p) => PARAMETERS[p as number] ?? 0),
		// `WEBGL_lose_context` is modelled rather than stubbed to null, because
		// `WebGLOverlay.destroy()` reaches for it deliberately and the event it
		// dispatches is the whole mechanism behind the re-entrancy defect. A
		// `null` here makes that path unreachable and any test of it vacuous.
		getExtension: record('getExtension', (name) =>
			name === 'WEBGL_lose_context'
				? {
						// Recorded, not just enacted. These used to be closures that
						// dispatched an event and touched nothing else, so no test
						// in this package could assert the context was actually
						// lost — both "frees the context" tests passed while
						// asserting only that `getExtension` had been reached, and
						// stayed green when `loseContext()` was never called.
						loseContext: () => {
							calls.push('loseContext');
							records.push({ name: 'loseContext', args: [] });
							state.canvas?.dispatchEvent(new Event('webglcontextlost'));
						},
						restoreContext: () => {
							calls.push('restoreContext');
							records.push({ name: 'restoreContext', args: [] });
							state.canvas?.dispatchEvent(new Event('webglcontextrestored'));
						}
					}
				: null
		),
		getSupportedExtensions: record('getSupportedExtensions', () => []),
		// Distinct indices per attribute, and -1 for one the program does not
		// declare — which is what a driver returns. A constant 0 for every name
		// makes `aPosition` and `aTexCoord` indistinguishable, so a swapped or
		// duplicated binding would render wrongly and test green.
		getAttribLocation: record('getAttribLocation', (program, name) => {
			const index = declared(program, 'attribute').indexOf(name as string);
			return index;
		}),
		getUniformLocation: record('getUniformLocation', (program, name) => {
			if (!declared(program, 'uniform').includes(name as string)) return null;
			let perProgram = locations.get(program);
			if (!perProgram) {
				perProgram = new Map();
				locations.set(program, perProgram);
			}
			let handle = perProgram.get(name as string);
			if (!handle) {
				handle = { kind: 'uniform', id: nextId++, name: name as string };
				perProgram.set(name as string, handle);
			}
			return handle;
		}),
		getActiveAttrib: record('getActiveAttrib', (program, index) => {
			const name = declared(program, 'attribute')[index as number];
			return name ? { name, size: 1, type: CONSTANTS.FLOAT } : null;
		}),
		getActiveUniform: record('getActiveUniform', (program, index) => {
			const name = declared(program, 'uniform')[index as number];
			return name ? { name, size: 1, type: CONSTANTS.FLOAT } : null;
		}),

		shaderSource: record('shaderSource', (shader, source) => {
			shaderSources.set(shader, String(source));
		}),
		compileShader: noop('compileShader'),
		attachShader: record('attachShader', (program, shader) => {
			programShaders.set(program, [...(programShaders.get(program) ?? []), shader]);
		}),
		linkProgram: noop('linkProgram'),
		validateProgram: noop('validateProgram'),
		useProgram: noop('useProgram'),
		bindTexture: noop('bindTexture'),
		// Modelled rather than stubbed: the two buffers a `RenderPipeline` owns
		// are both `ARRAY_BUFFER`, so which one is bound is the *only* thing
		// that distinguishes the position attribute from the texture
		// coordinates. Without contents, "the quad was positioned" is
		// unobservable — deleting `updateQuadPosition` broke no test.
		bindBuffer: record('bindBuffer', (target, buffer) => {
			if (buffer == null) boundBuffers.delete(target as number);
			else boundBuffers.set(target as number, buffer);
		}),
		bufferData: record('bufferData', (target, data) => {
			const bound = boundBuffers.get(target as number);
			if (!bound) return;

			// `bufferData(target, size, usage)` is the allocate-only form: a byte
			// count, and a buffer of zeroes. Ignoring it left the store empty, so
			// a later `bufferSubData` looked like it was writing to nothing.
			// A negative or fractional size is `INVALID_VALUE` in real GL; it
			// used to produce a silent `Float32Array(0)` or a truncation.
			if (typeof data === 'number') {
				if (!Number.isInteger(data) || data < 0) {
					throw new Error(
						`fake-gl: bufferData size ${data} is not a whole number of bytes — real GL raises INVALID_VALUE`
					);
				}
				// No element type is implied by a size alone; float is the
				// overwhelmingly common follow-up and is documented as the default.
				bufferStore.set(bound, { bytes: new Uint8Array(data), view: Float32Array });
				return;
			}

			if (isTypedArray(data)) {
				bufferStore.set(bound, {
					bytes: new Uint8Array(
						data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
					),
					view: data.constructor as TypedArrayCtor
				});
			}
		}),
		bufferSubData: record('bufferSubData', (target, offset, data) => {
			const bound = boundBuffers.get(target as number);
			if (!bound || !isTypedArray(data)) return;

			const existing = bufferStore.get(bound);
			// Real GL raises `INVALID_OPERATION` here — there is no store to write
			// into. Silently succeeding made a missing `bufferData` invisible, and
			// the harness has no `getError`, so throwing is the only way to say it.
			if (!existing) {
				throw new Error(
					'fake-gl: bufferSubData on a buffer that has had no bufferData — real GL raises INVALID_OPERATION'
				);
			}

			// WebGL's offset is in **bytes**. Treating it as a Float32 index made
			// every non-zero offset write four times too far along, and threw
			// `RangeError` on calls real GL accepts.
			const byteOffset = typeof offset === 'number' ? offset : 0;
			const unit = data.BYTES_PER_ELEMENT;
			if (byteOffset % unit !== 0) {
				throw new Error(
					`fake-gl: bufferSubData byte offset ${byteOffset} is not aligned to ${unit}-byte elements`
				);
			}

			if (byteOffset + data.byteLength > existing.bytes.length) {
				throw new Error(
					`fake-gl: bufferSubData writes past the end of the buffer (${byteOffset} + ${data.byteLength} > ${existing.bytes.length}) — real GL raises INVALID_VALUE`
				);
			}

			const next = new Uint8Array(existing.bytes);
			next.set(
				new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)),
				byteOffset
			);
			bufferStore.set(bound, { bytes: next, view: existing.view });
		}),
		texImage2D: noop('texImage2D'),
		texParameteri: noop('texParameteri'),
		activeTexture: noop('activeTexture'),
		enableVertexAttribArray: noop('enableVertexAttribArray'),
		disableVertexAttribArray: noop('disableVertexAttribArray'),
		vertexAttribPointer: noop('vertexAttribPointer'),
		drawArrays: record('drawArrays', () => {
			drawCount += 1;
		}),
		viewport: noop('viewport'),
		clear: noop('clear'),
		clearColor: noop('clearColor'),
		enable: noop('enable'),
		disable: noop('disable'),
		blendFunc: noop('blendFunc'),
		uniform1f: record('uniform1f', writeUniform),
		uniform1fv: record('uniform1fv', writeUniform),
		uniform1i: record('uniform1i', writeUniform),
		uniform2fv: record('uniform2fv', writeUniform),
		uniform3fv: record('uniform3fv', writeUniform),
		uniform4fv: record('uniform4fv', writeUniform),
		uniformMatrix3fv: record('uniformMatrix3fv', (location, _transpose, value) =>
			writeUniform(location, value)
		),
		uniformMatrix4fv: record('uniformMatrix4fv', (location, _transpose, value) =>
			writeUniform(location, value)
		)
	};

	return {
		live: (kind) => counts[kind]!.made - counts[kind]!.freed,
		created: (kind) => counts[kind]!.made,
		calls,
		records,
		argsFor: (name) => records.filter((entry) => entry.name === name).map((entry) => entry.args),
		bufferContents: (handle) => {
			const record = bufferStore.get(handle);
			if (!record) return null;
			// A copy. It used to hand back the live internal array, so a test
			// that merely *inspected* the store could corrupt it.
			return new record.view(record.bytes.slice().buffer);
		},
		drawCalls: () => drawCount,
		uniforms: () => new Map(uniformWrites),
		clearCalls: () => {
			calls.length = 0;
			records.length = 0;
			uniformWrites.clear();
			drawCount = 0;
		},
		context: gl as unknown as WebGLRenderingContext,
		get canvas() {
			return state.canvas;
		},
		set canvas(c: HTMLCanvasElement | null) {
			state.canvas = c;
		}
	};
}

/**
 * Point every `canvas.getContext('webgl')` at one fake, and return the undo.
 *
 * Overriding the prototype rather than injecting means the code under test
 * reaches the context by the same route it does in a browser — including
 * `WebGLContextManager.createContext`, which is private and takes no seam.
 */
/**
 * Nesting depth, so two installs and two undos land back on the real thing.
 *
 * Each installer used to capture whatever `getContext` happened to be there and
 * restore it on undo. Install twice and undo in *push* order — which every
 * suite does, via `undo.forEach` — and the prototype is left holding the first
 * fake's patch forever. `component-api.test.ts` installs twice inside one `it`,
 * so this fired already; it was harmless only because vitest isolates files.
 */
let glInstalls = 0;
let pristineGetContext: HTMLCanvasElement['getContext'] | null = null;

export function installFakeGL(fake: FakeGL): () => void {
	if (glInstalls === 0) pristineGetContext = HTMLCanvasElement.prototype.getContext;
	glInstalls += 1;
	let undone = false;

	HTMLCanvasElement.prototype.getContext = function (
		this: HTMLCanvasElement,
		type: string
	) {
		if (type === 'webgl' || type === 'experimental-webgl') {
			// Remembered so `WEBGL_lose_context` can dispatch on the right canvas.
			fake.canvas = this;
			return fake.context;
		}
		// A minimal 2D context, because `TextureFactory.scaleImage` needs one.
		// Returning null here made the auto-scaling path — the whole reason
		// `maxTextureSize` produces a smaller texture rather than an error —
		// fail for want of a canvas, which looks from a test exactly like the
		// size limit working.
		if (type === '2d') {
			// `drawImage` is recorded, so "uploaded the element" and "uploaded a
			// scratch-canvas copy of it" stop being the same observation — with
			// a silent stub, a `TextureFactory` that scaled *every* update
			// passed the tests written to catch exactly that.
			return {
				drawImage: (...args: unknown[]) => {
					fake.calls.push('drawImage');
					(fake.records as Array<{ name: string; args: unknown[] }>).push({
						name: 'drawImage',
						args
					});
				}
			} as unknown as CanvasRenderingContext2D;
		}
		return null;
	} as HTMLCanvasElement['getContext'];

	return () => {
		if (undone) return;
		undone = true;
		glInstalls -= 1;
		if (glInstalls === 0 && pristineGetContext) {
			HTMLCanvasElement.prototype.getContext = pristineGetContext;
			pristineGetContext = null;
		}
	};
}

/**
 * Stub the DOM observers jsdom does not implement.
 *
 * `PositionTracker` constructs an `IntersectionObserver` and a `ResizeObserver`
 * unconditionally, so without these the overlay's constructor throws and
 * `createOverlay` returns an `OverlayError` — which looks, from a test, exactly
 * like the code under test refusing to work.
 */
let observerInstalls = 0;
let pristineObservers: { io: unknown; ro: unknown } | null = null;

export function installFakeObservers(): () => void {
	const g = globalThis as Record<string, unknown>;
	// Captured once, at the outermost install. Capturing per-install and
	// restoring from whichever undo happens to reach zero restores the *stub*,
	// because by then that is what the inner install saw.
	if (observerInstalls === 0) {
		pristineObservers = { io: g.IntersectionObserver, ro: g.ResizeObserver };
	}

	class Stub {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
		takeRecords(): [] {
			return [];
		}
	}

	g.IntersectionObserver = Stub;
	g.ResizeObserver = Stub;

	// Same nesting problem as `installFakeGL`: `had` captures whatever was
	// there, so a second install captures the first stub and undoing in push
	// order leaves it behind.
	observerInstalls += 1;
	let undone = false;
	return () => {
		if (undone) return;
		undone = true;
		observerInstalls -= 1;
		if (observerInstalls === 0 && pristineObservers) {
			g.IntersectionObserver = pristineObservers.io;
			g.ResizeObserver = pristineObservers.ro;
			pristineObservers = null;
		}
	};
}
