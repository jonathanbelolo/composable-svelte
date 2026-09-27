/**
 * Built-in representation providers for live and replaced content (no application code):
 * - canvas (2D/WebGL): live mirror through captureStream() (automatic frame acquisition, P3b-A) with an
 *   immediate drawImage underlay; tainted/unsupported streams fall back to per-frame drawImage.
 * - video (URL sources): a muted, inert decorative player seeded to the source's media state, drift-
 *   corrected while the source lives and retained after its retirement (P3b-C). MediaStream `srcObject`
 *   sources share the stream with a decorative player; MediaSource and blob: sources resume the detached real
 *   element (video.ts, media-owned). Encrypted sources settle their participant (S4).
 * - iframe: same-origin documents are projected (bounded); cross-origin frames are declined (reported).
 */
import type { ProvidedRepresentation, RepresentationContext, RepresentationProvider, RetainedRenderer } from './types.js';
import { ProjectionJob } from './projection.js';
import { representDetachedVideo, representStreamVideo } from './video.js';

let live = 0;
/** Live built-in media resources (mirrors, players), for resource ledgers and tests. */
export function liveMediaResources(): number { return live; }
const acquire = (release: () => void): (() => void) => { live++; let done = false; return () => { if (done) return; done = true; live--; release(); }; };

function decorativeVideo(doc: Document): HTMLVideoElement {
  const video = doc.createElement('video');
  video.muted = true; video.defaultMuted = true; video.playsInline = true; video.controls = false; video.disableRemotePlayback = true;
  video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.setAttribute('aria-hidden', 'true'); video.tabIndex = -1;
  video.style.cssText = 'display:block;width:100%;height:100%;object-fit:fill;pointer-events:none;';
  return video;
}

export const canvasProvider: RepresentationProvider = {
  name: 'canvas',
  represent(source: Element, context: RepresentationContext): ProvidedRepresentation | undefined {
    if (source.localName !== 'canvas' || source.namespaceURI !== 'http://www.w3.org/1999/xhtml') return undefined; // realm-independent (same-origin frames)
    const canvas = source as HTMLCanvasElement;
    const doc = context.document;
    const box = doc.createElement('div');
    box.style.cssText = 'position:relative;width:100%;height:100%;';
    const underlay = doc.createElement('canvas');
    underlay.width = canvas.width; underlay.height = canvas.height;
    underlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    const paint = () => { try { const ctx = underlay.getContext('2d'); ctx?.clearRect(0, 0, underlay.width, underlay.height); ctx?.drawImage(canvas, 0, 0); } catch { /* unreadable frame */ } };
    paint();
    box.appendChild(underlay);
    let stream: MediaStream | undefined;
    let video: HTMLVideoElement | undefined;
    try { stream = canvas.captureStream(); } catch { stream = undefined; }
    let ready: Promise<void> | undefined;
    if (stream) {
      video = decorativeVideo(doc);
      video.style.position = 'absolute'; video.style.inset = '0'; video.style.visibility = 'hidden';
      video.srcObject = stream;
      box.appendChild(video);
      const shown = video;
      ready = new Promise<void>(resolve => {
        const show = () => { shown.style.visibility = 'visible'; resolve(); };
        if (typeof shown.requestVideoFrameCallback === 'function') shown.requestVideoFrameCallback(() => show());
        else shown.addEventListener('loadeddata', show, { once: true });
        context.signal.addEventListener('abort', () => resolve(), { once: true });
      });
      void shown.play().catch(() => context.diagnose('canvasMirrorPlayRejected'));
    } else context.diagnose('canvasStreamUnavailable');
    const release = acquire(() => { stream?.getTracks().forEach(track => track.stop()); if (video) { video.srcObject = null; video.remove(); } });
    let retired = false;
    return {
      node: box, continuity: 'live', ready,
      // Without a stream (tainted or unsupported), a 2D source is mirrored by copying each frame while it lives.
      frame() { if (!stream && !retired && source.isConnected) paint(); },
      retire() { retired = true; context.diagnose('canvasRetiredWithoutRenderer'); },
      dispose: release
    };
  }
};

export const videoProvider: RepresentationProvider = {
  name: 'video',
  represent(source: Element, context: RepresentationContext): ProvidedRepresentation | { declined: string; settle?: boolean } | undefined {
    if (source.localName !== 'video' || source.namespaceURI !== 'http://www.w3.org/1999/xhtml') return undefined;
    return representVideo(source as HTMLVideoElement, context);
  }
};
function representVideo(source: HTMLVideoElement, context: RepresentationContext): ProvidedRepresentation | { declined: string; settle?: boolean } {
  {
    // Encrypted media first: nothing below may copy protected pixels. The participant settles (S4) rather than
    // animating a blank or frozen box.
    if ((source as HTMLVideoElement & { mediaKeys?: unknown }).mediaKeys) return { declined: 'videoSourceUnqualified:encrypted', settle: true };
    // Media-owned module (remaining-media-interface.md, final 15:50Z): a MediaStream shares the stream with a decorative
    // player; a MediaSource/MediaSourceHandle or blob: source resumes the detached real element with a mirror.
    const stream = representStreamVideo(source, context, { acquire, decorativeVideo });
    if (stream) return stream;
    // srcObject MediaSource/MediaSourceHandle: detached resume directly (no URL to replay).
    const detached = source.srcObject ? representDetachedVideo(source, context, { acquire }) : undefined;
    if (detached) return detached;
    if (source.srcObject) return { declined: 'videoSourceUnqualified:srcObject' };
    const url = source.currentSrc || source.src;
    if (!url) return { declined: 'videoSourceUnqualified:noSource' };
    const doc = context.document;
    const box = doc.createElement('div');
    box.style.cssText = 'position:relative;width:100%;height:100%;';
    // Underlay: the source's current frame, shown until the decorative player has its first frame.
    const underlay = doc.createElement('canvas');
    underlay.width = source.videoWidth || source.clientWidth || 1; underlay.height = source.videoHeight || source.clientHeight || 1;
    underlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    try { underlay.getContext('2d')?.drawImage(source, 0, 0, underlay.width, underlay.height); } catch { /* unreadable */ }
    box.appendChild(underlay);
    const player = decorativeVideo(doc);
    player.style.position = 'absolute'; player.style.inset = '0'; player.style.visibility = 'hidden';
    player.style.objectFit = getComputedStyle(source).objectFit;
    if (source.crossOrigin !== null) player.crossOrigin = source.crossOrigin;
    player.preload = 'auto'; player.loop = source.loop; player.playbackRate = source.playbackRate;
    player.src = url;
    box.appendChild(player);
    // blob: sources may be a MediaSource object URL (the standard MSE pattern), which attaches to one element only,
    // so the replay fails; a file blob replays as before. The detached path (resume the real element after its
    // removal, mirrored) is prepared dormant — hidden, never touching the element — and takes over only if the
    // replay errors. `retire()` is forwarded to it so it holds the owner's retirement-time state even when the
    // error arrives later (a within-page run prepares and retires in one flush; the load error is asynchronous).
    const fallback = url.startsWith('blob:') ? representDetachedVideo(source, context, { acquire }) : undefined;
    let fallbackRetained: RetainedRenderer | undefined;
    let fallbackActive = false;
    if (fallback) {
      fallback.node.style.position = 'absolute'; fallback.node.style.inset = '0'; fallback.node.style.visibility = 'hidden';
      box.appendChild(fallback.node);
    }
    let sourceLive = true;
    // The owner's playing state at retirement (the source is still connected then). A within-page run prepares and
    // retires in one flush, so metadata can arrive after the source was removed (and paused by removal).
    let retiredPlaying: boolean | undefined;
    const ownerPlaying = () => (sourceLive ? !source.paused : retiredPlaying ?? false);
    const release = acquire(() => { player.pause(); player.removeAttribute('src'); try { player.load(); } catch { /* released */ } player.remove(); });
    const ready = new Promise<void>(resolve => {
      const done = () => { resolve(); };
      context.signal.addEventListener('abort', done, { once: true });
      player.addEventListener('loadedmetadata', () => {
        try { player.currentTime = source.currentTime; } catch { /* seek later */ }
        player.addEventListener('seeked', () => { player.style.visibility = 'visible'; done(); }, { once: true });
        if (ownerPlaying()) void player.play().catch(() => context.diagnose('videoPlayerPlayRejected'));
      }, { once: true });
      // A source the decorative player cannot load (e.g. a MediaSource object URL, which attaches once): the static
      // current-frame underlay stays, the failure is reported, and the player is released now (not at settle).
      player.addEventListener('error', () => {
        context.diagnose('videoPlayerFailed');
        release();
        if (fallback) {
          // Same observation at the moment of activation: a reclaim in progress is recorded before any frame runs.
          if (fallbackRetained && source.isConnected) fallbackRetained.frame?.(0);
          fallbackActive = true;
          fallback.node.style.visibility = 'visible';
          underlay.style.visibility = 'hidden';
          context.diagnose('videoDetachedFallback');
        }
        done();
      }, { once: true });
    });
    const follow = () => {
      if (!sourceLive || !source.isConnected || player.readyState < 1) return;
      if (source.paused !== player.paused) { if (source.paused) player.pause(); else void player.play().catch(() => {}); }
      if (Math.abs(player.currentTime - source.currentTime) > 0.12) { try { player.currentTime = source.currentTime; } catch { /* drift correction best effort */ } }
      if (player.playbackRate !== source.playbackRate) player.playbackRate = source.playbackRate;
    };
    // Either/or terminal disposal: whichever of the two core calls, both resources are released exactly once.
    const disposeAll = () => { release(); fallbackRetained?.dispose(); fallback?.dispose(); };
    const fallbackFrame = (time: number) => {
      if (fallbackActive) { (fallbackRetained ?? fallback)?.frame?.(time); return; }
      // Dormant: ownership observation stays alive WITHOUT touching the source. A source found connected after
      // retirement has been reclaimed by its owner; the fallback records that permanently (its only possible write —
      // restoring a mute it applied — cannot happen: it applied none). A disconnected source is not forwarded while
      // dormant, since that is where the fallback would mute/resume.
      if (fallbackRetained && source.isConnected) fallbackRetained.frame?.(time);
    };
    return {
      node: box, continuity: 'retained', ready,
      frame: (time: number) => { if (fallbackActive) fallbackFrame(time); else follow(); },
      retire(): RetainedRenderer {
        // The business-owned player retires (and pauses); decorative playback continues under the visual run.
        retiredPlaying = !source.paused;
        sourceLive = false;
        if (retiredPlaying && player.readyState >= 1 && player.paused) void player.play().catch(() => context.diagnose('videoPlayerPlayRejected'));
        fallbackRetained = fallback?.retire?.() ?? undefined;
        return { frame: fallbackFrame, dispose: disposeAll };
      },
      dispose: disposeAll
    };
  }
}

export function iframeProvider(budget: { readonly providers: () => readonly RepresentationProvider[] }): RepresentationProvider {
  return {
    name: 'iframe',
    represent(source: Element, context: RepresentationContext): ProvidedRepresentation | { declined: string; settle?: boolean } | undefined {
      if (source.localName !== 'iframe') return undefined;
      let inner: Document | null = null;
      try { inner = (source as HTMLIFrameElement).contentDocument; } catch { inner = null; }
      if (!inner || !inner.documentElement) return { declined: 'crossOriginFrame' };
      // Nested providers get the same per-representation contract as top-level ones: their own abort signal,
      // failure isolation (a throwing sibling is disposed alone) and exactly-once disposal.
      const signals = new WeakMap<RepresentationContext, AbortController>();
      const nestedContext = (): RepresentationContext => { const own = new AbortController(); context.signal.addEventListener('abort', () => own.abort(), { once: true }); const created: RepresentationContext = { ...context, signal: own.signal }; signals.set(created, own); return created; };
      const job = new ProjectionJob(inner.documentElement as unknown as HTMLElement, { providers: budget.providers(), context: nestedContext });
      job.step(Infinity);
      const result = job.finish();
      const box = context.document.createElement('div');
      box.style.cssText = 'width:100%;height:100%;overflow:hidden;';
      box.appendChild(result.root);
      const scroller = inner.scrollingElement;
      if (result.copyRoot && scroller && (scroller.scrollTop || scroller.scrollLeft)) result.copyRoot.style.setProperty('translate', `${-scroller.scrollLeft}px ${-scroller.scrollTop}px`);
      const nested = result.provided.map(entry => entry.representation);
      const nameOf = (rep: ProvidedRepresentation) => result.provided.find(entry => entry.representation === rep)?.provider ?? 'nested';
      // Nested acquisition readiness is observed and forwarded (rejections reported, never unhandled).
      const nestedReady = nested.filter(rep => rep.ready).map(rep => rep.ready!.then(() => undefined, error => context.diagnose(`provider:${nameOf(rep)}:readyFailed:${String(error)}`)));
      const retained = new Map<ProvidedRepresentation, RetainedRenderer>();
      const released = new Set<ProvidedRepresentation>();
      const release = (rep: ProvidedRepresentation) => {
        if (released.has(rep)) return;
        released.add(rep);
        const renderer = retained.get(rep);
        try { if (renderer) renderer.dispose(); else rep.dispose(); } catch (error) { context.diagnose(`provider:${nameOf(rep)}:disposeFailed:${String(error)}`); }
        const entry = result.provided.find(item => item.representation === rep); if (entry) signals.get(entry.context)?.abort();
      };
      let attached = false, retired = false, disposed = false;
      // S4 inside the frame: the containing participant settles. Acquisitions already made for the discarded nested
      // projection are disposed (and their signals aborted) exactly once, here; nothing of it is returned.
      if (result.settled.length) { releaseNested(); return { declined: `nested:${result.settled.map(item => item.reason).join(',')}`, settle: true }; }
      const continuity = nested.some(rep => rep.continuity === 'retained') ? 'retained' : nested.some(rep => rep.continuity === 'live') ? 'live' : 'static';
      const frameAll = (time: number) => {
        for (const rep of nested) {
          if (released.has(rep)) continue;
          const renderer = retained.get(rep);
          if (retired && !renderer) continue;
          try { if (renderer) renderer.frame?.(time); else rep.frame?.(time); }
          catch (error) { context.diagnose(`provider:${nameOf(rep)}:frameFailed:${String(error)}`); release(rep); }
        }
      };
      return {
        node: box, continuity, ...(nestedReady.length ? { ready: Promise.all(nestedReady).then(() => undefined) } : {}),
        frame(time) { if (!attached && box.isConnected) { attached = true; job.attach(); } frameAll(time); },
        retire() {
          retired = true;
          for (const rep of nested) {
            if (released.has(rep)) continue;
            let renderer: RetainedRenderer | void = undefined;
            try { renderer = rep.retire?.(); } catch (error) { context.diagnose(`provider:${nameOf(rep)}:retireFailed:${String(error)}`); }
            if (renderer) retained.set(rep, renderer);
          }
          return nested.length ? { frame: frameAll, dispose: () => releaseNested() } : undefined;
        },
        dispose: () => releaseNested()
      };
      function releaseNested() { if (disposed) return; disposed = true; for (const rep of nested) release(rep); for (const animation of result.replayed) animation.cancel(); }
    }
  };
}
