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
	TEXTURE0: 0x84c0
};

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
	const state: { canvas: HTMLCanvasElement | null } = { canvas: null };
	let nextId = 1;

	const make = (kind: keyof typeof counts): Handle => {
		counts[kind]!.made += 1;
		return { kind, id: nextId++ };
	};
	const free = (kind: keyof typeof counts, handle: unknown) => {
		// Only count a real handle. Deleting `null` is legal and frees nothing,
		// and counting it would let a leak hide behind a no-op call.
		if (handle && typeof handle === 'object' && (handle as Handle).kind === kind) {
			counts[kind]!.freed += 1;
		}
	};

	const record =
		<T>(name: string, result: (...args: unknown[]) => T) =>
		(...args: unknown[]): T => {
			calls.push(name);
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
		deleteBuffer: record('deleteBuffer', (b) => free('buffer', b)),

		// Compilation and linking always succeed: these tests are about resource
		// lifetime, not GLSL. A test that needs a failure overrides the getter.
		getShaderParameter: record('getShaderParameter', () => true),
		getProgramParameter: record('getProgramParameter', () => true),
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
						loseContext: () => {
							state.canvas?.dispatchEvent(new Event('webglcontextlost'));
						},
						restoreContext: () => {
							state.canvas?.dispatchEvent(new Event('webglcontextrestored'));
						}
					}
				: null
		),
		getSupportedExtensions: record('getSupportedExtensions', () => []),
		getAttribLocation: record('getAttribLocation', () => 0),
		getUniformLocation: record('getUniformLocation', () => ({ kind: 'uniform', id: nextId++ })),
		getActiveAttrib: record('getActiveAttrib', () => null),
		getActiveUniform: record('getActiveUniform', () => null),

		shaderSource: noop('shaderSource'),
		compileShader: noop('compileShader'),
		attachShader: noop('attachShader'),
		linkProgram: noop('linkProgram'),
		validateProgram: noop('validateProgram'),
		useProgram: noop('useProgram'),
		bindTexture: noop('bindTexture'),
		bindBuffer: noop('bindBuffer'),
		bufferData: noop('bufferData'),
		bufferSubData: noop('bufferSubData'),
		texImage2D: noop('texImage2D'),
		texParameteri: noop('texParameteri'),
		activeTexture: noop('activeTexture'),
		enableVertexAttribArray: noop('enableVertexAttribArray'),
		disableVertexAttribArray: noop('disableVertexAttribArray'),
		vertexAttribPointer: noop('vertexAttribPointer'),
		drawArrays: noop('drawArrays'),
		viewport: noop('viewport'),
		clear: noop('clear'),
		clearColor: noop('clearColor'),
		enable: noop('enable'),
		disable: noop('disable'),
		blendFunc: noop('blendFunc'),
		uniform1f: noop('uniform1f'),
		uniform1fv: noop('uniform1fv'),
		uniform1i: noop('uniform1i'),
		uniform2fv: noop('uniform2fv'),
		uniform3fv: noop('uniform3fv'),
		uniform4fv: noop('uniform4fv'),
		uniformMatrix3fv: noop('uniformMatrix3fv'),
		uniformMatrix4fv: noop('uniformMatrix4fv')
	};

	return {
		live: (kind) => counts[kind]!.made - counts[kind]!.freed,
		created: (kind) => counts[kind]!.made,
		calls,
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
export function installFakeGL(fake: FakeGL): () => void {
	const original = HTMLCanvasElement.prototype.getContext;

	HTMLCanvasElement.prototype.getContext = function (
		this: HTMLCanvasElement,
		type: string
	) {
		if (type === 'webgl' || type === 'experimental-webgl') {
			// Remembered so `WEBGL_lose_context` can dispatch on the right canvas.
			fake.canvas = this;
			return fake.context;
		}
		return null;
	} as typeof original;

	return () => {
		HTMLCanvasElement.prototype.getContext = original;
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
export function installFakeObservers(): () => void {
	const g = globalThis as Record<string, unknown>;
	const had = { io: g.IntersectionObserver, ro: g.ResizeObserver };

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

	return () => {
		g.IntersectionObserver = had.io;
		g.ResizeObserver = had.ro;
	};
}
