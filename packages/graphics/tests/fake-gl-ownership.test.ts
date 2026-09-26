import { describe, it, expect, afterEach } from 'vitest';
import { createFakeGL, installFakeGL, installFakeObservers } from './helpers/fake-gl.js';

describe('fake GL multi-canvas context ownership', () => {
	let undo: Array<() => void> = [];

	afterEach(() => {
		while (undo.length > 0) {
			undo.pop()!();
		}
	});

	it('binds context to the requesting canvas and dispatches context loss only to the owning canvas', () => {
		const fake = createFakeGL();
		undo.push(installFakeGL(fake));

		const canvasA = document.createElement('canvas');
		const canvasB = document.createElement('canvas');

		const glA = canvasA.getContext('webgl') as WebGLRenderingContext;
		const glB = canvasB.getContext('webgl') as WebGLRenderingContext;

		expect(glA).toBeDefined();
		expect(glB).toBeDefined();
		expect(glA.canvas).toBe(canvasA);
		expect(glB.canvas).toBe(canvasB);

		let lostA = 0;
		let restoredA = 0;
		let lostB = 0;
		let restoredB = 0;

		canvasA.addEventListener('webglcontextlost', (e) => {
			lostA += 1;
			e.preventDefault();
		});
		canvasA.addEventListener('webglcontextrestored', () => {
			restoredA += 1;
		});
		canvasB.addEventListener('webglcontextlost', (e) => {
			lostB += 1;
			e.preventDefault();
		});
		canvasB.addEventListener('webglcontextrestored', () => {
			restoredB += 1;
		});

		const extA = glA.getExtension('WEBGL_lose_context') as any;
		expect(extA).toBeTruthy();

		extA.loseContext();

		expect(lostA).toBe(1);
		expect(lostB).toBe(0);
		expect(glA.isContextLost()).toBe(true);
		expect(glB.isContextLost()).toBe(false);

		expect(glA.createTexture()).toBeNull();
		const textureB = glB.createTexture();
		expect(textureB).not.toBeNull();

		extA.restoreContext();

		expect(restoredA).toBe(1);
		expect(restoredB).toBe(0);
		expect(glA.isContextLost()).toBe(false);
		expect(glB.isContextLost()).toBe(false);

		const extB = glB.getExtension('WEBGL_lose_context') as WEBGL_lose_context;
		extB.loseContext();
		expect(glB.createTexture()).toBeNull();
		const textureA = glA.createTexture();
		expect(textureA).not.toBeNull();
	});

	it('preserves shared calls and draw counters across distinct canvases', () => {
		const fake = createFakeGL();
		undo.push(installFakeGL(fake));

		const canvasA = document.createElement('canvas');
		const canvasB = document.createElement('canvas');

		const glA = canvasA.getContext('webgl') as WebGLRenderingContext;
		const glB = canvasB.getContext('webgl') as WebGLRenderingContext;

		glA.drawArrays(0, 0, 6);
		glB.drawArrays(0, 0, 6);

		expect(fake.drawCalls()).toBe(2);
		expect(fake.calls.filter((c) => c === 'drawArrays')).toHaveLength(2);
	});
});

// An inner cleanup must reveal the remaining installation, in either order.
it.each(['outer-first', 'inner-first'])('restores live GL and observer installations: %s', order => {
 const original = HTMLCanvasElement.prototype.getContext;
 const originalIO = globalThis.IntersectionObserver;
 const first = createFakeGL(), second = createFakeGL();
 const undoFirst = installFakeGL(first), undoFirstObserver = installFakeObservers();
 const firstIO = globalThis.IntersectionObserver;
 const undoSecond = installFakeGL(second), undoSecondObserver = installFakeObservers();
 const secondIO = globalThis.IntersectionObserver;
 const canvas = document.createElement('canvas');
 try {
  expect(canvas.getContext('webgl')).toBe(second.getContext(canvas));
  if (order === 'inner-first') { undoSecond(); undoSecondObserver(); }
  else { undoFirst(); undoFirstObserver(); }
  expect(canvas.getContext('webgl')).toBe((order === 'inner-first' ? first : second).getContext(canvas));
  expect(globalThis.IntersectionObserver).toBe(order === 'inner-first' ? firstIO : secondIO);
 } finally { undoSecond(); undoSecondObserver(); undoFirst(); undoFirstObserver(); }
 expect(HTMLCanvasElement.prototype.getContext).toBe(original);
 expect(globalThis.IntersectionObserver).toBe(originalIO);
});
it('detached loss is separate from newly created canvas contexts and other fakes', () => {
 const fake = createFakeGL(); fake.loseContext(); expect(fake.context.createTexture()).toBeNull();
 const canvas = document.createElement('canvas'); const gl = fake.getContext(canvas);
 expect(gl.isContextLost()).toBe(false); expect(gl.createTexture()).not.toBeNull();
 expect(fake.context.createTexture()).toBeNull();
 const fresh = createFakeGL(); expect(fresh.context.createTexture()).not.toBeNull();
});
it('retained extension acts on its canvas even after another context is acquired', () => {
 const fake = createFakeGL(); const a = document.createElement('canvas'), b = document.createElement('canvas');
 const first = fake.getContext(a); const extension = first.getExtension('WEBGL_lose_context')!;
 const second = fake.getContext(b); let lostA = 0, lostB = 0;
 a.addEventListener('webglcontextlost', () => lostA++); b.addEventListener('webglcontextlost', () => lostB++);
 extension.loseContext(); expect(lostA).toBe(1); expect(lostB).toBe(0);
 expect(first.isContextLost()).toBe(true); expect(second.isContextLost()).toBe(false);
});
