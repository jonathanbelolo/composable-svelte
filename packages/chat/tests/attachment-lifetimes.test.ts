import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, tick } from 'svelte';
import Harness from './fixtures/AttachmentLifetimeHarness.svelte';
import { setPDFDocumentFactory, type PDFTestDocument, type PDFTestLoading, type PDFTestRender } from './__mocks__/pdfjs-dist.js';
import type { MessageAttachment } from '../src/lib/streaming-chat/types.js';
import { TINY_VIDEO } from './__mocks__/tiny-video.js';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse())
        await cleanup();
    setPDFDocumentFactory();
    vi.restoreAllMocks();
});
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
function attachment(url: string): MessageAttachment {
    return { type: 'file', id: url, filename: url, mimeType: 'application/pdf', size: 10, url };
}
function render(kind: 'pdf' | 'audio' | 'video' | 'image', url: string, doc: Document = document) {
    const target = doc.createElement('div');
    doc.body.append(target);
    const component = mount(Harness, { target, props: { kind, initial: attachment(url) } });
    flushSync();
    let live = true;
    const destroy = async () => {
        if (live) {
            live = false;
            await unmount(component);
            target.remove();
        }
    };
    cleanups.push(destroy);
    return { target, destroy, replace(url: string) {
            component.replace(attachment(url));
            flushSync();
        } };
}
function button(target: HTMLElement, label: string) {
    const found = target.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(found, `button ${label}`).not.toBeNull();
    return found!;
}
function engine() {
    const loads: Array<{
        url: string;
        task: PDFTestLoading;
        ready: ReturnType<typeof deferred<PDFTestDocument>>;
        destroy: ReturnType<typeof vi.fn>;
    }> = [];
    const renders: Array<{
        page: number;
        scale: number;
        cancel: ReturnType<typeof vi.fn>;
        finish: () => void;
        cancelled: () => void;
    }> = [];
    let active = false;
    setPDFDocumentFactory(url => {
        const ready = deferred<PDFTestDocument>();
        const destroy = vi.fn(async () => {
        });
        const task = { promise: ready.promise, destroy };
        loads.push({ url, task, ready, destroy });
        return task;
    });
    function doc(pages: number): PDFTestDocument {
        return { numPages: pages, destroy: vi.fn(async () => {
            }), getPage: async (page) => ({ getViewport: ({ scale }) => ({ width: 100 * scale, height: 100 * scale }), render: ({ viewport }) => {
                    if (active)
                        throw new Error('overlapping canvas render');
                    active = true;
                    const done = deferred<void>();
                    const cancel = vi.fn();
                    const record = { page, scale: viewport.width / 100, cancel, finish() {
                            active = false;
                            done.resolve();
                        }, cancelled() {
                            active = false;
                            done.reject(Object.assign(new Error('cancelled'), { name: 'RenderingCancelledException' }));
                        } };
                    renders.push(record);
                    return { promise: done.promise, cancel } satisfies PDFTestRender;
                } }) };
    }
    cleanups.push(async () => {
        for (const r of renders)
            r.finish();
    });
    return { loads, renders, doc };
}
describe('PDF attachment ownership', () => {
    it('reloads a reused component and retires its previous document', async () => {
        const e = engine();
        const view = render('pdf', 'first.pdf');
        await expect.poll(() => e.loads.length).toBe(1);
        e.loads[0]!.ready.resolve(e.doc(3));
        await expect.poll(() => e.renders.length).toBe(1);
        e.renders[0]!.finish();
        await tick();
        view.replace('second.pdf');
        await expect.poll(() => e.loads.map(l => l.url)).toEqual(['first.pdf', 'second.pdf']);
        expect(e.loads[0]!.destroy).toHaveBeenCalledTimes(1);
        e.loads[1]!.ready.resolve(e.doc(8));
        await expect.poll(() => e.renders.length).toBe(2);
        e.renders[1]!.finish();
        await expect.poll(() => view.target.textContent).toContain('Page 1 of 8');
    });
    it('recovers a failed source when a new attachment arrives', async () => {
        const e = engine();
        const view = render('pdf', 'broken.pdf');
        await expect.poll(() => e.loads.length).toBe(1);
        e.loads[0]!.ready.reject(new Error('broken source'));
        await expect.poll(() => view.target.textContent).toContain('broken source');
        view.replace('working.pdf');
        await expect.poll(() => e.loads.length).toBe(2);
        e.loads[1]!.ready.resolve(e.doc(4));
        await expect.poll(() => e.renders.length).toBe(1);
        e.renders[0]!.finish();
        await expect.poll(() => view.target.textContent).toContain('Page 1 of 4');
        expect(view.target.textContent).not.toContain('broken source');
    });
    it('cancels and waits for the old render before rendering the latest requested page', async () => {
        const e = engine();
        const view = render('pdf', 'pages.pdf');
        await expect.poll(() => e.loads.length).toBe(1);
        e.loads[0]!.ready.resolve(e.doc(5));
        await expect.poll(() => e.renders.length).toBe(1);
        button(view.target, 'Next page').click();
        flushSync();
        button(view.target, 'Next page').click();
        flushSync();
        await expect.poll(() => e.renders[0]!.cancel.mock.calls.length).toBeGreaterThan(0);
        expect(e.renders).toHaveLength(1);
        e.renders[0]!.cancelled();
        await expect.poll(() => e.renders.length).toBe(2);
        expect(e.renders[1]!.page).toBe(3);
        e.renders[1]!.finish();
        await expect.poll(() => view.target.textContent).toContain('Page 3 of 5');
        expect(view.target.textContent).not.toContain('overlapping canvas');
    });
    it('retires a loading task on unmount and ignores its late failure', async () => {
        const e = engine();
        const view = render('pdf', 'pending.pdf');
        await expect.poll(() => e.loads.length).toBe(1);
        await view.destroy();
        expect(e.loads[0]!.destroy).toHaveBeenCalledTimes(1);
        e.loads[0]!.ready.reject(new Error('late failure'));
        await tick();
        expect(e.renders).toHaveLength(0);
    });
});
// A real playable container avoids native decode errors masking the controls under test.
for (const kind of ['audio', 'video'] as const) {
    describe(`${kind} seeking lifetime`, () => {
        for (const release of ['mouseup', 'pointercancel', 'blur'])
            it(`resumes time updates after an outside ${release}`, async () => {
                const view = render(kind, TINY_VIDEO);
                const media = view.target.querySelector<HTMLMediaElement>(kind)!;
                await expect.poll(() => media.readyState).toBeGreaterThan(0);
                Object.defineProperty(media, 'duration', { configurable: true, value: 100 });
                media.dispatchEvent(new Event('loadedmetadata'));
                flushSync();
                const slider = view.target.querySelector<HTMLInputElement>(`.${kind}-progress`)!;
                expect(slider).not.toBeNull();
                Object.defineProperty(media, 'currentTime', { configurable: true, writable: true, value: 10 });
                media.dispatchEvent(new Event('timeupdate'));
                flushSync();
                expect(Number(slider.value)).toBe(10);
                slider.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                slider.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                media.currentTime = 20;
                media.dispatchEvent(new Event('timeupdate'));
                flushSync();
                expect(Number(slider.value)).toBe(10);
                window.dispatchEvent(new Event(release));
                media.currentTime = 30;
                media.dispatchEvent(new Event('timeupdate'));
                flushSync();
                expect(Number(slider.value)).toBe(30);
            });
    });
}
it('audio clears a prior error on source replacement', async () => {
    const view = render('audio', TINY_VIDEO);
    const audio = view.target.querySelector('audio')!;
    await expect.poll(() => audio.readyState).toBeGreaterThan(0);
    audio.dispatchEvent(new Event('error'));
    flushSync();
    expect(view.target.textContent).toContain('Failed to load audio');
    view.replace(TINY_VIDEO + '#second');
    audio.dispatchEvent(new Event('loadedmetadata'));
    flushSync();
    expect(view.target.querySelector('.audio-player-error')).toBeNull();
    expect(view.target.querySelector('.audio-progress')).not.toBeNull();
});
for (const kind of ['image', 'video'] as const)
    it(`${kind} fullscreen state belongs only to its own container`, async () => {
        const url = kind === 'video' ? TINY_VIDEO : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        const first = render(kind, url);
        const second = render(kind, url);
        const selector = kind === 'video' ? '.video-player' : '.image-preview';
        const own = first.target.querySelector(selector)!;
        let fullscreen: Element | null = own;
        vi.spyOn(document, 'fullscreenElement', 'get').mockImplementation(() => fullscreen);
        document.dispatchEvent(new Event('fullscreenchange'));
        flushSync();
        expect(own.classList.contains('fullscreen')).toBe(true);
        expect(second.target.querySelector(selector)!.classList.contains('fullscreen')).toBe(false);
        fullscreen = null;
        document.dispatchEvent(new Event('fullscreenchange'));
        flushSync();
        expect(own.classList.contains('fullscreen')).toBe(false);
    });
it('PDF ignores a stale getPage result after replacement', async () => {
    const e = engine();
    const view = render('pdf', 'old.pdf');
    await expect.poll(() => e.loads.length).toBe(1);
    const old = e.doc(2);
    const page = deferred<Awaited<ReturnType<PDFTestDocument['getPage']>>>();
    old.getPage = () => page.promise;
    e.loads[0]!.ready.resolve(old);
    await expect.poll(() => view.target.querySelector('canvas')).not.toBeNull();
    view.replace('new.pdf');
    await expect.poll(() => e.loads.length).toBe(2);
    e.loads[1]!.ready.resolve(e.doc(7));
    await expect.poll(() => e.renders.length).toBe(1);
    e.renders[0]!.finish();
    const renderOld = vi.fn(() => ({ promise: Promise.resolve(), cancel() {
        } }));
    page.resolve({ getViewport: () => ({ width: 900, height: 900 }), render: renderOld });
    await tick();
    await expect.poll(() => view.target.textContent).toContain('Page 1 of 7');
    expect(renderOld).not.toHaveBeenCalled();
});
it('PDF cancels a pending render and destroys exactly its loading owner on unmount', async () => {
    const e = engine();
    const view = render('pdf', 'rendering.pdf');
    await expect.poll(() => e.loads.length).toBe(1);
    const doc = e.doc(2);
    e.loads[0]!.ready.resolve(doc);
    await expect.poll(() => e.renders.length).toBe(1);
    await view.destroy();
    expect(e.renders[0]!.cancel).toHaveBeenCalledTimes(1);
    expect(e.loads[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(doc.destroy).not.toHaveBeenCalled();
    e.renders[0]!.cancelled();
    await tick();
});
it('PDF observes asynchronous destruction rejection without poisoning the next source', async () => {
    const e = engine();
    const view = render('pdf', 'old.pdf');
    await expect.poll(() => e.loads.length).toBe(1);
    const failure = new Error('worker cleanup');
    e.loads[0]!.destroy.mockRejectedValueOnce(failure);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {
    });
    view.replace('new.pdf');
    await expect.poll(() => e.loads.length).toBe(2);
    await expect.poll(() => log.mock.calls.length).toBe(1);
    expect(log).toHaveBeenCalledWith('PDF cleanup error:', failure);
    e.loads[1]!.ready.resolve(e.doc(2));
    await expect.poll(() => e.renders.length).toBe(1);
    e.renders[0]!.finish();
    await expect.poll(() => view.target.textContent).toContain('Page 1 of 2');
});
it('audio ignores a rejected play request belonging to a replaced source', async () => {
    const view = render('audio', TINY_VIDEO);
    const audio = view.target.querySelector('audio')!;
    await expect.poll(() => audio.readyState).toBeGreaterThan(0);
    const pending = deferred<void>();
    vi.spyOn(audio, 'play').mockReturnValueOnce(pending.promise);
    button(view.target, 'Play').click();
    view.replace(TINY_VIDEO + '#replacement');
    pending.reject(new Error('old play failure'));
    await tick();
    expect(view.target.querySelector('.audio-player-error')).toBeNull();
});
it('video ignores a rejected play request belonging to a replaced source', async () => {
    const view = render('video', TINY_VIDEO);
    const video = view.target.querySelector('video')!;
    await expect.poll(() => video.readyState).toBeGreaterThan(0);
    const pending = deferred<void>();
    vi.spyOn(video, 'play').mockReturnValueOnce(pending.promise);
    button(view.target, 'Play').click();
    view.replace(TINY_VIDEO + '#replacement');
    pending.reject(new Error('old video play failure'));
    await tick();
    expect(view.target.querySelector('.video-playback-notice')).toBeNull();
});
it('video releases its owned media source on unmount', async () => {
    const view = render('video', TINY_VIDEO);
    const video = view.target.querySelector('video')!;
    await expect.poll(() => video.readyState).toBeGreaterThan(0);
    const pause = vi.spyOn(video, 'pause');
    const load = vi.spyOn(video, 'load');
    await view.destroy();
    expect(pause).toHaveBeenCalledTimes(1);
    expect(video.hasAttribute('src')).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
});
for (const kind of ['image', 'video'] as const)
    it(`${kind} toggles the actual fullscreen owner even before the change event arrives`, async () => {
        const url = kind === 'video' ? TINY_VIDEO : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        const view = render(kind, url);
        const own = view.target.querySelector<HTMLElement>(kind === 'video' ? '.video-player' : '.image-preview')!;
        let fullscreen: Element | null = own;
        vi.spyOn(document, 'fullscreenElement', 'get').mockImplementation(() => fullscreen);
        const exit = vi.spyOn(document, 'exitFullscreen').mockResolvedValue();
        const request = vi.spyOn(own, 'requestFullscreen').mockResolvedValue();
        document.dispatchEvent(new Event('fullscreenchange'));
        flushSync();
        fullscreen = document.body;
        button(view.target, kind === 'video' ? 'Fullscreen' : 'Exit fullscreen').click();
        await tick();
        expect(exit).not.toHaveBeenCalled();
        expect(request).toHaveBeenCalledTimes(1);
    });
it('video picture-in-picture exits only its owner document', async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    cleanups.push(async () => {
        frame.remove();
    });
    const doc = frame.contentDocument!;
    const view = render('video', TINY_VIDEO, doc);
    const video = view.target.querySelector('video')!;
    await expect.poll(() => video.readyState).toBeGreaterThan(0);
    Object.defineProperty(doc, 'pictureInPictureElement', { configurable: true, get: () => video });
    const exit = vi.fn(async () => {
    });
    Object.defineProperty(doc, 'exitPictureInPicture', { configurable: true, value: exit });
    const request = vi.spyOn(video, 'requestPictureInPicture').mockResolvedValue({} as PictureInPictureWindow);
    button(view.target, 'Picture-in-Picture').click();
    await tick();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
});
