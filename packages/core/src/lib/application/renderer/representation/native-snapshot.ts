/**
 * Native snapshot provider (opt-in: `fluidMotion({ nativeSnapshot: 'namedParticipants' })`) for content the
 * structural projection cannot reach (cross-origin iframes). At the route cue, only those elements are named;
 * the document root is excluded and the transition overlay is non-interactive, so real controls stay usable
 * (P4b). The route commit runs inside the transition's update callback; the browser's static old-state image
 * of each element is then driven every frame by the visual run (WAAPI on its ::view-transition-group) to follow
 * the element's representation, and is released when the run settles (P9).
 * Constraints (P4/P9, Chromium 141 and WebKit 26; absent in Firefox 142): one view transition per document —
 * any later view transition ends earlier native snapshots; within-page runs cannot use it (their commit is
 * immediate); the old-state image is static.
 */
export interface NativeEntry {
  readonly element: Element;
  /** Offset of the element's border box from its participant's border box at capture, and its size. */
  readonly offset: readonly [number, number];
  readonly size: readonly [number, number];
}
let serial = 0;
let active: NativeSnapshotSession | undefined;
/** The session currently owning the document's view transition (adoption across supersession). */
export function activeNativeSession(): NativeSnapshotSession | undefined { return active?.live ? active : undefined; }
type ViewTransitionLike = { readonly ready: Promise<void>; readonly finished: Promise<void>; readonly updateCallbackDone: Promise<void>; skipTransition(): void };

export class NativeSnapshotSession {
  static available(doc: Document): boolean { return typeof (doc as Document & { startViewTransition?: unknown }).startViewTransition === 'function'; }
  private readonly names: string[] = [];
  private readonly previous: string[] = [];
  private style: HTMLStyleElement | undefined;
  private transition: ViewTransitionLike | undefined;
  private readonly drivers = new Map<number, Animation>();
  private ready = false;
  private ended = false;
  /** The owning run (a successor adopts the session). */
  owner: object;
  constructor(private readonly doc: Document, readonly entries: readonly NativeEntry[], owner: object, private readonly report: (reason: string) => void) { this.owner = owner; }
  get live(): boolean { return !this.ended; }
  /** Name the entries and start the transition; `update` performs the route commit. False when unavailable. */
  start(update: () => Promise<void> | void, durationMs: number): boolean {
    if (!NativeSnapshotSession.available(this.doc) || !this.entries.length) return false;
    // A later view transition ends earlier native snapshots: end ours first, reported.
    if (active?.live && active !== this) { active.report('nativeSnapshotEndedByNewTransition'); active.end(); }
    const id = ++serial;
    const rules: string[] = ['::view-transition{pointer-events:none}', ':root{view-transition-name:none}'];
    this.entries.forEach((entry, index) => {
      const name = `composable-native-${id}-${index}`;
      this.names.push(name);
      const style = (entry.element as HTMLElement).style;
      this.previous.push(style.getPropertyValue('view-transition-name'));
      style.setProperty('view-transition-name', name);
      rules.push(`::view-transition-group(${name}),::view-transition-image-pair(${name}),::view-transition-old(${name}),::view-transition-new(${name}){animation:none}`);
    });
    this.style = this.doc.createElement('style');
    this.style.setAttribute('data-composable-native-snapshot', '');
    this.style.textContent = rules.join('\n');
    this.doc.head.appendChild(this.style);
    try {
      this.transition = (this.doc as Document & { startViewTransition(callback: () => Promise<void> | void): ViewTransitionLike }).startViewTransition(() => update());
    } catch (error) { this.report(`nativeSnapshotFailed:${String(error)}`); this.end(); return false; }
    active = this;
    this.transition.ready.then(() => {
      if (this.ended) return;
      this.ready = true;
      this.names.forEach((name, index) => {
        const hold = (transform: string) => [{ transform, opacity: 1 }, { transform, opacity: 1 }];
        try { this.drivers.set(index, this.doc.documentElement.animate(hold('none'), { pseudoElement: `::view-transition-group(${name})`, duration: Math.max(1, durationMs) + 60000, fill: 'forwards' })); }
        catch (error) { this.report(`nativeSnapshotDriveFailed:${String(error)}`); }
      });
    }, error => { this.report(`nativeSnapshotNotReady:${String(error)}`); this.end(); });
    // Ended by the browser or by another transition before we release it: reported, resources released.
    this.transition.finished.then(() => { if (!this.ended) { this.report('nativeSnapshotEndedByNewTransition'); this.end(); } }, () => {});
    return true;
  }
  /** Write phase: place entry `index` for a representation box at (x, y) sized (width, height), with opacity. */
  drive(index: number, x: number, y: number, scaleX: number, scaleY: number, opacity: number): void {
    if (this.ended || !this.ready) return;
    const driver = this.drivers.get(index);
    const entry = this.entries[index];
    if (!driver || !entry || !driver.effect) return;
    const tx = x + entry.offset[0] * scaleX, ty = y + entry.offset[1] * scaleY;
    const transform = `translate(${tx}px, ${ty}px)${scaleX !== 1 || scaleY !== 1 ? ` scale(${scaleX}, ${scaleY})` : ''}`;
    const frame = { transform, opacity: Math.min(1, Math.max(0, opacity)), width: `${entry.size[0]}px`, height: `${entry.size[1]}px`, transformOrigin: '0 0' };
    try { (driver.effect as KeyframeEffect).setKeyframes([frame, frame]); } catch { /* ended between frames */ }
  }
  /** Release everything: the transition, driving effects, names and rules. Idempotent. */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    if (active === this) active = undefined;
    for (const driver of this.drivers.values()) { try { driver.cancel(); } catch { /* released */ } }
    this.drivers.clear();
    try { this.transition?.skipTransition(); } catch { /* already finished */ }
    this.entries.forEach((entry, index) => {
      if (!entry.element.isConnected) return;
      const style = (entry.element as HTMLElement).style;
      if (this.previous[index]) style.setProperty('view-transition-name', this.previous[index]!); else style.removeProperty('view-transition-name');
    });
    this.style?.remove();
  }
}
/** Live native sessions (resource ledger). */
export function liveNativeSessions(): number { return active?.live ? 1 : 0; }
