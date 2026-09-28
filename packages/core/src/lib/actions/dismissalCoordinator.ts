import { tick } from 'svelte';
import { candidates, composedContains, deepActive, eligible, type FocusElement } from './focusEligibility.js';

/** Private tokens express component ancestry even before browser actions enroll. */
export interface DismissalIdentity { readonly parent: DismissalIdentity | undefined }
export interface LayerFocus {
  readonly node: HTMLElement;
  readonly modal: boolean;
  /** Passive descendant portals join an ancestor region without creating a trap. */
  readonly contain?: boolean | undefined;
  readonly autoFocus?: boolean | undefined;
  readonly returnFocus?: (() => HTMLElement | null) | undefined;
}
export interface DismissalLayer {
  node: HTMLElement;
  priority?: number | undefined;
  pointerBoundary?: (() => HTMLElement | null | undefined) | undefined;
  pointerEnabled?: (() => boolean) | undefined;
  onPointerOutside?: ((event: PointerEvent) => void) | undefined;
  escapeEnabled?: (() => boolean) | undefined;
  onEscape?: ((event: KeyboardEvent) => void) | undefined;
  identity?: (() => unknown) | undefined;
  ancestry?: DismissalIdentity | undefined;
  focus?: LayerFocus | undefined;
  /** Initial logical focus lifetime; dismissal participation never depends on it. @default true */
  focusActive?: boolean | undefined;
}
/** @internal Exact dismissal callbacks for a retained layer whose authority changed. */
export interface DismissalReplacement {
  readonly identity: () => unknown;
  readonly onPointerOutside?: ((event: PointerEvent) => void) | undefined;
  readonly onEscape?: ((event: KeyboardEvent) => void) | undefined;
}
export interface LayerHandle {
  readonly live: boolean;
  /** Retires (false) or re-arms (true) focus authority while the entry keeps its dismissal participation. */
  setFocusActive(active: boolean): void;
  /** Replaces only dismissal authority while preserving the layer's focus session. */
  replaceDismissal(replacement: DismissalReplacement): void;
  refresh(): void;
  release(restoreFocus?: boolean): void;
}
/** Internal accepted-navigation seam; renderer resolves semantic targets. */
export interface NavigationFocus {
  live(): boolean;
  target(): HTMLElement | null;
  fallback?: (() => HTMLElement | null) | undefined;
}
/** @internal Per-document operations reached by module-level handles through the mutable Entry.home. */
interface Coordinator {
  add(options: DismissalLayer): LayerHandle;
  navigate(intent: NavigationFocus): () => void;
  live(entry: Entry): boolean;
  setFocusActive(entry: Entry, active: boolean): void;
  replaceDismissal(entry: Entry, replacement: DismissalReplacement): void;
  refresh(entry: Entry): void;
  release(entry: Entry, restoreFocus: boolean): void;
  /** Live entries whose node now belongs to another document. */
  adopted(): Entry[];
  /** Live entries bottom→top, by the same priority/ancestry/latest rule that selects the top layer. */
  order(): Entry[];
  detach(entry: Entry): void;
  attach(entry: Entry): void;
}
interface Entry {
  options: DismissalLayer;
  live: boolean;
  focusActive: boolean;
  identity: unknown;
  trigger: FocusElement | null;
  lastFocus: FocusElement | null;
  restoreTabindex?: (() => void) | undefined;
  /** Coordinator of the node's current document; only attach() rewrites it after add(). */
  home: Coordinator;
}
const documents = new WeakMap<Document, Coordinator>();
/** Event-phase memo of dismissal predicates; a faulted entry is pinned to false so it is skipped without a second getter call. */
type Gate = Map<Entry, boolean>;
const report = (error: unknown) => console.error('[Composable Svelte] Focus coordination failed:', error);
function rejectUncontainedModal(options: DismissalLayer): void {
  // A modal that opts out of containment would win modal() while focusOwner() excludes it.
  if (options.focus?.modal && options.focus.contain === false) {
    throw new Error('[Composable Svelte] A modal focus layer cannot set contain: false; only a nonmodal passive descendant may opt out of containment.');
  }
}
function ancestor(parent: Entry, child: Entry): boolean {
  const token = parent.options.ancestry;
  if (!token) return false;
  for (let current = child.options.ancestry?.parent; current; current = current.parent) {
    if (current === token) return true;
  }
  return false;
}
function createCoordinator(document: Document): Coordinator {
  const layers: Entry[] = [];
  const pending = new Map<ReturnType<typeof setTimeout>, Entry>();
  let revision = 0;
  let focusEpoch = 0;
  let focusQueued: object | undefined;
  let flushing = false;
  let redirecting = false;
  let disposed = false;
  let listening = false;
  let focusedOwner: Entry | undefined;
  // One child-list-only session per document, armed by actual focus, never candidate discovery.
  let recovery: { entry: Entry; identity: unknown; root: HTMLElement; epoch: number;
    node: FocusElement; observer: MutationObserver; queued: boolean } | undefined;
  // owner lets a relocated entry cancel exactly its own intent; epoch is rewritten only to carry an unrelated intent across detach().
  let restore: { owner: Entry; target: FocusElement | null; active: Element | null; epoch: number } | undefined;
  let navigation: { intent: NavigationFocus; live: boolean } | undefined;
  // Event-phase set of entries whose identity getter threw: reported once, then skipped without another read until the phase ends.
  let identityFaults: Set<Entry> | undefined;
  // Consumed Escape events still in dispatch. Capture decides and cancels, but propagation continues so the target and its ancestors observe Escape;
  // only a document-bubble stopPropagation() shields the legacy window fallback. The shield listener exists only while such an event is owed one.
  const consumed = new Set<KeyboardEvent>();
  let shieldStop: AbortController | undefined;
  let shieldTimer: ReturnType<typeof setTimeout> | undefined;
  const live = (entry: Entry) => entry.live && entry.options.node.ownerDocument === document;
  function phased<T>(run: () => T): T {
    if (identityFaults) return run();
    identityFaults = new Set();
    try { return run(); }
    finally { identityFaults = undefined; }
  }
  function sameIdentity(entry: Entry): boolean {
    if (identityFaults?.has(entry)) return false;
    try { return entry.options.identity?.() === entry.identity; }
    catch (error) {
      report(error); identityFaults?.add(entry);
      return false;
    }
  }
  const focusLive = (entry: Entry) => live(entry) && entry.focusActive && sameIdentity(entry);
  function select(predicate: (entry: Entry) => boolean): Entry | undefined {
    const participants = layers.filter(entry => live(entry) && predicate(entry));
    if (!participants.length) return undefined;
    const priority = Math.max(...participants.map(entry => entry.options.priority ?? 1));
    const peers = participants.filter(entry => (entry.options.priority ?? 1) === priority);
    const ancestors = new Set<DismissalIdentity>();
    for (const entry of peers) {
      let parent = entry.options.ancestry?.parent;
      while (parent) { ancestors.add(parent); parent = parent.parent; }
    }
    for (let index = peers.length - 1; index >= 0; index--) {
      const entry = peers[index]!;
      if (!entry.options.ancestry || !ancestors.has(entry.options.ancestry)) return entry;
    }
    return undefined;
  }
  /** Bottom→top order of every live entry (inert exits included), repeatedly taking `select`'s top among the rest. */
  function order(): Entry[] {
    const remaining = layers.filter(entry => live(entry));
    const topDown: Entry[] = [];
    while (remaining.length) {
      const priority = Math.max(...remaining.map(entry => entry.options.priority ?? 1));
      const peers = remaining.filter(entry => (entry.options.priority ?? 1) === priority);
      const ancestors = new Set<DismissalIdentity>();
      for (const entry of peers) { let parent = entry.options.ancestry?.parent; while (parent) { ancestors.add(parent); parent = parent.parent; } }
      let chosen: Entry | undefined;
      for (let index = peers.length - 1; index >= 0; index--) { const entry = peers[index]!; if (!entry.options.ancestry || !ancestors.has(entry.options.ancestry)) { chosen = entry; break; } }
      chosen ??= peers[peers.length - 1]!;
      topDown.push(chosen);
      remaining.splice(remaining.indexOf(chosen), 1);
    }
    return topDown.reverse();
  }
  // Each predicate getter runs at most once per gate; a throw is reported once and skips that entry for the phase only.
  function top(kind: 'pointer' | 'escape', gate: Gate = new Map()): Entry | undefined {
    return select(entry => {
      let enabled = gate.get(entry);
      if (enabled === undefined) {
        const { options } = entry;
        try {
          enabled = kind === 'pointer'
            ? !!options.onPointerOutside && options.pointerEnabled?.() !== false
            : !!options.onEscape && options.escapeEnabled?.() !== false;
        } catch (error) { report(error); enabled = false; }
        gate.set(entry, enabled);
      }
      return enabled;
    });
  }
  const modal = () => select(entry => focusLive(entry) && !!entry.options.focus?.modal && entry.options.focus.node.isConnected);
  const focusOwner = () => {
    const activeModal = modal();
    return select(entry => focusLive(entry) && !!entry.options.focus && entry.options.focus.contain !== false && entry.options.focus.node.isConnected &&
      (!activeModal || entry === activeModal || ancestor(activeModal, entry)));
  };
  function region(entry: Entry): Entry[] {
    return [entry, ...layers.filter(candidate => candidate !== entry && candidate.options.focus &&
      ancestor(entry, candidate) && focusLive(candidate))];
  }
  function within(entry: Entry, node: Node): boolean {
    return region(entry).some(member => composedContains(member.options.focus!.node, node));
  }
  function ordered(entry: Entry): FocusElement[] {
    // Portaled descendant regions follow the parent's region. Preserve each
    // tabbable result's native open-shadow scoping and positive-index order.
    return [...new Set(region(entry).flatMap(member => candidates(member.options.focus!.node)))];
  }
  // A real candidate focused strictly inside a fallback boundary retires only that framework-owned tabindex; the closure's -1 guard keeps author writes.
  function releaseOwnedTabindex(node: Node): void {
    for (const entry of layers) {
      const boundary = entry.options.focus?.node;
      if (!entry.restoreTabindex || !boundary || boundary === node || !composedContains(boundary, node)) continue;
      entry.restoreTabindex();
      entry.restoreTabindex = undefined;
    }
  }
  function stopRecovery(): void {
    recovery?.observer.disconnect();
    recovery = undefined; // Session identity also invalidates any queued settlement.
  }
  function currentRecovery(session: NonNullable<typeof recovery>): boolean {
    const valid = () => !disposed && recovery === session && session.epoch === focusEpoch &&
      session.entry.home === coordinator && session.entry.identity === session.identity &&
      session.entry.options.focus?.node === session.root && session.root.isConnected &&
      session.root.ownerDocument === document && focusLive(session.entry);
    return valid() && modal() === session.entry && valid();
  }
  function advanceFocusEpoch(): void {
    const previous = focusEpoch++;
    const session = recovery;
    if (!session) return;
    // Passive topology changes retain actual-focus evidence when the same modal still owns it.
    // A real authority/identity/root transition invalidates it through the ordinary live checks.
    if (session.epoch !== previous) { stopRecovery(); return; }
    session.epoch = focusEpoch;
    if (!phased(() => currentRecovery(session)) && recovery === session) stopRecovery();
  }
  function observeRecoveryChain(session: NonNullable<typeof recovery>): void {
    session.observer.disconnect();
    // Direct parents detect subtree/host/portal removal without a document-wide subtree observer.
    let node: Node | null = session.node;
    while (node && node !== document) {
      const parent: Node | null = node.parentNode ?? (node.nodeType === 11 ? (node as ShadowRoot).host : null);
      if (!parent) break;
      session.observer.observe(parent, { childList: true });
      node = parent;
    }
  }
  function trackRecovery(node: Element | null): void {
    const owner = modal();
    if (!owner || !node || deepActive(document) !== node || !eligible(node, document) || !within(owner, node)) {
      stopRecovery(); return;
    }
    if (recovery?.entry === owner && recovery.node === node && currentRecovery(recovery)) {
      observeRecoveryChain(recovery); return;
    }
    stopRecovery();
    const Observer = document.defaultView?.MutationObserver;
    if (!Observer) return;
    const session = { entry: owner, identity: owner.identity, root: owner.options.focus!.node,
      epoch: focusEpoch, node: node as FocusElement,
      observer: new Observer(() => phased(reconcileRecovery)), queued: false };
    recovery = session;
    observeRecoveryChain(session);
  }
  function reconcileRecovery(): void {
    const session = recovery;
    if (!session) return;
    if (!currentRecovery(session)) { stopRecovery(); return; }
    const active = deepActive(document);
    if (active && eligible(active, document) && within(session.entry, active)) {
      trackRecovery(active); return;
    }
    // Reinsertions/valid moves and attribute-only eligibility changes are outside this removal policy.
    if (session.node.isConnected && within(session.entry, session.node)) {
      observeRecoveryChain(session); return;
    }
    // Ordinary navigation/restoration owns settlement priority. Its finally hook resumes this session.
    if (session.queued || focusQueued || flushing || navigation || restore) return;
    session.queued = true;
    void tick().then(() => phased(() => {
      session.queued = false;
      if (!currentRecovery(session)) { if (recovery === session) stopRecovery(); return; }
      if (focusQueued || flushing || navigation || restore) return;
      const next = deepActive(document);
      if (next && eligible(next, document) && within(session.entry, next)) { trackRecovery(next); return; }
      if (session.node.isConnected && within(session.entry, session.node)) { observeRecoveryChain(session); return; }
      // Never replace a different explicit focus destination; focusin containment handles that separately.
      if (next && next !== document.body && next !== session.node) { stopRecovery(); return; }
      if (!currentRecovery(session)) return;
      stopRecovery();
      focusInside(session.entry);
    })).catch(error => { if (recovery === session) stopRecovery(); report(error); });
  }
  // scroll is opt-in: only keyboard Tab moves and trigger restoration reveal their target; every other path keeps preventScroll.
  function focus(node: FocusElement, owner?: Entry, scroll = false): boolean {
    if (disposed || (owner && !focusLive(owner)) || !eligible(node, document)) return false;
    const capturedEpoch = focusEpoch;
    redirecting = true;
    try { node.focus({ preventScroll: !scroll }); }
    catch (error) { report(error); return false; }
    finally { redirecting = false; }
    const focused = deepActive(document) === node;
    if (focused) releaseOwnedTabindex(node);
    if (focused && owner && focusLive(owner) && focusEpoch === capturedEpoch) owner.lastFocus = node;
    if (focused && focusEpoch === capturedEpoch) trackRecovery(deepActive(document));
    return focused;
  }
  function focusTarget(node: HTMLElement | null | undefined): boolean {
    if (!node || !node.isConnected || node.ownerDocument !== document) return false;
    if (node !== document.body && !eligible(node, document)) return false;
    const owned = !node.hasAttribute('tabindex') && !eligible(node, document);
    if (owned) node.setAttribute('tabindex', '-1');
    try { return focus(node); }
    finally { if (owned && node.getAttribute('tabindex') === '-1') node.removeAttribute('tabindex'); }
  }
  function fallback(entry: Entry): void {
    const node = entry.options.focus!.node;
    if (!node.isConnected || node.ownerDocument !== document || !focusLive(entry)) return;
    if (!eligible(node, document) && !node.hasAttribute('tabindex')) {
      node.setAttribute('tabindex', '-1');
      entry.restoreTabindex ??= () => { if (node.getAttribute('tabindex') === '-1') node.removeAttribute('tabindex'); };
    }
    focus(node, entry);
  }
  function focusInside(entry: Entry, preferred?: FocusElement | null): void {
    const capturedEpoch = focusEpoch;
    const attempt = (node: FocusElement, scroll = false): boolean => {
      const before = deepActive(document);
      if (focus(node, entry, scroll)) return true;
      if (!focusLive(entry) || focusEpoch !== capturedEpoch) return false;
      // A focus handler may deliberately choose a different surviving owned control.
      // Its nested focusin was suppressed by redirecting, so retain and observe the actual destination.
      const active = deepActive(document);
      if (!active || active === before || !eligible(active, document) || !within(entry, active)) return false;
      entry.lastFocus = active as FocusElement;
      releaseOwnedTabindex(active);
      trackRecovery(active);
      return true;
    };
    // preferred is only ever an armed restore trigger, so it scrolls like the modal-less restoration in scheduleFocus().
    if (preferred && within(entry, preferred) && eligible(preferred, document) && attempt(preferred, true)) return;
    if (!focusLive(entry) || focusEpoch !== capturedEpoch) return;
    const remembered = entry.lastFocus;
    if (remembered && within(entry, remembered) && eligible(remembered, document) && attempt(remembered)) return;
    if (!focusLive(entry) || focusEpoch !== capturedEpoch) return;
    // A candidate whose focus() fails without moving focus yields to the next healthy one; a valid owned transfer is retained; other changed destinations keep the boundary fallback.
    for (const candidate of ordered(entry)) {
      // preferred and remembered were already attempted above whenever they are tabbable members.
      if (candidate === preferred || candidate === remembered) continue;
      const before = deepActive(document);
      if (attempt(candidate)) return;
      if (!focusLive(entry) || focusEpoch !== capturedEpoch) return;
      if (deepActive(document) !== before) break;
    }
    fallback(entry);
  }
  function listen() {
    if (listening) return;
    listening = true;
    document.addEventListener('pointerdown', pointer, true);
    // Capture phase: a descendant bubble stopPropagation() cannot bypass Escape or modal Tab. stopIfEmpty() removes with the identical flag.
    document.addEventListener('keydown', keyboard, true);
    document.addEventListener('focusin', focusIn);
  }
  function stopIfEmpty() {
    if (layers.length || disposed) return;
    stopRecovery();
    if (listening) {
      listening = false;
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('keydown', keyboard, true);
      document.removeEventListener('focusin', focusIn);
      // An in-flight consumed Escape keeps its shield past this teardown (its onEscape may have released the last layer); anything finished is dropped now.
      syncShield();
    }
    if (navigation || focusQueued || flushing) return;
    disposed = true;
    for (const timer of pending.keys()) clearTimeout(timer);
    pending.clear();
    if (documents.get(document) === coordinator) documents.delete(document);
  }
  // Document bubble: reached only when no descendant stopped propagation first, which already keeps the event from window.
  function shield(event: KeyboardEvent) {
    if (!consumed.delete(event)) return;
    event.stopPropagation();
    syncShield();
  }
  // Reconciles the shield with the consumed events still in dispatch; the abort signal removes it without touching the three-listener ledger.
  // The recheck must be a task: a microtask checkpoint runs between the listeners of a native event, before the target has observed it.
  function syncShield() {
    for (const event of consumed) if (event.eventPhase === event.NONE) consumed.delete(event);
    if (consumed.size) {
      if (!shieldStop) {
        shieldStop = new AbortController();
        document.addEventListener('keydown', shield, { signal: shieldStop.signal });
      }
      // Nothing guarantees an owed event reaches document bubble (descendant stopPropagation(), bubbles: false), so one task bounds the shield.
      shieldTimer ??= setTimeout(() => { shieldTimer = undefined; syncShield(); }, 0);
      return;
    }
    shieldStop?.abort(); shieldStop = undefined;
    if (shieldTimer !== undefined) { clearTimeout(shieldTimer); shieldTimer = undefined; }
  }
  function scheduleFocus() {
    if (focusQueued || disposed) return;
    const job = {};
    focusQueued = job;
    void tick().then(() => phased(() => {
      if (focusQueued === job) focusQueued = undefined;
      if (disposed) return;
      flushing = true;
      try {
        const activeModal = modal(), owner = focusOwner();
        const route = navigation, returnIntent = restore;
        if (!owner) focusedOwner = undefined;
        navigation = undefined; restore = undefined;
        // Detach intents before browser focus can call arbitrary application code.
        if (activeModal) {
          if (owner && (focusedOwner !== owner || !within(activeModal, deepActive(document) ?? document))) {
            if (owner.options.focus?.autoFocus !== false || returnIntent) focusInside(owner, returnIntent?.target);
          }
          focusedOwner = owner;
        } else if (route?.live && route.intent.live()) {
          focusedOwner = undefined;
          const target = route.intent.target();
          if (route.live && route.intent.live() && !modal() && target && focusTarget(target)) { /* accepted target focused */ }
          else if (route.live && route.intent.live() && !modal()) {
            const alternative = route.intent.fallback?.();
            if (route.live && route.intent.live() && !modal()) focusTarget(alternative ?? document.body);
          }
        } else if (owner && focusedOwner !== owner && owner.options.focus?.autoFocus !== false) {
          const preferred = returnIntent && returnIntent.epoch === focusEpoch &&
            (deepActive(document) === returnIntent.active || deepActive(document) === document.body)
              ? returnIntent.target : undefined;
          focusedOwner = owner; focusInside(owner, preferred);
        } else if (returnIntent && returnIntent.epoch === focusEpoch && (deepActive(document) === returnIntent.active || deepActive(document) === document.body)) {
          focusedOwner = owner;
          if (returnIntent.target && eligible(returnIntent.target, document)) focus(returnIntent.target, undefined, true);
          else focusTarget(document.body);
        }
      } finally {
        flushing = false;
        // Re-arm only an actually focused current region; otherwise resume pending removal after ordinary intents.
        const active = deepActive(document), current = modal();
        if (current && active && eligible(active, document) && within(current, active)) trackRecovery(active);
        else reconcileRecovery();
        stopIfEmpty();
      }
    })).catch(error => {
      flushing = false;
      if (focusQueued === job) {
        focusQueued = undefined; navigation = undefined; restore = undefined;
      }
      stopIfEmpty();
      console.error('[Composable Svelte] Focus coordination failed:', error);
    });
  }
  // Containment may read linked descendants' focus identities, so the event and each deferred delivery are one identity-fault phase apiece.
  function pointer(event: PointerEvent) {
    phased(() => pointerDown(event));
  }
  function pointerDown(event: PointerEvent) {
    if (event.button !== 0 || event.defaultPrevented) return;
    // composedPath() empties once dispatch ends, so a deferred retry classifies against the arming-time path and target.
    const path = event.composedPath(), target = event.target as Node | null;
    const inside = (entry: Entry) => {
      const boundary = entry.options.pointerBoundary?.();
      const node = boundary?.isConnected ? boundary : entry.options.node;
      if (path.includes(node) || (!!target && node.contains(target))) return true;
      // W-A2: a selected focus owner also contains its linked live focus descendants; its own focus root is skipped so pointerBoundary stays its boundary.
      return !!entry.options.focus && region(entry).some(member => member !== entry &&
        (path.includes(member.options.focus!.node) || (!!target && composedContains(member.options.focus!.node, target))));
    };
    const gate: Gate = new Map();
    for (let entry = top('pointer', gate); entry; entry = top('pointer', gate)) {
      try { if (inside(entry)) return; }
      catch (error) { report(error); gate.set(entry, false); continue; }
      const armed = entry, capturedRevision = revision;
      let identity: unknown;
      // A throwing identity is reported once and the same gesture is offered to the next eligible entry.
      if (identityFaults?.has(armed)) { gate.set(armed, false); continue; }
      try { identity = armed.options.identity?.(); }
      catch (error) { report(error); identityFaults?.add(armed); gate.set(armed, false); continue; }
      const timer = setTimeout(() => {
        pending.delete(timer);
        if (event.defaultPrevented || !live(armed) || revision !== capturedRevision) return;
        phased(() => deliver(event, armed, identity, inside));
      }, 0);
      pending.set(timer, armed);
      return;
    }
  }
  // One re-selection per timer: a higher entry that faults is skipped, a faulting armed entry retries the next eligible entry that does not contain the gesture.
  function deliver(event: PointerEvent, armed: Entry, identity: unknown, inside: (entry: Entry) => boolean) {
    const gate: Gate = new Map();
    let retry = false;
    for (let entry = top('pointer', gate); entry; entry = top('pointer', gate)) {
      if (entry !== armed && !retry && !gate.get(armed)) return;
      if (retry) {
        try { if (inside(entry)) return; }
        catch (error) { report(error); gate.set(entry, false); continue; }
      }
      let current: unknown;
      if (identityFaults?.has(entry)) { gate.set(entry, false); retry ||= entry === armed; continue; }
      try { current = entry.options.identity?.(); }
      catch (error) { report(error); identityFaults?.add(entry); gate.set(entry, false); retry ||= entry === armed; continue; }
      // A nonthrowing identity change or a healthy newer top still drops the gesture without fall-through.
      if (entry === armed ? current !== identity : !retry) return;
      try { entry.options.onPointerOutside?.(event); }
      catch (error) { report(error); }
      return;
    }
  }
  // Only Tab reads focus identities, so only Tab opens an identity-fault phase; Escape selection never consults identity.
  function keyboard(event: KeyboardEvent) {
    if (event.key === 'Tab') phased(() => keydown(event)); else keydown(event);
  }
  function keydown(event: KeyboardEvent) {
    // Veto boundary: only a preventDefault() issued before this document-capture listener (window capture or an earlier document-capture listener) is honored.
    // A descendant still receives the event, but its bubble preventDefault() runs after this decision and cannot retroactively veto Escape or modal Tab.
    if (event.defaultPrevented || event.isComposing) return;
    if (event.key === 'Tab') {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const owner = modal() ?? focusOwner();
      if (!owner) return;
      const active = deepActive(document);
      // Only a modal captures Tab document-wide; a nonmodal owner (standalone Popover) leaves Tab native unless focus is already within its region.
      if (!owner.options.focus?.modal && !(active && within(owner, active))) return;
      const elements = ordered(owner);
      const index = elements.findIndex(element => element === active);
      event.preventDefault();
      const count = elements.length, step = event.shiftKey ? -1 : 1, capturedEpoch = focusEpoch;
      const start = index < 0 ? (event.shiftKey ? count - 1 : 0) : index + step + count;
      // A target whose focus() fails without moving focus yields directionally to the next candidate before the boundary fallback.
      for (let offset = 0; offset < count; offset++) {
        if (focus(elements[(start + offset * step) % count]!, owner, true)) return;
        if (!focusLive(owner) || focusEpoch !== capturedEpoch || deepActive(document) !== active) return;
      }
      fallback(owner);
      return;
    }
    if (event.key !== 'Escape' || event.repeat) return;
    const entry = top('escape');
    if (!entry) return;
    event.preventDefault();
    // Recorded before the callback so a synchronous final-layer release in onEscape still leaves the window shield owed to this event.
    consumed.add(event); syncShield();
    // The event is already consumed: a throwing callback is reported once and never falls through to a lower layer.
    try { entry.options.onEscape?.(event); }
    catch (error) { report(error); }
  }
  function focusIn(event: FocusEvent) {
    if (!redirecting) phased(() => focusMoved(event));
  }
  function focusMoved(event: FocusEvent) {
    // Redirection is modal-only; a nonmodal owner (standalone Popover) keeps Tab cycling in keyboard() without claiming document focus.
    const owner = modal();
    const node = event.composedPath()[0] as Node | undefined;
    if (!node || typeof node.nodeType !== 'number' || node.ownerDocument !== document) return;
    if (owner && !within(owner, node)) { focusInside(owner); return; }
    // Owned-tabindex release is not modal-only, but a nonmodal document pays for eligibility only while a closure is outstanding.
    if (!owner && !layers.some(entry => entry.restoreTabindex)) return;
    if (!eligible(node as Element, document)) return;
    releaseOwnedTabindex(node);
    if (owner) { owner.lastFocus = node as FocusElement; trackRecovery(node as Element); }
  }
  // Focus half of release(), shared with setFocusActive(false). Must run while the entry is
  // still live; an already-retired entry is a no-op so an armed restore keeps its epoch.
  function retireFocus(entry: Entry, restoreFocus: boolean): void {
    if (!entry.options.focus || !entry.focusActive) return;
    const wasAuthority = focusedOwner === entry || phased(() => focusOwner()) === entry;
    entry.focusActive = false;
    if (focusedOwner === entry) focusedOwner = undefined;
    entry.restoreTabindex?.(); entry.restoreTabindex = undefined;
    const target = entry.trigger;
    entry.trigger = null; entry.lastFocus = null;
    advanceFocusEpoch();
    if (wasAuthority && restoreFocus) restore = { owner: entry, target, active: deepActive(document), epoch: focusEpoch };
    scheduleFocus();
  }
  function cancelPending(entry: Entry): void {
    for (const [timer, owner] of pending) if (owner === entry) { clearTimeout(timer); pending.delete(timer); }
  }
  const coordinator: Coordinator = {
    order,
    add(options: DismissalLayer): LayerHandle {
      // Defensive only: enrollLayer() already rejected this shape before any coordinator lookup, so no stopIfEmpty() may dispose a coordinator mid-flush here.
      rejectUncontainedModal(options);
      const trigger = options.focus?.returnFocus?.() ?? deepActive(document);
      const entry: Entry = { options, live: true, focusActive: options.focusActive !== false, identity: options.identity?.(),
        trigger: eligible(trigger, document) ? trigger as FocusElement : null, lastFocus: null, home: coordinator };
      listen();
      layers.push(entry); revision++, notifyOrder(document);
      if (options.focus && entry.focusActive) { advanceFocusEpoch(); scheduleFocus(); }
      return handleFor(entry);
    },
    navigate(intent: NavigationFocus) {
      if (navigation) navigation.live = false;
      const request = {intent, live: true}; navigation = request; scheduleFocus();
      return () => { request.live = false; if (navigation === request) navigation = undefined; stopIfEmpty(); };
    },
    live,
    setFocusActive(entry: Entry, active: boolean): void {
      const focusOptions = entry.options.focus;
      if (!entry.live || !focusOptions || active === entry.focusActive) return;
      if (!active) { retireFocus(entry, true); return; }
      cancelPending(entry);
      const next = focusOptions.returnFocus?.() ?? deepActive(document);
      entry.trigger = eligible(next, document) ? next as FocusElement : null;
      entry.focusActive = true; entry.lastFocus = null;
      advanceFocusEpoch(); scheduleFocus();
    },
    replaceDismissal(entry: Entry, replacement: DismissalReplacement): void {
      if (!entry.live) return;
      const options = entry.options;
      const home = entry.home;
      const snapshot = Object.freeze({
        identity: replacement.identity,
        onPointerOutside: replacement.onPointerOutside,
        onEscape: replacement.onEscape
      });
      let nextIdentity: unknown;
      try { nextIdentity = snapshot.identity(); }
      catch (error) { report(error); return; }
      // The getter may release, replace, or adopt this entry. A successful inner
      // operation owns the fresh options reference; an adopted entry owns its new home.
      if (!entry.live || entry.home !== home || entry.options !== options ||
          entry.options.node.ownerDocument !== document) return;

      const identityChanged = nextIdentity !== entry.identity;
      const wasAuthority = focusedOwner === entry;
      cancelPending(entry);
      entry.options = {
        ...options,
        identity: snapshot.identity,
        onPointerOutside: snapshot.onPointerOutside,
        onEscape: snapshot.onEscape
      };
      entry.identity = nextIdentity;
      revision++, notifyOrder(document);

      if (!identityChanged || !entry.options.focus || !entry.focusActive) return;
      const active = deepActive(document);
      const owns = phased(() => {
        entry.lastFocus = active && eligible(active, document) && within(entry, active) ? active as FocusElement : null;
        return wasAuthority || focusOwner() === entry;
      });
      if (!owns) return;
      // The retained entry inherits its established authority until the queued
      // focus pass examines the replacement DOM. This keeps final teardown able
      // to restore the original trigger even if dismissal occurs in this turn.
      focusedOwner = entry;
      advanceFocusEpoch(); scheduleFocus();
    },
    refresh(entry: Entry): void {
      if (!entry.live) return;
      const next = entry.options.identity?.();
      if (next === entry.identity) return;
      // A stale identity already hides this entry from focusOwner(); focusedOwner is the stable authority signal.
      const wasAuthority = focusedOwner === entry;
      entry.identity = next; revision++, notifyOrder(document);
      if (!entry.options.focus || !entry.focusActive) return;
      const active = deepActive(document);
      // One identity-fault phase spans the region read and the authority read, so a throwing sibling is reported once.
      const owns = phased(() => {
        entry.lastFocus = active && eligible(active, document) && within(entry, active) ? active as FocusElement : null;
        return wasAuthority || focusOwner() === entry;
      });
      if (wasAuthority) focusedOwner = undefined;
      if (!owns) return;
      advanceFocusEpoch(); scheduleFocus();
    },
    release(entry: Entry, restoreFocus: boolean): void {
      if (!entry.live) return;
      retireFocus(entry, restoreFocus);
      entry.live = false; revision++, notifyOrder(document);
      cancelPending(entry);
      layers.splice(layers.indexOf(entry), 1);
      entry.trigger = null; entry.lastFocus = null;
      stopIfEmpty();
    },
    adopted: () => layers.filter(entry => entry.live && entry.options.node.ownerDocument !== document),
    // Relocation is not dismissal: withdraw only this entry's origin state and arm no restore.
    detach(entry: Entry): void {
      const index = layers.indexOf(entry);
      if (index < 0) return;
      layers.splice(index, 1); revision++, notifyOrder(document);
      cancelPending(entry);
      if (restore?.owner === entry) restore = undefined;
      if (entry.options.focus) {
        const wasOwner = focusedOwner === entry;
        if (wasOwner) focusedOwner = undefined;
        advanceFocusEpoch();
        // An unrelated armed restore survives the epoch bump; a surviving origin authority regains focus.
        if (restore) restore.epoch = focusEpoch;
        if (wasOwner && layers.length) scheduleFocus();
      }
      entry.trigger = null; entry.lastFocus = null;
      stopIfEmpty();
    },
    // The destination treats the entry as fresh; an owned restoreTabindex closure stays with the entry.
    attach(entry: Entry): void {
      entry.home = coordinator;
      if (!layers.includes(entry)) layers.push(entry);
      revision++, notifyOrder(document);
      listen();
      const focusOptions = entry.options.focus;
      if (!focusOptions || !entry.focusActive) return;
      let next: Element | null;
      try { next = focusOptions.returnFocus?.() ?? deepActive(document); }
      catch (error) { report(error); next = deepActive(document); }
      if (!entry.live || !entry.focusActive || entry.home !== coordinator || entry.options.node.ownerDocument !== document) return;
      entry.trigger = next?.ownerDocument === document && eligible(next, document) ? next as FocusElement : null;
      entry.lastFocus = null;
      advanceFocusEpoch(); scheduleFocus();
    }
  };
  return coordinator;
}
const orderListeners = new WeakMap<Document, Set<() => void>>();
const orderQueued = new WeakSet<Document>();
/** Coalesced (one microtask) notification that the document's layer set or order changed. */
function notifyOrder(document: Document): void {
  if (orderQueued.has(document) || !orderListeners.get(document)?.size) return;
  orderQueued.add(document);
  queueMicrotask(() => { orderQueued.delete(document); for (const listener of [...(orderListeners.get(document) ?? [])]) { try { listener(); } catch (error) { report(error); } } });
}
/**
 * Enrolled layer nodes of `document`, bottom→top, in the coordinator's own selection order (priority, then
 * ancestry, then latest), inert exits included. Visual stacking derives from this; it keeps no order of its own.
 */
export function dismissalLayerOrder(document: Document): readonly HTMLElement[] {
  return documents.get(document)?.order().map(entry => entry.options.node) ?? [];
}
/** Subscribe to layer set/order changes of `document` (coalesced per microtask). Returns the unsubscribe. */
export function onDismissalLayersChanged(document: Document, listener: () => void): () => void {
  let set = orderListeners.get(document);
  if (!set) { set = new Set(); orderListeners.set(document, set); }
  set.add(listener);
  return () => { set!.delete(listener); };
}
function forDocument(document: Document) {
  let coordinator = documents.get(document);
  if (!coordinator) { coordinator = createCoordinator(document); documents.set(document, coordinator); }
  return coordinator;
}
export function enrollLayer(options: DismissalLayer): LayerHandle {
  // N-14a: reject before acquiring or looking up a coordinator, so a rejection caught inside a focus flush cannot dispose the document's coordinator.
  rejectUncontainedModal(options);
  return forDocument(options.node.ownerDocument).add(options);
}
export function registerDismissalLayer(options: DismissalLayer): () => void {
  const handle = enrollLayer(options);
  return () => handle.release();
}
export function requestNavigationFocus(document: Document, intent: NavigationFocus): () => void {
  return forDocument(document).navigate(intent);
}
// Handles are module-level and delegate through the mutable entry.home, so a handle issued before adoption stays valid and idempotent.
function handleFor(entry: Entry): LayerHandle {
  return {
    get live() { return entry.home.live(entry); },
    setFocusActive(active: boolean) { entry.home.setFocusActive(entry, active); },
    replaceDismissal(replacement: DismissalReplacement) { entry.home.replaceDismissal(entry, replacement); },
    refresh() { entry.home.refresh(entry); },
    release(restoreFocus = true) { entry.home.release(entry, restoreFocus); }
  };
}
/**
 * @internal portal() calls this after a cross-document appendChild. It never creates an origin coordinator and
 * migrates every live origin entry whose node was adopted; ancestry tokens survive while selection stays per-document.
 */
export function rehomeAdoptedLayers(from: Document): void {
  const origin = documents.get(from);
  if (!origin) return;
  for (const entry of origin.adopted()) {
    origin.detach(entry);
    forDocument(entry.options.node.ownerDocument).attach(entry);
  }
}
