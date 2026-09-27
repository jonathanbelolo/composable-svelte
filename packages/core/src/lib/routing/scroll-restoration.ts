/**
 * Binding-owned scroll restoration (internal). Contract: fluid-layout-motion-design.md "Scroll restoration
 * ownership" and "Plane and scrolling". The attached route binding is the only writer: it calls these hooks around
 * its own history writes and traversal settlements; the Host calls `checkpoint()` after render, before measurement.
 * Explicit browser injection keeps imports DOM-free.
 */
import type { HistoryEntry, HistoryMetadataCodec, HistoryPort } from './managed-history.js';

export type ScrollPolicy = 'top' | 'preserve' | 'entry-restore' | 'fragment';
export type ScrollCause = 'push' | 'replace' | 'traversal';
export type RouteScrollEvent = { readonly type: 'applied' | 'user' | 'pageRestored' };

/** Persisted record inside `__composableRoute.scroll`. Versioned, finite, bounded. */
export interface PersistedScroll {
  readonly v: 1;
  readonly x: number;
  readonly y: number;
  readonly c?: Readonly<Record<string, readonly [number, number]>> | undefined;
}

/** Fixed choices (documented in scroll-report.md): not configurable until qualified. */
export const SCROLL_LIMITS = Object.freeze({
  /** In-memory entries retained (LRU). */
  entries: 64,
  /** Declared keyed containers per application. */
  containers: 8,
  /** Scroll idle before an opportunistic persist. */
  idleMs: 250,
  /** Minimum spacing between idle persists (browsers throttle history writes). */
  persistIntervalMs: 1000
});

interface Position { readonly x: number; readonly y: number; readonly c: ReadonlyMap<string, readonly [number, number]> }

export interface ScrollOwnershipOptions {
  readonly window: Window;
  readonly port: HistoryPort;
  readonly codec: HistoryMetadataCodec;
  readonly containers?: readonly string[] | undefined;
  readonly report: (error: unknown) => void;
}

/** Hooks the binding calls; never exposed to application authors. */
export interface RouteScrollHooks {
  attached(): void;
  beforePush(): void;
  /** A semantic route commit (push, replace, or a route traversal that dispatched its domain action). */
  request(policy: ScrollPolicy): void;
  /**
   * Physical movement settled without a semantic route commit (same-route Back/Forward, native fragment
   * navigation). Never consults the application policy: a saved entry position is restored; otherwise browser
   * anchor behavior stands.
   */
  physical(): void;
  /** A settled traversal changed the current entry (identity), before any render. */
  entryChanged(): void;
  detached(): void;
}

export interface RouteScrollSeam {
  checkpoint(): void;
  subscribe(listener: (event: RouteScrollEvent) => void): () => void;
}

export interface ScrollOwnership extends RouteScrollHooks, RouteScrollSeam {
  /** True while a policy waits for its checkpoint. */
  readonly pending: boolean;
}

/** Documents whose first attachment already consumed the one post-load restore. */
const restoredDocuments = new WeakSet<object>();

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Validates a persisted record; malformed values are ignored (never a routing failure). */
export function readPersistedScroll(value: unknown, containers: readonly string[] = []): Position | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Partial<PersistedScroll>;
  if (record.v !== 1 || !finite(record.x) || !finite(record.y)) return undefined;
  const c = new Map<string, readonly [number, number]>();
  if (record.c !== undefined) {
    if (!record.c || typeof record.c !== 'object') return undefined;
    const keys = Object.keys(record.c);
    if (keys.length > SCROLL_LIMITS.containers) return undefined;
    for (const key of keys) {
      const pair = (record.c as Record<string, unknown>)[key];
      if (!Array.isArray(pair) || pair.length !== 2 || !finite(pair[0]) || !finite(pair[1])) return undefined;
      if (containers.includes(key)) c.set(key, [pair[0], pair[1]]);
    }
  }
  return { x: record.x, y: record.y, c };
}

function persisted(position: Position): PersistedScroll {
  const c: Record<string, readonly [number, number]> = {};
  for (const [key, pair] of position.c) c[key] = pair;
  return position.c.size > 0 ? { v: 1, x: position.x, y: position.y, c } : { v: 1, x: position.x, y: position.y };
}

export function validateScrollContainers(value: unknown): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(key => typeof key !== 'string' || key.length === 0))
    throw new TypeError('Route scroll containers must be nonempty string keys');
  if (value.length > SCROLL_LIMITS.containers) throw new RangeError(`Route scroll ownership supports at most ${SCROLL_LIMITS.containers} keyed containers`);
  if (new Set(value).size !== value.length) throw new TypeError('Route scroll container keys must be unique');
  return Object.freeze([...value as string[]]);
}

export function createScrollOwnership(options: ScrollOwnershipOptions): ScrollOwnership {
  const { window: browser, port, codec } = options;
  const containers = options.containers ?? [];
  const document = browser.document;
  const memory = new Map<string, Position>();
  const listeners = new Set<(event: RouteScrollEvent) => void>();
  let recordedMode: ScrollRestoration | undefined;
  let attached = false;
  let currentKey: string | undefined;
  let pending: { readonly kind: ScrollPolicy | 'load' | 'physical'; readonly unclaimed?: boolean } | undefined;
  /** The last settled arrival had no framework identity before it was claimed (a brand-new physical entry). */
  let arrivalUnclaimed = false;
  let lastApplied: Position | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let lastPersist = Number.NEGATIVE_INFINITY;
  let loadRecord: Position | undefined;
  /** Identity the arriving entry carried before the connection (re)claimed it during this traversal. */
  let arrivingKey: string | undefined;
  const stops: Array<() => void> = [];

  const report = (error: unknown) => { try { options.report(error); } catch { /* Diagnostics cannot change control flow. */ } };
  const emit = (type: RouteScrollEvent['type']) => {
    for (const listener of [...listeners]) { try { listener({ type }); } catch (error) { report(error); } }
  };
  const currentEntry = (): HistoryEntry | undefined => {
    try { return codec.read(port.read().state); } catch { return undefined; }
  };
  const keyOf = (entry: HistoryEntry | undefined) => entry ? `${entry.chain}\u0000${entry.id}\u0000${entry.index}` : undefined;
  const container = (key: string): Element | null => {
    try { return document.querySelector(`[data-composable-scroll="${CSS.escape(key)}"]`); } catch { return null; }
  };
  const sample = (): Position => {
    const c = new Map<string, readonly [number, number]>();
    for (const key of containers) {
      const element = container(key);
      if (element) c.set(key, [element.scrollLeft, element.scrollTop]);
    }
    return { x: browser.scrollX, y: browser.scrollY, c };
  };
  const remember = (key: string | undefined, position: Position) => {
    if (key === undefined) return;
    memory.delete(key);
    memory.set(key, position);
    while (memory.size > SCROLL_LIMITS.entries) memory.delete(memory.keys().next().value!);
  };
  const scrollDocument = (x: number, y: number) => {
    try { browser.scrollTo({ left: x, top: y, behavior: 'instant' as ScrollBehavior }); }
    catch { browser.scrollTo(x, y); }
  };
  const applyPosition = (position: Position) => {
    for (const [key, [x, y]] of position.c) {
      const element = container(key);
      if (element) { element.scrollLeft = x; element.scrollTop = y; }
    }
    scrollDocument(position.x, position.y);
  };
  const anchor = (): Element | undefined => {
    const hash = browser.location.hash;
    if (hash.length < 2) return undefined;
    let id: string;
    try { id = decodeURIComponent(hash.slice(1)); } catch { id = hash.slice(1); }
    const element = document.getElementById(id) ?? document.getElementsByName(id)[0];
    return element?.isConnected ? element : undefined;
  };
  /**
   * Applies a framework movement. The marker that suppresses the resulting async scroll event is set only when the
   * application actually moved something, so a no-op application cannot swallow later unrelated user movement.
   */
  const applyAndMark = (apply: () => void) => {
    const before = sample();
    apply();
    const after = sample();
    lastApplied = same(before, after) ? undefined : after;
    emit('applied');
  };
  const scrollToAnchor = () => {
    const element = anchor();
    if (element) applyAndMark(() => element.scrollIntoView());
  };
  /** Only the binding persists, and only onto the entry it currently owns (never inferred from URL). */
  const persist = (recorded = false) => {
    if (!attached) return;
    try {
      const snapshot = port.read();
      const entry = codec.read(snapshot.state);
      if (!entry || keyOf(entry) !== currentKey) return;
      // On detach the Host content may already be gone (scroll clamped); flush the last observed position.
      const position = (recorded && currentKey !== undefined ? memory.get(currentKey) : undefined) ?? sample();
      remember(currentKey, position);
      port.replace(snapshot.url, codec.write(snapshot.state, { ...entry, scroll: persisted(position) }));
      lastPersist = Date.now();
    } catch (error) { report(error); }
  };
  const schedulePersist = () => {
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    const wait = Math.max(SCROLL_LIMITS.idleMs, lastPersist + SCROLL_LIMITS.persistIntervalMs - Date.now());
    idleTimer = setTimeout(() => { idleTimer = undefined; persist(); }, wait);
  };
  /** Full position equality, including declared containers (a container-only movement is never "the same"). */
  const same = (left: Position | undefined, right: Position) => {
    if (left === undefined || left.x !== right.x || left.y !== right.y || left.c.size !== right.c.size) return false;
    for (const [key, [x, y]] of left.c) {
      const other = right.c.get(key);
      if (!other || other[0] !== x || other[1] !== y) return false;
    }
    return true;
  };
  const onScroll = () => {
    if (!attached) return;
    const position = sample();
    // Attribute movement to the entry that is current now: a physical fragment navigation scrolls in a new
    // (not yet claimed) entry, which must never overwrite the departing entry's position.
    const key = keyOf(currentEntry());
    if (key !== undefined && key === currentKey) remember(currentKey, position);
    // The async scroll event caused by our own application is not user movement.
    if (same(lastApplied, position)) { lastApplied = undefined; return; }
    lastApplied = undefined;
    emit('user');
    schedulePersist();
  };
  // Capture phase runs before the connection's listener claims the arriving entry. Without live entry keys (no
  // Navigation API) every traversal re-identifies the entry; its remembered position follows the same physical entry.
  const onArrival = () => { arrivingKey = keyOf(currentEntry()); };
  const onPageHide = () => persist();
  const onVisibility = () => { if (document.visibilityState === 'hidden') persist(); };
  const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) emit('pageRestored'); };

  const ownership: ScrollOwnership = {
    get pending() { return pending !== undefined; },
    attached() {
      if (attached) return;
      attached = true;
      recordedMode = browser.history.scrollRestoration;
      browser.history.scrollRestoration = 'manual';
      const entry = currentEntry();
      currentKey = keyOf(entry);
      // The first attachment in a document restores its entry's persisted record once (reload/new document).
      if (!restoredDocuments.has(document)) {
        restoredDocuments.add(document);
        loadRecord = readPersistedScroll(entry?.scroll, containers);
        if (loadRecord) pending = { kind: 'load' };
      }
      const add = <K extends string>(target: EventTarget, type: K, listener: (event: never) => void, capture = false) => {
        target.addEventListener(type, listener as EventListener, { capture, passive: true });
        stops.push(() => target.removeEventListener(type, listener as EventListener, { capture }));
      };
      add(document, 'scroll', onScroll, true);
      add(browser, 'popstate', onArrival, true);
      add(browser, 'hashchange', onArrival, true);
      add(browser, 'pagehide', onPageHide);
      add(document, 'visibilitychange', onVisibility);
      add(browser, 'pageshow', onPageShow);
    },
    beforePush() {
      if (!attached) return;
      persist();
    },
    request(policy) {
      if (!attached) return;
      pending = { kind: policy };
    },
    physical() {
      if (!attached) return;
      pending = { kind: 'physical', unclaimed: arrivalUnclaimed };
    },
    entryChanged() {
      if (!attached) return;
      currentKey = keyOf(currentEntry());
      const previous = arrivingKey;
      arrivingKey = undefined;
      arrivalUnclaimed = previous === undefined;
      if (previous !== undefined && currentKey !== undefined && previous !== currentKey && !memory.has(currentKey)) {
        const position = memory.get(previous);
        memory.delete(previous);
        if (position) remember(currentKey, position);
      }
    },
    checkpoint() {
      if (!attached || pending === undefined) return;
      const { kind, unclaimed } = pending;
      pending = undefined;
      try {
        currentKey = keyOf(currentEntry());
        const saved = () => (currentKey !== undefined ? memory.get(currentKey) : undefined) ?? readPersistedScroll(currentEntry()?.scroll, containers);
        let target: Position | undefined;
        if (kind === 'load') target = loadRecord;
        else if (kind === 'top') target = { x: 0, y: 0, c: new Map(containers.map(key => [key, [0, 0] as const])) };
        // Semantic entry-restore without a trustworthy saved position preserves; it never follows a retained hash.
        else if (kind === 'entry-restore') target = saved();
        else if (kind === 'physical') {
          target = saved();
          // Physical movement to an existing entry without a saved position uses its connected anchor; a brand-new
          // physical entry keeps whatever the browser already did (native anchor behavior).
          if (!target) { if (!unclaimed) scrollToAnchor(); return; }
        } else if (kind === 'fragment') { scrollToAnchor(); return; }
        loadRecord = undefined;
        if (!target) return;
        applyAndMark(() => applyPosition(target!));
        remember(currentKey, sample());
      } catch (error) { report(error); }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    detached() {
      if (!attached) return;
      persist(true);
      attached = false;
      pending = undefined;
      if (idleTimer !== undefined) clearTimeout(idleTimer);
      idleTimer = undefined;
      for (const stop of stops.splice(0)) stop();
      // Only the current entry gets its recorded mode back; other visited entries keep `manual`.
      try { if (recordedMode !== undefined) browser.history.scrollRestoration = recordedMode; } catch (error) { report(error); }
      memory.clear();
    }
  };
  return ownership;
}
