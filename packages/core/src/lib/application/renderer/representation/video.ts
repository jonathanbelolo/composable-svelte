/**
 * Ordinary <video> whose `srcObject` is a MediaStream (camera, screen, WebRTC, canvas capture):
 * a decorative, muted player shares the owner's SAME stream, so decoded frames keep arriving after
 * the source's page is removed — in every tested engine (remaining-media-interface.md, R1) — for
 * exactly as long as the owner keeps the stream alive. It never clones or stops the owner's tracks,
 * so no device is kept on beyond the owner's own cleanup; when the owner stops them, frames stop
 * and that is reported rather than shown as live.
 *
 * Integrated by core's built-in video provider (builtins.ts), which supplies its resource ledger
 * and decorative player factory. Any other source returns `undefined` (the caller continues).
 */
import type { ProvidedRepresentation, RepresentationContext, RetainedRenderer } from './types.js';

/** The source's own realm: a same-origin iframe's media objects are not the host's globals. */
type MediaRealm = typeof globalThis & { MediaSource?: typeof MediaSource; MediaSourceHandle?: new () => object; MediaStream?: typeof MediaStream };
const realmOf = (source: Element): MediaRealm => (source.ownerDocument.defaultView ?? globalThis) as MediaRealm;

export interface StreamVideoDeps {
  /** Core's resource ledger acquisition, so counters are not duplicated. Returns the idempotent release. */
  acquire(release: () => void): () => void;
  /** Core's decorative <video> factory (muted, inert, aria-hidden, no controls, tabIndex -1). */
  decorativeVideo(doc: Document): HTMLVideoElement;
}

export function representStreamVideo(
  source: HTMLVideoElement,
  context: RepresentationContext,
  deps: StreamVideoDeps
): ProvidedRepresentation | undefined {
  const realm = realmOf(source);
  const stream = source.srcObject;
  if (!realm.MediaStream || !(stream instanceof realm.MediaStream)) return undefined;
  const doc = context.document;
  const box = doc.createElement('div');
  box.style.cssText = 'position:relative;width:100%;height:100%;';

  // Underlay: the source's current frame, until the decorative player presents its own.
  const underlay = doc.createElement('canvas');
  underlay.width = source.videoWidth || source.clientWidth || 1;
  underlay.height = source.videoHeight || source.clientHeight || 1;
  underlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  try { underlay.getContext('2d')?.drawImage(source, 0, 0, underlay.width, underlay.height); } catch { /* unreadable frame */ }
  box.appendChild(underlay);

  const player = deps.decorativeVideo(doc);
  player.style.position = 'absolute';
  player.style.inset = '0';
  player.style.visibility = 'hidden';
  try { player.style.objectFit = realm.getComputedStyle(source).objectFit; } catch { /* default fit */ }
  player.srcObject = stream;
  box.appendChild(player);

  // Observe (never control) the owner's tracks: when all have ended, the continuation has ended.
  // Polled every frame as well as on `ended`: a track the owner stops with `stop()` fires no `ended`.
  const tracks = stream.getVideoTracks();
  let reportedEnd = false;
  const onEnded = () => {
    if (reportedEnd || !tracks.every(track => track.readyState === 'ended')) return;
    reportedEnd = true;
    context.diagnose('videoStreamEnded');
  };
  for (const track of tracks) track.addEventListener('ended', onEnded);

  const ready = new Promise<void>(resolve => {
    const show = () => { player.style.visibility = 'visible'; resolve(); };
    if (typeof player.requestVideoFrameCallback === 'function') player.requestVideoFrameCallback(() => show());
    else player.addEventListener('loadeddata', show, { once: true });
    context.signal.addEventListener('abort', () => resolve(), { once: true });
  });
  if (!source.paused) void player.play().catch(() => context.diagnose('videoPlayerPlayRejected'));

  const release = deps.acquire(() => {
    for (const track of tracks) track.removeEventListener('ended', onEnded);
    player.pause();
    player.srcObject = null;
    player.remove();
  });
  let sourceLive = true;
  return {
    node: box,
    continuity: 'retained',
    ready,
    // While the source lives, follow its paused/playing state (the owner may pause).
    frame() {
      onEnded();
      if (!sourceLive || !source.isConnected) return;
      if (source.paused !== player.paused) { if (source.paused) player.pause(); else void player.play().catch(() => {}); }
    },
    retire(): RetainedRenderer {
      // The owner's element retires; the shared stream keeps decoding under the visual run.
      // Mirrors the owner's state at this moment (the source is still connected): a paused source
      // stays paused, a playing one keeps playing.
      const playing = !source.paused;
      sourceLive = false;
      if (playing && player.paused) void player.play().catch(() => context.diagnose('videoPlayerPlayRejected'));
      if (!playing && !player.paused) player.pause();
      onEnded();
      return { frame: onEnded, dispose: release };
    },
    dispose: release
  };
}

/**
 * Ordinary <video> whose media cannot be shared or replayed by a second decoder — MSE (a
 * MediaSource attaches to one element), `srcObject` MediaSource/MediaSourceHandle, or a `blob:`
 * source. Removal only pauses a media element: its media data and MediaSource attachment survive
 * (remaining-media-interface.md, R2 — every tested engine, with or without `moveBefore`). So after
 * the source's page is removed, the visual run resumes the DETACHED element, muted, and mirrors its
 * decoded frames into a canvas in the representation. The element is never re-parented, never given
 * a place in the page, and never kept past disposal.
 *
 * Authority is bounded and relinquished: if the application puts the element back into a document,
 * the mirror stops touching it at once and restores its `muted` state; disposal pauses it (only if
 * the run resumed it) and restores `muted`. Svelte removes its own media listeners at teardown, so
 * resumption does not reach retired component handlers. Other sources return `undefined`.
 */
export function representDetachedVideo(
  source: HTMLVideoElement,
  context: RepresentationContext,
  deps: Pick<StreamVideoDeps, 'acquire'>
): ProvidedRepresentation | undefined {
  // Protected (EME) media: decoded frames may be unavailable to drawImage by design (EME §6, "MAY
  // behave as if no media data was present"), so a mirror could be blank. Never mirrored here.
  if ((source as HTMLVideoElement & { mediaKeys?: unknown }).mediaKeys) return undefined;
  const realm = realmOf(source);
  const object = source.srcObject;
  const mediaSource = (!!realm.MediaSource && object instanceof realm.MediaSource)
    || (typeof realm.MediaSourceHandle === 'function' && object instanceof realm.MediaSourceHandle);
  const blob = !object && (source.currentSrc || source.src).startsWith('blob:');
  if (!mediaSource && !blob) return undefined;

  const doc = context.document;
  const canvas = doc.createElement('canvas');
  canvas.width = source.videoWidth || source.clientWidth || 1;
  canvas.height = source.videoHeight || source.clientHeight || 1;
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  const paint = canvas.getContext('2d');
  const copy = () => { try { paint?.drawImage(source, 0, 0, canvas.width, canvas.height); } catch { /* frame not ready */ } };
  copy();

  // Captured at retirement (the source is still connected then): the owner's latest state.
  let wasPlaying = false, ownMuted = false;
  let muted = false, resumed = false, relinquished = false, retired = false;
  // Ownership is decided from the element's state at the point of touch, never from queued events:
  // - the run only ever sets `muted = true`, so it restores the owner's value only while the element is
  //   still muted at that instant (anything else is the owner's newer choice; re-setting the same value
  //   is indistinguishable and left as is);
  const restoreMuted = () => { if (muted && !ownMuted && source.muted) source.muted = false; };
  const relinquish = () => {
    if (relinquished) return;
    relinquished = true;
    if (resumed && !source.isConnected && !source.paused) source.pause();
    restoreMuted();
  };
  const release = deps.acquire(() => { if (!reclaimed) relinquish(); });
  // - `retire()` is only called when removal is established (same flush), so the source found
  //   connected at ANY frame after retirement has been reclaimed by its owner — even before the run's
  //   first detached frame. From then on the run never touches it again, and disposal does nothing.
  let reclaimed = false;
  // While the source is in the page (before retirement): copy its frames. After retirement and removal:
  // mute it at once (retired business audio), then resume it once — only after the removal's own pause
  // has applied (HTML runs a removed media element's pause steps after a stable state; a resume issued
  // before that is cancelled by it). Resumed once: a later pause by the application is never overridden.
  const frame = () => {
    if (relinquished || reclaimed) return;
    if (source.isConnected) {
      if (retired) {
        reclaimed = true;
        relinquished = true;
        if (muted && !ownMuted && source.muted) source.muted = false;
        context.diagnose('videoElementReclaimed');
        return;
      }
      copy();
      return;
    }
    if (retired) {
      if (!muted) { muted = true; source.muted = true; }
      if (wasPlaying && !resumed && source.paused) {
        resumed = true;
        void source.play().catch((error: unknown) => context.diagnose(`videoResumeRejected:${error instanceof Error ? error.name : 'unknown'}`));
      }
    }
    copy();
  };
  return {
    node: canvas,
    continuity: 'retained',
    frame,
    retire(): RetainedRenderer {
      retired = true;
      wasPlaying = !source.paused;
      ownMuted = source.muted;
      return { frame, dispose: release };
    },
    dispose: release
  };
}
