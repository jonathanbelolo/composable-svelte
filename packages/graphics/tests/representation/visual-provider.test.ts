/**
 * `graphicsVisualProvider` and the render-surface lifetime behind it.
 *
 * The contract (core's `RepresentationProvider`): a representation may take
 * render authority at `retire()`, and then the visual run — not the component —
 * releases the renderer, exactly once, on every terminal path. Without a
 * representation, teardown is exactly what it was.
 *
 * jsdom has no 2D context, so mirrors copy nothing here; pixels are the
 * browser test's business (`tests/representation-retained.browser.ts`).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Scene from '../../src/components/Scene.svelte';
import WebGLOverlay from '../../src/lib/overlay/WebGLOverlay.svelte';
import {
	graphicsVisualProvider,
	graphicsRepresentationResources,
	registerRenderSurface,
	type GraphicsRepresentation,
	type GraphicsRepresentationContext,
	type GraphicsRetainedRenderer,
	type RenderAuthority
} from '../../src/lib/representation/visual-provider.js';
import { createInitialGraphicsState } from '../../src/core/initial-state.js';
import type { GraphicsAction, GraphicsState, GraphicsStore } from '../../src/core/types.js';
import { FakeSceneAdapter } from '../helpers/fake-scene-adapter.js';
import { createFakeGL, installFakeGL, installFakeObservers } from '../helpers/fake-gl.js';

let cleanup: Array<() => void> = [];

// jsdom has no 2D context. Mirrors get a recording one, so a copy is observable.
const copies = new Map<HTMLCanvasElement, number>();
beforeEach(() => {
	const pristine = HTMLCanvasElement.prototype.getContext;
	HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
		if (type !== '2d') return null;
		const canvas = this;
		return {
			clearRect: () => {},
			drawImage: () => copies.set(canvas, (copies.get(canvas) ?? 0) + 1)
		} as unknown as CanvasRenderingContext2D;
	} as HTMLCanvasElement['getContext'];
	cleanup.push(() => {
		HTMLCanvasElement.prototype.getContext = pristine;
		copies.clear();
	});
});

afterEach(() => {
	for (const fn of cleanup.reverse()) fn();
	cleanup = [];
	document.body.innerHTML = '';
	vi.restoreAllMocks();
});

const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeAuthority implements RenderAuthority {
	detached = 0;
	rendered: number[] = [];
	disposed = 0;
	lost = false;
	throwOnRender = false;
	readonly frameListeners = new Set<() => void>();
	readonly lossListeners = new Set<() => void>();

	detachFromPage(): void {
		this.detached++;
	}
	renderFrame(time: number): void {
		if (this.throwOnRender) throw new Error('boom');
		this.rendered.push(time);
		this.emitFrame();
	}
	onFrame(listener: () => void): () => void {
		this.frameListeners.add(listener);
		return () => this.frameListeners.delete(listener);
	}
	onContextLost(listener: () => void): () => void {
		this.lossListeners.add(listener);
		return () => this.lossListeners.delete(listener);
	}
	isContextLost(): boolean {
		return this.lost;
	}
	dispose(): void {
		this.disposed++;
	}
	emitFrame(): void {
		for (const listener of [...this.frameListeners]) listener();
	}
	loseContext(): void {
		this.lost = true;
		for (const listener of [...this.lossListeners]) listener();
	}
}

function visualContext(options: { reducedMotion?: boolean } = {}) {
	const controller = new AbortController();
	const diagnostics: string[] = [];
	const context: GraphicsRepresentationContext = {
		document,
		signal: controller.signal,
		reducedMotion: options.reducedMotion ?? false,
		diagnose: (reason) => diagnostics.push(reason)
	};
	return { context, diagnostics, abort: () => controller.abort() };
}

function registered() {
	const canvas = document.createElement('canvas');
	canvas.width = 4;
	canvas.height = 4;
	document.body.appendChild(canvas);
	const authority = new FakeAuthority();
	const cutBusiness = vi.fn();
	const registration = registerRenderSurface(canvas, authority, cutBusiness);
	cleanup.push(() => registration.release());
	return { canvas, authority, cutBusiness, registration };
}

function represent(canvas: Element, options: { reducedMotion?: boolean } = {}) {
	const visual = visualContext(options);
	const result = graphicsVisualProvider().represent(canvas, visual.context);
	if (!result || 'declined' in result) throw new Error(`not represented: ${JSON.stringify(result)}`);
	return { rep: result as GraphicsRepresentation, ...visual };
}

function retire(rep: GraphicsRepresentation): GraphicsRetainedRenderer | undefined {
	return rep.retire?.() ?? undefined;
}

function expectNoResources(): void {
	expect(graphicsRepresentationResources()).toEqual({
		surfaces: 0,
		retained: 0,
		representations: 0,
		mirrors: 0
	});
}

/** A managed-view-shaped owner whose retirement the test controls. */
function ownerStore(): GraphicsStore & { retire(): void; dispatched: GraphicsAction[]; listeners(): number } {
	let state: GraphicsState | undefined = createInitialGraphicsState();
	const listeners = new Set<(state: GraphicsState | undefined) => void>();
	const dispatched: GraphicsAction[] = [];
	return {
		get state() {
			return state;
		},
		dispatch(action: GraphicsAction) {
			dispatched.push(action);
		},
		subscribe(listener: (state: GraphicsState | undefined) => void) {
			listeners.add(listener);
			listener(state);
			return () => listeners.delete(listener);
		},
		retire() {
			state = undefined;
			for (const listener of [...listeners]) listener(undefined);
		},
		dispatched,
		listeners: () => listeners.size
	};
}

class RetainableFakeAdapter extends FakeSceneAdapter {
	readonly authority = new FakeAuthority();
	renderAuthority(): RenderAuthority {
		const authority = this.authority;
		return {
			detachFromPage: () => authority.detachFromPage(),
			renderFrame: (time) => authority.renderFrame(time),
			onFrame: (listener) => authority.onFrame(listener),
			onContextLost: (listener) => authority.onContextLost(listener),
			isContextLost: () => authority.isContextLost(),
			dispose: () => {
				authority.dispose();
				this.dispose();
			}
		};
	}
}

async function mountScene(adapter: FakeSceneAdapter) {
	const store = ownerStore();
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(Scene as never, { target, props: { store, createAdapter: () => adapter } });
	flushSync();
	await settle();
	const canvas = target.querySelector('canvas')!;
	let mounted = true;
	const unmountScene = () => {
		if (!mounted) return;
		mounted = false;
		unmount(instance);
		target.remove();
	};
	cleanup.push(unmountScene);
	return { store, canvas, unmountScene };
}

// ---------------------------------------------------------------------------
// Provider recognition
// ---------------------------------------------------------------------------

describe('graphicsVisualProvider', () => {
	it('handles only canvases a graphics component registered', () => {
		const provider = graphicsVisualProvider();
		const { context } = visualContext();
		expect(provider.name).toBe('graphics');
		expect(provider.represent(document.createElement('div'), context)).toBeUndefined();
		expect(provider.represent(document.createElement('canvas'), context)).toBeUndefined();
	});

	it('declines a canvas whose renderer was released', () => {
		const { canvas, registration } = registered();
		registration.release();
		const { context } = visualContext();
		expect(graphicsVisualProvider().represent(canvas, context)).toBeUndefined();
		expectNoResources();
	});

	it('represents a registered canvas with an inert retained mirror', () => {
		const { canvas } = registered();
		const { rep } = represent(canvas);
		expect(rep.continuity).toBe('retained');
		expect(rep.node).toBeInstanceOf(HTMLCanvasElement);
		expect(rep.node).not.toBe(canvas);
		expect(rep.node.getAttribute('aria-hidden')).toBe('true');
		expect(rep.node.style.pointerEvents).toBe('none');
		rep.dispose();
	});
});

// ---------------------------------------------------------------------------
// Surface lifetime
// ---------------------------------------------------------------------------

describe('render surface lifetime', () => {
	it('releases at owner retirement when nothing represents it (unchanged teardown)', () => {
		const { authority, registration } = registered();
		registration.ownerRetired();
		expect(authority.disposed).toBe(1);
		registration.release();
		expect(authority.disposed).toBe(1);
		expectNoResources();
	});

	it('releases at component teardown when never represented', () => {
		const { authority, registration } = registered();
		registration.release();
		registration.release();
		expect(authority.disposed).toBe(1);
		expect(authority.detached).toBe(0);
		expectNoResources();
	});

	it('defers owner-retirement release while represented, then transfers at retire', () => {
		const { canvas, authority, registration, cutBusiness } = registered();
		const { rep } = represent(canvas);

		registration.ownerRetired();
		expect(authority.disposed, 'the renderer died before the run could retire it').toBe(0);

		const retained = retire(rep);
		expect(retained).toBeDefined();
		expect(registration.retained).toBe(true);
		expect(authority.detached).toBe(1);
		// The hand-off ran once, at the owner's retirement, not again at transfer.
		expect(cutBusiness).toHaveBeenCalledTimes(1);

		// The component's teardown follows in the same frame and must not release.
		registration.release();
		expect(authority.disposed).toBe(0);

		retained!.frame?.(16);
		retained!.frame?.(32);
		expect(authority.rendered).toEqual([16, 32]);

		// Core disposes the retained renderer instead of the representation.
		retained!.dispose();
		retained!.dispose();
		expect(authority.disposed).toBe(1);
		expectNoResources();
	});

	it('cuts business ties itself when retirement reaches it before the owner does', () => {
		const { canvas, authority, registration, cutBusiness } = registered();
		const { rep } = represent(canvas);
		const retained = retire(rep)!;
		expect(cutBusiness).toHaveBeenCalledTimes(1);
		registration.ownerRetired();
		registration.release();
		expect(authority.disposed).toBe(0);
		retained.dispose();
		expect(authority.disposed).toBe(1);
		expectNoResources();
	});

	it('releases at the last representation disposal when the owner retired and no retire came', () => {
		const { canvas, authority, registration } = registered();
		const first = represent(canvas).rep;
		const second = represent(canvas).rep;
		registration.ownerRetired();
		first.dispose();
		expect(authority.disposed).toBe(0);
		second.dispose();
		expect(authority.disposed).toBe(1);
		registration.release();
		expect(authority.disposed).toBe(1);
		expectNoResources();
	});

	it('keeps ordinary teardown when unmounted without retirement, and refuses a late retire', () => {
		const { canvas, authority, registration } = registered();
		const { rep, diagnostics } = represent(canvas);
		registration.release();
		expect(authority.disposed).toBe(1);
		expect(retire(rep)).toBeUndefined();
		expect(diagnostics).toContain('graphicsRendererReleased');
		rep.dispose();
		expect(authority.disposed).toBe(1);
		expectNoResources();
	});

	it('does not transfer a renderer whose context is lost at retirement', () => {
		const { canvas, authority, registration } = registered();
		const { rep, diagnostics } = represent(canvas);
		authority.lost = true;
		expect(retire(rep)).toBeUndefined();
		expect(diagnostics).toContain('contextLost');
		expect(registration.retained).toBe(false);
		registration.release();
		rep.dispose();
		expect(authority.disposed).toBe(1);
		expectNoResources();
	});

	it('stops drawing on context loss during retention, reports it, and still disposes once', () => {
		const { canvas, authority, registration } = registered();
		const { rep, diagnostics } = represent(canvas);
		const retained = retire(rep)!;
		registration.release();
		retained.frame?.(16);
		authority.loseContext();
		retained.frame?.(32);
		expect(authority.rendered).toEqual([16]);
		expect(diagnostics).toContain('contextLost');
		retained.dispose();
		expect(authority.disposed).toBe(1);
		expectNoResources();
	});

	it('stops drawing when a retained frame throws, and still disposes once', () => {
		const { canvas, authority, registration } = registered();
		const { rep, diagnostics } = represent(canvas);
		const retained = retire(rep)!;
		registration.release();
		authority.throwOnRender = true;
		retained.frame?.(16);
		authority.throwOnRender = false;
		retained.frame?.(32);
		expect(authority.rendered).toEqual([]);
		expect(diagnostics.some((reason) => reason.startsWith('graphicsRenderFailed:'))).toBe(true);
		rep.dispose();
		expect(authority.disposed).toBe(1);
		expectNoResources();
	});

	it('continues under an adopting run without restarting', () => {
		const { canvas, authority, registration } = registered();
		const { rep } = represent(canvas);
		const retained = retire(rep)!;
		registration.release();
		retained.frame?.(16);
		// A successor adopts the same objects: repeated retirement keeps one lease,
		// and a frame both runs deliver at one Host time draws once.
		expect(retire(rep)).toBe(retained);
		retained.frame?.(16);
		retained.frame?.(33);
		expect(authority.detached).toBe(1);
		expect(authority.rendered).toEqual([16, 33]);
		rep.dispose();
		expect(authority.disposed).toBe(1);
		expectNoResources();
	});

	it('keeps the renderer until every retaining representation is disposed', () => {
		const { canvas, authority, registration } = registered();
		const first = represent(canvas).rep;
		const second = represent(canvas).rep;
		const a = retire(first)!;
		const b = retire(second)!;
		registration.release();
		expect(graphicsRepresentationResources().retained).toBe(1);
		a.frame?.(16);
		b.frame?.(16);
		expect(authority.rendered).toEqual([16]);
		a.dispose();
		expect(authority.disposed).toBe(0);
		b.frame?.(32);
		expect(authority.rendered).toEqual([16, 32]);
		b.dispose();
		expect(authority.disposed).toBe(1);
		expectNoResources();
	});

	it('gives a static, non-retaining representation under reduced motion', () => {
		const { canvas, authority, registration } = registered();
		const { rep } = represent(canvas, { reducedMotion: true });
		expect(rep.continuity).toBe('static');
		expect(rep.retire).toBeUndefined();
		registration.ownerRetired();
		expect(authority.disposed).toBe(0);
		rep.dispose();
		expect(authority.disposed).toBe(1);
		expectNoResources();
	});

	it('copies every rendered frame into the mirror, before and after retirement', async () => {
		const { canvas, authority, registration } = registered();
		const { rep } = represent(canvas);
		const mirror = rep.node as HTMLCanvasElement;
		expect(copies.get(mirror), 'no immediate copy at representation').toBe(1);

		// The component's own loop renders: the mirror follows it, and is ready.
		authority.emitFrame();
		await expect(rep.ready).resolves.toBeUndefined();
		expect(copies.get(mirror)).toBe(2);

		const retained = retire(rep)!;
		registration.release();
		retained.frame?.(16);
		retained.frame?.(32);
		expect(copies.get(mirror)).toBe(4);

		// After disposal nothing copies into it; it keeps its last frame.
		retained.dispose();
		authority.emitFrame();
		expect(copies.get(mirror)).toBe(4);
		expectNoResources();
	});

	it('resolves readiness on abort even when no frame arrives', async () => {
		const { canvas } = registered();
		const { rep, abort } = represent(canvas);
		abort();
		await expect(rep.ready).resolves.toBeUndefined();
		rep.dispose();
	});
});

// ---------------------------------------------------------------------------
// Core-faithful terminal disposal (review G1)
//
// Core disposes *either* the retained renderer *or* the representation, then
// aborts the representation's signal. Each of those alone must finish that
// representation — mirror, readiness, lease, accounting — exactly once, and
// leave every other representation's lease running.
// ---------------------------------------------------------------------------

describe('either/or terminal disposal', () => {
	it('finishes a single representation from its retained renderer alone', async () => {
		const { canvas, authority, registration } = registered();
		const { rep, abort } = represent(canvas);
		const mirror = rep.node as HTMLCanvasElement;
		const retained = retire(rep)!;
		registration.release();
		retained.frame?.(16);
		const copiesAtDisposal = copies.get(mirror);

		retained.dispose();
		abort();
		await expect(rep.ready).resolves.toBeUndefined();
		expect(authority.disposed).toBe(1);
		expectNoResources();

		// Nothing copies into it any more, and further terminal calls are inert.
		authority.emitFrame();
		retained.frame?.(32);
		rep.dispose();
		retained.dispose();
		expect(copies.get(mirror)).toBe(copiesAtDisposal);
		expect(authority.rendered).toEqual([16]);
		expect(authority.disposed).toBe(1);
	});

	it('finishes one of two representations and keeps the survivor rendering', () => {
		const { canvas, authority, registration } = registered();
		const first = represent(canvas);
		const second = represent(canvas);
		const firstMirror = first.rep.node as HTMLCanvasElement;
		const secondMirror = second.rep.node as HTMLCanvasElement;
		registration.ownerRetired();
		const a = retire(first.rep)!;
		const b = retire(second.rep)!;
		registration.release();
		a.frame?.(16);

		a.dispose();
		first.abort();
		const deadCopies = copies.get(firstMirror);
		const liveCopies = copies.get(secondMirror)!;
		expect(graphicsRepresentationResources()).toEqual({
			surfaces: 1,
			retained: 1,
			representations: 1,
			mirrors: 1
		});

		b.frame?.(32);
		expect(authority.rendered).toEqual([16, 32]);
		expect(copies.get(firstMirror), 'a disposed mirror still receives frames').toBe(deadCopies);
		expect(copies.get(secondMirror)).toBe(liveCopies + 1);
		expect(authority.disposed).toBe(0);

		b.dispose();
		second.abort();
		expect(authority.disposed).toBe(1);
		expectNoResources();
	});

	it('finishes a representation whose signal aborts without a dispose call', () => {
		const { canvas, authority, registration } = registered();
		const first = represent(canvas);
		const second = represent(canvas);
		const a = retire(first.rep)!;
		retire(second.rep);
		registration.release();

		first.abort();
		expect(graphicsRepresentationResources().representations).toBe(1);
		a.frame?.(16);
		expect(authority.rendered, 'a finished lease still drew').toEqual([]);

		second.abort();
		expect(authority.disposed).toBe(1);
		expectNoResources();
	});

	it('finishes an adopted representation from its retained renderer alone', () => {
		const { canvas, authority, registration } = registered();
		const { rep, abort } = represent(canvas);
		const retained = retire(rep)!;
		registration.release();
		retained.frame?.(16);
		// The successor adopts the same objects and keeps driving them.
		expect(retire(rep)).toBe(retained);
		retained.frame?.(33);
		retained.dispose();
		abort();
		expect(authority.rendered).toEqual([16, 33]);
		expect(authority.disposed).toBe(1);
		expectNoResources();
	});

	it('releases a deferred owner-retired renderer when an unretired representation aborts', () => {
		const { canvas, authority, registration } = registered();
		const { abort } = represent(canvas);
		registration.ownerRetired();
		expect(authority.disposed).toBe(0);
		abort();
		expect(authority.disposed).toBe(1);
		expectNoResources();
	});
});

// ---------------------------------------------------------------------------
// <Scene>
// ---------------------------------------------------------------------------

describe('<Scene> with a retainable adapter', () => {
	it('keeps unretained owner retirement exactly as before: disposed at once, one time', async () => {
		const adapter = new RetainableFakeAdapter();
		const { store, unmountScene } = await mountScene(adapter);
		expect(adapter.isInitialized).toBe(true);
		expect(graphicsRepresentationResources().surfaces).toBe(1);

		store.retire();
		expect(adapter.callsTo('dispose')).toHaveLength(1);
		expect(store.listeners()).toBe(0);
		unmountScene();
		expect(adapter.callsTo('dispose')).toHaveLength(1);
		expectNoResources();
	});

	it('keeps unretained unmount exactly as before', async () => {
		const adapter = new RetainableFakeAdapter();
		const { store, unmountScene } = await mountScene(adapter);
		unmountScene();
		expect(adapter.callsTo('dispose')).toHaveLength(1);
		expect(store.listeners()).toBe(0);
		expectNoResources();
	});

	it('hands render authority to the run: no store ties, disposal by the run only', async () => {
		const adapter = new RetainableFakeAdapter();
		const { store, canvas, unmountScene } = await mountScene(adapter);
		const { rep } = represent(canvas);
		const dispatchedBefore = store.dispatched.length;

		store.retire();
		expect(store.listeners(), 'the store subscription survived retirement').toBe(0);
		expect(adapter.callsTo('dispose')).toHaveLength(0);

		const retained = retire(rep)!;
		unmountScene();
		expect(adapter.callsTo('dispose'), 'the component released a transferred renderer').toHaveLength(0);

		retained.frame?.(16);
		retained.frame?.(32);
		expect(adapter.authority.rendered).toEqual([16, 32]);
		expect(store.dispatched.length, 'the retained renderer dispatched').toBe(dispatchedBefore);

		retained.dispose();
		expect(adapter.callsTo('dispose')).toHaveLength(1);
		expectNoResources();
	});

	it('does not register an adapter that has no render authority', async () => {
		const adapter = new FakeSceneAdapter();
		const { store, canvas } = await mountScene(adapter);
		const { context } = visualContext();
		expect(graphicsVisualProvider().represent(canvas, context)).toBeUndefined();
		store.retire();
		expect(adapter.callsTo('dispose')).toHaveLength(1);
		expectNoResources();
	});

	it('does not register a renderer whose initialisation failed', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const adapter = new RetainableFakeAdapter();
		adapter.shouldFailInit = true;
		const { canvas, unmountScene } = await mountScene(adapter);
		const { context } = visualContext();
		expect(graphicsVisualProvider().represent(canvas, context)).toBeUndefined();
		unmountScene();
		expect(adapter.callsTo('dispose')).toHaveLength(1);
		expectNoResources();
	});

	it('releases a late initialisation once, unregistered, when the owner retired first', async () => {
		const adapter = new RetainableFakeAdapter();
		adapter.initDelayMs = 30;
		const store = ownerStore();
		const target = document.createElement('div');
		document.body.appendChild(target);
		const instance = mount(Scene as never, { target, props: { store, createAdapter: () => adapter } });
		flushSync();
		store.retire();
		await settle(60);
		expect(adapter.callsTo('dispose')).toHaveLength(1);
		expect(store.dispatched).toHaveLength(0);
		unmount(instance);
		expect(adapter.callsTo('dispose')).toHaveLength(1);
		expectNoResources();
	});
});

// ---------------------------------------------------------------------------
// <WebGLOverlay>
// ---------------------------------------------------------------------------

describe('<WebGLOverlay> with an owner', () => {
	function owner() {
		let state: unknown = {};
		const listeners = new Set<(state: unknown) => void>();
		return {
			get state() {
				return state;
			},
			subscribe(listener: (state: unknown) => void) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
			retire() {
				state = undefined;
				for (const listener of [...listeners]) listener(undefined);
			},
			listeners: () => listeners.size
		};
	}

	async function mountOverlay() {
		const fake = createFakeGL();
		cleanup.push(installFakeGL(fake), installFakeObservers());
		const own = owner();
		const onContextLost = vi.fn();
		const target = document.createElement('div');
		document.body.appendChild(target);
		const api = mount(WebGLOverlay, { target, props: { owner: own, options: { onContextLost } } }) as unknown as {
			isRunning(): boolean;
			getCanvas(): HTMLCanvasElement | null;
		};
		await settle();
		const canvas = target.querySelector('canvas')!;
		let mounted = true;
		const unmountOverlay = () => {
			if (!mounted) return;
			mounted = false;
			unmount(api as never);
			target.remove();
		};
		cleanup.push(unmountOverlay);
		return { fake, own, api, canvas, unmountOverlay, onContextLost };
	}

	it('keeps unretained owner retirement exactly as before', async () => {
		const { own, api, unmountOverlay } = await mountOverlay();
		expect(api.isRunning()).toBe(true);
		expect(graphicsRepresentationResources().surfaces).toBe(1);
		own.retire();
		expect(api.getCanvas()).toBeNull();
		expect(own.listeners()).toBe(0);
		unmountOverlay();
		expectNoResources();
	});

	it('transfers a represented overlay to the run and drops every consumer callback', async () => {
		const { own, canvas, unmountOverlay, onContextLost, fake } = await mountOverlay();
		const { rep, diagnostics } = represent(canvas);
		own.retire();
		expect(own.listeners()).toBe(0);
		const retained = retire(rep)!;
		expect(retained).toBeDefined();
		unmountOverlay();
		expect(graphicsRepresentationResources().retained).toBe(1);

		retained.frame?.(16);
		// Context loss during retention: reported to the run, not to the consumer.
		fake.loseContext();
		expect(onContextLost).not.toHaveBeenCalled();
		expect(diagnostics).toContain('contextLost');

		retained.dispose();
		expectNoResources();
	});
});
