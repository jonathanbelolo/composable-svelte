/**
 * Host-owned route visual layer (S1 slice): managed route outlet attachment, render checkpoints,
 * participant registration, and the choreography run that supplies the commit cue.
 * The route protocol never imports this module; it reaches it only through VisualCuePort.
 * Contract: fluid-layout-motion-design.md "Svelte realization", "Capture timing and value handoff".
 */
import { getContext, setContext } from 'svelte';
import { capturedView, isCapturedView } from '../../../execution/store-access.js';
import type { ApplicationStagedRoute } from '../../instance.svelte.js';
import type { TransactionId, VisualCuePort, VisualLifecycle, VisualTerminalReason } from '../../../routing/staged/types.js';
import type { ChoreographyPlan } from './plan.js';
import type { Participant, RunDiagnostic, RunHost, VisualClock } from './run.js';
import { isVisualEngine, planEngine, type EngineRun, type VisualEngine } from './engine-types.js';
import type { VisualConfiguration, VisualDiagnostic } from '../representation/types.js';
import { acquireChoreographyLease, liveChoreographyLeases, type ChoreographyLease } from '../target-registry.js';
import { keyOf } from './plan.js';
import type { OverlayInstance, OverlayTransitionClaim, OverlayTransitionRequest } from './overlay-motion.js';
import { overlayScopeInstance, overlayScopeOwner } from './overlay-scopes.js';
import type { ParticipantSelector } from './plan.js';
import type { RestingChannel, RestingChannelName, RestingPose } from './run.js';
/** One overlay epoch's retained resting contribution on a node (per channel). */
interface RestingEntry { readonly owner: object; readonly channels: RestingPose; /** The reacting participant's own (route/page) owner. */ readonly source?: object | undefined }
/** A run prepared before an explicit overlay transition's commit (see `overlayPrepare`). */
export interface OverlayPrepared { run: EngineRun | undefined; readonly key: object; readonly roles: Set<HTMLElement>; readonly releases: (() => void)[]; done: (() => void) | undefined; settled: boolean; owner?: object | undefined }
import { RouteRenderLedger, type RenderIdentity } from '../route-render.js';
import type { RouteScrollSeam } from '../../../routing/scroll-restoration.js';

export type RouteVisualDiagnostic = RunDiagnostic;

const hostContext = Symbol('Route visual host');
const instanceContext = Symbol('Route instance owner');
export function provideRouteHost(host: RouteHost): void { setContext(hostContext, host); }
export function optionalRouteHost(): RouteHost | undefined { return getContext<RouteHost | undefined>(hostContext); }
export function provideRouteInstance(owner: object): void { setContext(instanceContext, owner); }
export function optionalRouteInstance(): object | undefined { return getContext<object | undefined>(instanceContext); }
const presenceContext = Symbol('Presence boundary');
/** Participants registered inside a `<Presence>` boundary (managed removal checkpoint, S2). */
export interface PresenceMembers { add(node: HTMLElement): void; delete(node: HTMLElement): void }
export function providePresence(members: PresenceMembers): void { setContext(presenceContext, members); }
export function optionalPresence(): PresenceMembers | undefined { return getContext<PresenceMembers | undefined>(presenceContext); }

const hosts = new WeakMap<object, RouteHost>();
/** Internal test/diagnostic access; not exported by package entry points. */
export function routeHostFor(staged: ApplicationStagedRoute): RouteHost | undefined { return hosts.get(staged); }

/** Default Host clock: rAF frame checkpoints and timers from the document's window (injectable). */
export interface CountedClock extends VisualClock { readonly outstanding: () => { readonly frames: number; readonly timers: number } }
/** Window clock that accounts for every owned frame/timer until it fires or is cancelled. */
export function windowClock(win: Window): CountedClock {
  const frames = new Set<number>(), timers = new Set<number>();
  return {
    now: () => win.performance.now(),
    frame: callback => { const handle: number = win.requestAnimationFrame(() => { frames.delete(handle); callback(); }); frames.add(handle); return handle; },
    cancelFrame: handle => { frames.delete(handle as number); win.cancelAnimationFrame(handle as number); },
    timeout: (callback, ms) => { const handle: number = win.setTimeout(() => { timers.delete(handle); callback(); }, ms); timers.add(handle); return handle; },
    clearTimeout: handle => { timers.delete(handle as number); win.clearTimeout(handle as number); },
    outstanding: () => ({ frames: frames.size, timers: timers.size })
  };
}
export const DIAGNOSTIC_RETENTION = 2048;

export class RouteHost implements VisualCuePort, RunHost {
  private outlets = 0;
  private readonly participants = new Set<Participant>();
  private run: EngineRun | undefined;
  /** Engines this Host has used (resource ledger); the configured one first. */
  private readonly engines = new Set<VisualEngine>();
  private disposed = false;
  /** The route instance most recently rendered by the managed outlet. */
  current: object | undefined;
  readonly diagnostics: RouteVisualDiagnostic[] = [];
  planeNode: HTMLElement | undefined;
  readonly ledger: RouteRenderLedger;
  private committedOwner: object | undefined;
  private readonly stopTurns: () => void;
  readonly clock: VisualClock;
  get root(): object { return this.staged?.root ?? this.rootIdentity!; }
  /** Owned visual resources right now (frames, timers, observers, live choreography leases, plane, representations). */
  resources(): { readonly frames: number; readonly timers: number; readonly observers: number; readonly leases: number; readonly plane: boolean; readonly representations: number; readonly running: boolean } {
    const counted = (this.clock as Partial<CountedClock>).outstanding?.() ?? { frames: -1, timers: -1 };
    const { observers } = this.visualResources();
    return { ...counted, observers, leases: liveChoreographyLeases(), plane: !!this.planeNode?.isConnected, representations: this.planeNode?.childElementCount ?? 0, running: this.run !== undefined || this.localRuns.size > 0 };
  }
  /** Engine-owned resources: observers, live representation handles (providers, retained renderers), media mirrors/players. */
  visualResources(): { readonly observers: number; readonly handles: number; readonly media: number } {
    let observers = 0, handles = 0, media = 0;
    for (const engine of this.engines) { const used = engine.resources(); observers = Math.max(observers, used.observers); handles = Math.max(handles, used.handles); media = Math.max(media, used.media); }
    return { observers, handles, media };
  }
  /** Scroll ownership seam (scroll author), read lazily: present only once a routed binding with scroll ownership attaches. */
  private scrollSeam: () => RouteScrollSeam | undefined = () => undefined;
  private scrollSubscribed: RouteScrollSeam | undefined;
  private stopScroll: (() => void) | undefined;
  private planeOutlet: HTMLElement | undefined;
  setScrollSeam(provider: () => RouteScrollSeam | undefined): void { this.scrollSeam = provider; }
  /** Geometry invalidation (scroll seam, native scroll, viewport resize) rebases every active run; never restores. */
  rebaseAll(): void { this.run?.rebase(); for (const run of this.localRuns.values()) run.rebase(); }
  private readonly onGeometry = () => this.rebaseAll();
  private stopGeometry: (() => void) | undefined;
  private observeGeometry(): void {
    if (this.stopGeometry) return;
    const win = this.win;
    win.addEventListener('scroll', this.onGeometry, { capture: true, passive: true });
    win.addEventListener('resize', this.onGeometry, { passive: true });
    this.stopGeometry = () => { win.removeEventListener('scroll', this.onGeometry, { capture: true }); win.removeEventListener('resize', this.onGeometry); };
  }
  private observeScroll(): void {
    const seam = this.scrollSeam();
    if (!seam || this.scrollSubscribed === seam) return;
    this.stopScroll?.();
    this.scrollSubscribed = seam;
    // Framework-applied, user/native and bfcache scroll all rebase active motion; never re-run restoration here.
    this.stopScroll = seam.subscribe(() => this.rebaseAll());
  }
  /** Explicit stable plane outlet; unqualified coordinate spaces fall back to the document plane (diagnosed). */
  setPlaneOutlet(node: HTMLElement | undefined): void {
    if (node) {
      const view = node.ownerDocument.defaultView;
      for (let element: HTMLElement | null = node; element && view; element = element.parentElement) {
        const style = view.getComputedStyle(element);
        if (style.transform !== 'none' || style.filter !== 'none' || style.perspective !== 'none' || style.contain !== 'none' || style.willChange.includes('transform')) {
          this.diagnose({ type: 'unsupported', transaction: 0 as TransactionId, participant: '*', reason: 'planeOutletUnqualified' });
          node = undefined;
          break;
        }
      }
    }
    this.planeOutlet = node;
    if (this.planeNode && this.planeNode.parentElement !== (node ?? this.win.document.body)) (node ?? this.win.document.body).appendChild(this.planeNode);
  }
  /**
   * `staged` is absent for Hosts of applications without route staging: only within-page choreography
   * (and the plane/resource machinery) is active then; `rootIdentity` is the registry's root store.
   */
  constructor(readonly staged: ApplicationStagedRoute | undefined, readonly win: Window, clock?: VisualClock, private readonly rootIdentity?: object, readonly visual?: VisualConfiguration | undefined) {
    this.clock = clock ?? windowClock(win);
    if (visual && isVisualEngine(visual.engine)) this.engines.add(visual.engine);
    this.ledger = new RouteRenderLedger(() => staged?.coordinator.epoch());
    // Native motion rebasing does not depend on scroll-restoration ownership.
    this.observeGeometry();
    if (!staged) { this.stopTurns = () => {}; return; }
    hosts.set(staged, this);
    staged.coordinator.setVisualPort(this);
    // Coalesced turns: a committed route owner replaced before it ever rendered records `notRendered`.
    this.committedOwner = staged.routeOwner();
    this.stopTurns = staged.subscribe(() => {
      const owner = staged.routeOwner();
      if (owner === this.committedOwner) return;
      const previous = this.committedOwner;
      this.committedOwner = owner;
      if (previous !== undefined && !this.ledger.hasMounted(previous)) this.ledger.notRendered(previous);
    });
  }
  diagnose(event: RouteVisualDiagnostic): void {
    this.diagnostics.push(event); if (this.diagnostics.length > DIAGNOSTIC_RETENTION) this.diagnostics.shift();
    const listener = this.visual?.onDiagnostic;
    if (!listener) return;
    const visible = publicDiagnostic(event);
    if (visible) { try { listener(visible); } catch { /* a diagnostics listener cannot affect visuals */ } }
  }
  /** The engine for a plan: the application's configured engine, else the engine the plan carries. */
  private engineFor(plan: unknown): VisualEngine | undefined {
    const configured = this.visual && isVisualEngine(this.visual.engine) ? this.visual.engine : undefined;
    const engine = configured ?? planEngine(plan);
    if (engine && !this.engines.has(engine)) {
      this.engines.add(engine);
      // Warm preparation reuse starts once an engine is known: every registered participant, then new ones.
      for (const entry of this.participants) engine.warm(entry.node);
    }
    return engine;
  }
  cue(transaction: TransactionId): void { this.staged?.coordinator.cue(transaction); }
  visualTerminal(transaction: TransactionId, reason: VisualTerminalReason): void { this.staged?.coordinator.visualTerminal(transaction, reason); }
  plane(): HTMLElement { return this.ensurePlane(); }
  /** A captured feature store belonging to the declared route slot (optional slot or destination case). */
  isRouteInstance(store: object): boolean {
    if (!isCapturedView(store)) return false;
    const capture = capturedView(store);
    if (!this.staged || capture.root !== this.staged.root) return false;
    const slot = this.staged.routeSlot as { readonly field?: string; readonly case?: (key: string) => object };
    if (typeof slot.case === 'function' && typeof slot.field === 'string') {
      const value = (this.staged.state() as Record<string, unknown> | undefined)?.[slot.field] as { readonly type?: unknown } | null | undefined;
      if (typeof value?.type !== 'string') return false;
      try { return capture.matchesSlot(slot.case(value.type)); } catch { return false; }
    }
    return capture.matchesSlot(slot);
  }
  attachOutlet(): () => void {
    if (this.disposed) return () => {};
    this.outlets++;
    this.staged?.coordinator.setOutletAttached(true);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.outlets--;
      if (this.outlets === 0 && !this.disposed) this.staged?.coordinator.setOutletAttached(false);
    };
  }
  /** Checkpoint `beforeRemoval`: pre-effect before Svelte removes an outgoing route instance. */
  beforeRemoval(owner: object): void { this.run?.beforeRemoval(owner); }
  /** A route instance mounts: new render identity (epoch, owner, attempt 1). */
  mount(owner: object): RenderIdentity { this.run?.destinationMounted?.(owner); return this.ledger.mount(owner); }
  /** Checkpoint `rendered`: post-effect once this identity's DOM exists. Stale identities are ignored. */
  /** Route instances whose semantic focus target is resolved at their DOM checkpoint (see `rendered`). */
  private readonly focusRoots = new Map<object, HTMLElement>();
  /** Registered by the route instance root element (FeatureOutletRoute), for route focus resolution. */
  registerRouteRoot(owner: object, node: HTMLElement): () => void { this.focusRoots.set(owner, node); return () => { if (this.focusRoots.get(owner) === node) this.focusRoots.delete(owner); }; }
  private liveRegion: HTMLElement | undefined;
  private lastRendered: object | undefined;
  /**
   * Semantic route focus and announcement at the normal route boundary: only when a committed route
   * instance replaces a previously rendered one (not initial render, hydration or render retry), with
   * `preventScroll`, before the scroll checkpoint and any measurement. Never steals focus already inside
   * the new page; the announcement comes from the real application view only.
   */
  private routeFocus(identity: RenderIdentity, replaced: boolean): void {
    if (!replaced || identity.attempt !== 1) return;
    const root = this.focusRoots.get(identity.owner);
    if (!root?.isConnected) return;
    const active = this.win.document.activeElement;
    if (active && active !== this.win.document.body && root.contains(active)) return;
    const target = root.querySelector<HTMLElement>('[data-route-focus]') ?? root.querySelector<HTMLElement>('h1');
    if (!target) return;
    if (!target.hasAttribute('tabindex') && target.tabIndex < 0) target.setAttribute('tabindex', '-1');
    try { target.focus({ preventScroll: true }); } catch { /* focus is best effort */ }
    const doc = this.win.document;
    if (!this.liveRegion || !this.liveRegion.isConnected) {
      const region = doc.createElement('div');
      region.setAttribute('role', 'status'); region.setAttribute('aria-live', 'polite'); region.setAttribute('data-composable-route-announcer', '');
      region.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;';
      doc.body.appendChild(region);
      this.liveRegion = region;
    }
    this.liveRegion.textContent = (target.textContent ?? '').trim().slice(0, 200);
  }
  rendered(identity: RenderIdentity): void {
    // A semantic route boundary: a different route owner than the last one rendered (retirement of the
    // outgoing instance may already have cleared `current`). Not the first render, not a retry.
    const replaced = this.lastRendered !== undefined && this.lastRendered !== identity.owner;
    this.lastRendered = identity.owner;
    if (!this.ledger.rendered(identity)) return;
    // Route focus, then the scroll policy, then (next frame) destination measurement. The route root
    // registers in the same flush; if it is not yet registered, finish in a pre-paint microtask.
    const boundary = () => {
      this.routeFocus(identity, replaced);
      this.observeScroll();
      try { this.scrollSeam()?.checkpoint(); } catch (error) { this.diagnose({ type: 'unsupported', transaction: 0 as TransactionId, participant: '*', reason: `scrollCheckpoint:${String(error)}` }); }
    };
    if (this.focusRoots.has(identity.owner) || !replaced) boundary();
    else queueMicrotask(() => { if (!this.disposed) boundary(); });
    this.current = identity.owner;
    this.run?.rendered(identity.owner);
  }
  /** Checkpoint `failed` from the route boundary. Returns false for a stale identity (diagnostic only). */
  failed(identity: RenderIdentity, error: unknown): boolean {
    if (!this.ledger.failed(identity, error)) return false;
    // Settle this identity's choreography as failed and release its decoration and suppression.
    this.run?.renderFailed(identity.owner);
    return true;
  }
  retry(identity: RenderIdentity): RenderIdentity | undefined { return this.ledger.retry(identity); }
  /** The Host's binding attached (a new epoch): restamp identities that mounted before attachment. */
  attached(): void { this.ledger.reconcile(); this.observeScroll(); }
  retire(owner: object): void { this.ledger.retire(owner); if (this.current === owner) this.current = undefined; this.releaseRetainedSource(owner); }
  /** A retired route/page owner's reacting participants end their resting contributions; overlay epochs survive. */
  private releaseRetainedSource(source: object): void {
    for (const [node, stack] of [...this.retained]) {
      const removed = stack.filter(entry => entry.source === source);
      if (!removed.length) continue;
      const rest = stack.filter(entry => !removed.includes(entry));
      if (rest.length) this.retained.set(node, rest); else this.retained.delete(node);
      for (const entry of removed) for (const held of Object.values(entry.channels)) held?.lease?.release();
      if (rest.length) this.holdTop(node);
    }
  }
  /** Host boundary escalation: record, then release all visuals (teardown follows in the Host). */
  escalated(error: unknown): void { this.ledger.escalated(error); }
  /**
   * S2 managed removal checkpoint: a `<Presence>` boundary's committed state removed these participants and Svelte
   * has not yet destroyed their DOM. Active runs hand off their outgoing (and shared-source) representations now.
   */
  removing(nodes: readonly HTMLElement[]): void {
    if (this.disposed || !nodes.length) return;
    this.run?.participantsRemoving(nodes);
    for (const run of this.localRuns.values()) run.participantsRemoving(nodes);
  }
  /** A running choreography owns this outgoing instance's removal visuals (CaptureChannel skips it). */
  claims(owner: object): boolean { return this.run?.claims(owner) ?? false; }
  register(node: HTMLElement, key: string, owner: object | undefined, role: Participant['role'] = 'surface'): () => void {
    const entry: Participant = { node, key, owner, role };
    this.participants.add(entry);
    this.run?.registered(entry);
    for (const run of this.localRuns.values()) run.registered(entry);
    for (const engine of this.engines) engine.warm(node);
    return () => { this.participants.delete(entry); for (const engine of this.engines) engine.forget(node); };
  }
  find(key: string, owner: object | undefined): Participant[] {
    const found: Participant[] = [];
    // One participant per node: several registrations of the same node, key and owner (a role registered by two
    // overlapping runs) are the same participant.
    for (const entry of this.participants) if (entry.key === key && entry.owner === owner && entry.node.isConnected && !found.some(other => other.node === entry.node)) found.push(entry);
    return found;
  }
  ensurePlane(): HTMLElement {
    const doc = this.win.document;
    if (!this.planeNode || !this.planeNode.isConnected) {
      const plane = doc.createElement('div');
      plane.inert = true;
      plane.setAttribute('aria-hidden', 'true');
      plane.setAttribute('data-composable-route-plane', '');
      plane.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:visible;contain:layout style;';
      (this.planeOutlet?.isConnected ? this.planeOutlet : doc.body).appendChild(plane);
      this.planeNode = plane;
    }
    return this.planeNode;
  }
  releasePlane(): void { if (this.planeNode && !this.planeNode.childNodes.length) { this.planeNode.remove(); this.planeNode = undefined; } }
  reduced(): boolean { try { return this.win.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }
  // VisualCuePort ---------------------------------------------------------------------------------
  admitted(event: Extract<VisualLifecycle, { type: 'admitted' }>): boolean {
    if (this.disposed) return false;
    const plan = event.motion as ChoreographyPlan | undefined;
    if (!plan || !Array.isArray((plan as { tracks?: unknown }).tracks)) return false;
    const engine = this.engineFor(plan);
    if (!engine) return false;
    // Supersession: the successor adopts displayed shared poses; the predecessor then settles without
    // removing or restoring anything it handed off.
    const adopted = this.run?.handOff() ?? { shared: [], outgoing: new Map() };
    this.run?.settle('superseded');
    // Reduced motion and a missing current page use the next-turn cue.
    if (this.reduced() || this.current === undefined) {
      engine.discard(adopted);
      this.releasePlane();
      return false;
    }
    const run: EngineRun = engine.createRun(this, event.transaction, plan, this.current, adopted, () => { if (this.run === run) this.run = undefined; });
    this.run = run;
    return true;
  }
  notify(event: Exclude<VisualLifecycle, { type: 'admitted' }>): void { this.run?.lifecycle(event); }
  private readonly localRuns = new Map<object, EngineRun>();
  /** Conflict arbitration (run.ts `lease`): the earlier run holding `node` yields it to the caller. */
  arbitrate(node: HTMLElement, holder: object): ChoreographyLease | undefined {
    const runs: EngineRun[] = [...(this.run ? [this.run] : []), ...this.localRuns.values()];
    const run = runs.find(candidate => candidate === holder);
    return run?.yieldNode?.(node);
  }
  /**
   * Overlay transition (fluid-overlays implementation-interface §2): an accepted, committed presentation change of
   * one overlay instance, claimed by its plan. Returns the claim (the component skips its spring) or undefined.
   * The completion obligation is delivered exactly once at settle while current; `cancel` (supersession by the
   * component, a new epoch) and Host disposal cancel it without dispatch.
   */
  /**
   * Explicit presentation-bound entry (C2/C5, phase-correct). Called BEFORE the business commit: the plan's sources
   * are validated and captured now, but nothing is acquired — no lease, write or arbitration of an earlier run — until
   * the commit's transition is accepted and claimed (`overlayTransition` with `prepared` → `accept()`). Unclaimed
   * (refused/guarded intent) it is discarded: only its captures are disposed, and any earlier run keeps progressing
   * with its copies, leases, tracks and obligations untouched. Undefined without an engine (SSR, reduced motion).
   */
  overlayPrepare(plan: ChoreographyPlan, scope: object | undefined, instance?: OverlayInstance | undefined): OverlayPrepared | undefined {
    const engine = this.disposed || this.reduced() ? undefined : this.engineFor(plan);
    if (!engine) return undefined;
    const roles = new Set<HTMLElement>();
    const releases: (() => void)[] = [];
    // The current instance's roles are sources of a close (or of a reopen): registered before capture.
    for (const [key, node] of [['backdrop', instance?.backdrop], ['content', instance?.content]] as const) {
      if (!node || !instance) continue;
      roles.add(node);
      releases.push(this.register(node, key, instance.owner)); // owned by this run (an earlier run's registration may end first)
    }
    this.registerNamedRoles(plan, roles, releases);
    const cell: OverlayPrepared = { run: undefined, key: {}, roles, releases, done: undefined, settled: false };
    const transaction = (this.nextLocal--) as TransactionId;
    try {
      cell.run = engine.createRun(this, transaction, plan, scope as object, { shared: [], outgoing: new Map() }, () => { cell.settled = true; if (cell.run) this.releaseJoiners(cell.run); if (this.localRuns.get(cell.key) === cell.run) this.localRuns.delete(cell.key); if (!cell.done) for (const release of releases.splice(0)) release(); cell.done?.(); }, () => {}, { overlayRoles: roles, deferAcquisition: true, retain: this.retainFor(() => cell.owner) });
    } catch (error) {
      this.diagnose({ type: 'unsupported', transaction, participant: '*', reason: `overlayFailed:${String(error)}` });
      for (const release of releases.splice(0)) release();
      return undefined;
    }
    if (!cell.settled) this.localRuns.set(cell.key, cell.run);
    return cell;
  }
  /** Discard a prepared explicit run nothing claimed (refused intent): it acquired nothing; its captures are disposed. */
  overlayDiscard(prepared: OverlayPrepared): void { prepared.done = undefined; prepared.run?.settle('unclaimed'); for (const release of prepared.releases.splice(0)) release(); }
  overlayTransition(request: OverlayTransitionRequest & { readonly prepared?: OverlayPrepared | undefined }): OverlayTransitionClaim | undefined {
    if (this.disposed) return undefined;
    const { instance } = request;
    let open = true;
    const deliver = () => { if (!open || this.disposed) return; open = false; queueMicrotask(request.complete); };
    const prepared = request.prepared;
    if (prepared?.run && !prepared.settled) {
      // Attach the obligation and roles to the run prepared before the commit.
      const releases = prepared.releases;
      for (const [key, node] of [['backdrop', instance.backdrop], ['content', instance.content]] as const) {
        if (!node) continue;
        prepared.roles.add(node);
        releases.push(this.register(node, key, instance.owner)); // owned by this run (an earlier run's registration may end first)
      }
      // Accepted: only now does the prepared run acquire (arbitrating conflicting nodes of an earlier run, which it
      // then supersedes). Refused/unclaimed, it acquired nothing and the earlier run keeps progressing.
      const previous = this.localRuns.get(instance.owner);
      this.localRuns.delete(prepared.key); this.localRuns.set(instance.owner, prepared.run);
      const run = prepared.run;
      prepared.owner = instance.owner;
      prepared.done = () => { if (this.localRuns.get(instance.owner) === run) this.localRuns.delete(instance.owner); for (const release of releases.splice(0)) release(); deliver(); };
      run.accept?.();
      // Destinations first: arbitration adopts the earlier run's displayed paint (continuity); then it is superseded.
      run.discoverDestinations?.();
      if (previous && previous !== run) previous.settle('superseded');
      this.releaseRetained(instance.owner); // the accepted transition ends the previous resting state (unless adopted above)
      return { cancel: () => { if (!open) return; open = false; run.settle('superseded'); } };
    }
    const engine = this.engineFor(request.plan);
    if (!engine) return undefined;
    if (this.reduced()) {
      // Reduced motion: no animation, but the SAME resting state — an open applies its declared overlay-lifetime
      // reactions' terminal values at once (held like any resting reaction); a close releases them at once.
      this.releaseRetained(instance.owner);
      if (request.kind === 'present') this.applyResting(request.plan, request.scope, instance.owner);
      deliver(); return { cancel: () => { open = false; } };
    }
    // Roles register in the instance scope (sources for a close, destinations for an open).
    const roles = new Set<HTMLElement>();
    const releases: (() => void)[] = [];
    for (const [key, node] of [['backdrop', instance.backdrop], ['content', instance.content]] as const) {
      if (!node) continue;
      roles.add(node);
      releases.push(this.register(node, key, instance.owner)); // owned by this run (an earlier run's registration may end first)
    }
    this.registerNamedRoles(request.plan, roles, releases);
    const previous = this.localRuns.get(instance.owner);
    const adopted = previous?.handOff() ?? { shared: [], outgoing: new Map() };
    previous?.settle('superseded');
    const transaction = (this.nextLocal--) as TransactionId;
    const key = instance.owner;
    const holder: { run?: EngineRun } = {};
    let settled = false;
    const done = () => {
      settled = true;
      if (holder.run) this.releaseJoiners(holder.run);
      if (holder.run && this.localRuns.get(key) === holder.run) this.localRuns.delete(key);
      for (const release of releases.splice(0)) release();
      deliver();
    };
    try {
      holder.run = engine.createRun(this, transaction, request.plan, request.scope as object, adopted, done, () => {}, { overlayRoles: roles, retain: this.retainFor(() => instance.owner) });
    } catch (error) {
      this.diagnose({ type: 'unsupported', transaction, participant: '*', reason: `overlayFailed:${String(error)}` });
      for (const release of releases.splice(0)) release();
      deliver();
      return { cancel: () => { open = false; } };
    }
    if (!settled) { this.localRuns.set(key, holder.run); holder.run.discoverDestinations?.(); }
    this.releaseRetained(instance.owner); // the accepted transition ends the previous resting state (unless adopted above)
    return { cancel: () => { if (!open) return; open = false; holder.run?.settle('superseded'); } };
  }
  /**
   * Roles of OTHER bound instances a plan names through their handles (a parent's combined close naming a live child's
   * backdrop/content): registered in that instance's scope for this run, and driven as overlay roles.
   */
  private registerNamedRoles(plan: ChoreographyPlan, roles: Set<HTMLElement>, releases: (() => void)[]): void {
    const seen = new Set<object>();
    for (const track of plan.tracks) for (const selector of [track.participant, track.from, track.to]) {
      if (!selector || typeof selector !== 'object' || seen.has(selector.scope)) continue;
      seen.add(selector.scope);
      const named = overlayScopeInstance(selector.scope);
      if (!named) continue;
      for (const [key, node] of [['backdrop', named.backdrop], ['content', named.content]] as const) {
        if (!node || roles.has(node)) continue;
        roles.add(node);
        releases.push(this.register(node, key, named.owner));
      }
    }
  }
  private readonly joiners = new Map<EngineRun, Set<() => void>>();
  /**
   * Overlay-lifetime resting reactions: per node a STACK of epoch contributions (bottom = earliest layer), each holding
   * its channels independently (opacity, translate, scale: displayed value, base and lease). A later run adopts only
   * the channels it animates (from their displayed values); a lower layer's other channels keep their hold, and
   * unwinding re-establishes the surviving layer's contribution — never the baseline or a cumulative snapshot.
   */
  private readonly retained = new Map<HTMLElement, RestingEntry[]>();
  private retainFor(owner: () => object | undefined) {
    return (node: HTMLElement, pose: RestingPose, source?: object): boolean => {
      const epoch = owner();
      if (!epoch || this.disposed) return false;
      const stack = this.retained.get(node) ?? [];
      const own = stack.findIndex(entry => entry.owner === epoch);
      if (own >= 0) { for (const channel of Object.values(stack[own]!.channels)) channel?.lease?.release(); stack.splice(own, 1); }
      stack.push({ owner: epoch, channels: { ...pose }, source });
      this.retained.set(node, stack);
      return true;
    };
  }
  /** A run takes `channel` of `node`: its displayed value and base; the hold is retired (no write) AFTER acquisition. */
  takeRetained(node: HTMLElement, channel: RestingChannelName = 'opacity'): { readonly displayed: number | readonly [number, number]; readonly base: number | readonly [number, number]; retire(): void } | undefined {
    const stack = this.retained.get(node);
    for (let index = (stack?.length ?? 0) - 1; index >= 0; index--) {
      const held = stack![index]!.channels[channel];
      if (!held) continue;
      return { displayed: held.value, base: held.base, retire: () => { held.lease?.abandon(); held.lease = undefined; } };
    }
    return undefined;
  }
  private writeChannel(lease: ChoreographyLease, channel: RestingChannelName, held: RestingChannel): void {
    if (channel === 'opacity') lease.write(String(held.value));
    else if (channel === 'scale') lease.write(String((held.base as number) * (held.value as number)));
    else { const [bx, by] = held.base as readonly [number, number], [dx, dy] = held.value as readonly [number, number]; lease.write(`${bx + dx}px ${by + dy}px`); }
  }
  /** While a node's surviving contribution has a channel without a writer, a Host-held lease rests it at that value. */
  private holdTop(node: HTMLElement): void {
    if (!node.isConnected) return; // removed: nothing is re-held (no stale write)
    const stack = this.retained.get(node) ?? [];
    for (const channel of ['opacity', 'translate', 'scale'] as const) {
      const entry = [...stack].reverse().find(candidate => candidate.channels[channel]);
      const held = entry?.channels[channel];
      if (!held || held.lease) continue;
      let lease: ChoreographyLease | undefined;
      const acquired = acquireChoreographyLease(this.root, node, channel, () => !this.disposed && (lease === undefined || held.lease === lease), { holder: this });
      if ('foreign' in acquired) continue; // a live run owns this channel: it continues from the displayed value
      lease = acquired; held.lease = acquired;
      this.writeChannel(acquired, channel, held);
    }
  }
  /** The participant a track's (plain or scoped) selector names in the destination scope, if exactly one. */
  private restingTarget(selector: ParticipantSelector, scope: object | undefined): { readonly node: HTMLElement; readonly source: object | undefined } | undefined {
    // A scoped overlay role (another instance's backdrop/content) resolves to that bound instance's element.
    if (typeof selector !== 'string' && (selector.key === 'content' || selector.key === 'backdrop')) { const instance = overlayScopeInstance(selector.scope); const role = instance?.[selector.key]; if (role) return { node: role, source: instance!.owner }; }
    const owner = typeof selector === 'string' ? scope : overlayScopeOwner(selector.scope);
    if (owner === null) return undefined;
    const found = this.find(typeof selector === 'string' ? selector : selector.key, owner ?? undefined);
    return found.length === 1 ? { node: found[0]!.node, source: found[0]!.owner } : undefined;
  }
  /** Reduced motion: the declared resting POSE (opacity, scale, slide) is applied and held at once — no animation. */
  private applyResting(plan: ChoreographyPlan, scope: object | undefined, owner: object): void {
    for (const track of plan.tracks) {
      if (track.side !== 'outgoing' || track.lifetime !== 'overlay') continue;
      const target = this.restingTarget(track.participant, scope);
      if (!target) continue;
      const node = target.node;
      const pose: RestingPose = {};
      const stack = (this.retained.get(node) ?? []).filter(entry => entry.owner !== owner);
      const baseOf = (channel: RestingChannelName) => stack.find(entry => entry.channels[channel])?.channels[channel]?.base;
      const take = (channel: RestingChannelName, value: (lease: ChoreographyLease) => RestingChannel) => {
        // A lower layer's hold on this channel is retired (its value kept for unwind), then ours is acquired.
        for (const entry of stack) { const held = entry.channels[channel]; if (held?.lease) { held.lease.abandon(); held.lease = undefined; } }
        let lease: ChoreographyLease | undefined;
        const acquired = acquireChoreographyLease(this.root, node, channel, () => !this.disposed && (lease === undefined || pose[channel]?.lease === lease), { holder: this });
        if ('foreign' in acquired) return;
        lease = acquired;
        pose[channel] = { ...value(acquired), lease: acquired };
      };
      take('opacity', lease => { const base = (baseOf('opacity') as number | undefined) ?? lease.stableNumber; return { value: (track.opacity?.to ?? 1) * base, base }; });
      // Bases compose with the stylesheet value like animated transforms (an empty inline stable is the computed base).
      const sheet = this.win.getComputedStyle(node);
      if (track.scale && track.scale.to !== 1) take('scale', lease => ({ value: track.scale!.to, base: (baseOf('scale') as number | undefined) ?? (Number.parseFloat(lease.stable || (sheet.scale === 'none' ? '1' : sheet.scale)) || 1) }));
      if (track.slide && (track.slide.dx || track.slide.dy)) take('translate', lease => {
        const parts = (lease.stable || (sheet.translate === 'none' ? '0px 0px' : sheet.translate) || '0px 0px').trim().split(/\s+/).map(part => Number.parseFloat(part) || 0);
        return { value: [track.slide!.dx ?? 0, track.slide!.dy ?? 0] as const, base: (baseOf('translate') as readonly [number, number] | undefined) ?? [parts[0] ?? 0, parts[1] ?? 0] as const };
      });
      stack.push({ owner, channels: pose, source: target.source });
      this.retained.set(node, stack);
      for (const [channel, held] of Object.entries(pose) as [RestingChannelName, RestingChannel][]) if (held.lease) this.writeChannel(held.lease, channel, held);
    }
  }
  /** Release resting reactions of `owner` (all when undefined); a surviving lower layer's contribution is restored. */
  releaseRetained(owner?: object): void {
    for (const [node, stack] of [...this.retained]) {
      const removed = stack.filter(entry => owner === undefined || entry.owner === owner);
      if (!removed.length) continue;
      const rest = stack.filter(entry => !removed.includes(entry));
      if (rest.length) this.retained.set(node, rest); else this.retained.delete(node);
      for (const entry of removed) for (const held of Object.values(entry.channels)) held?.lease?.release();
      if (rest.length) this.holdTop(node);
    }
  }


  /**
   * An overlay instance whose accepted transition is already driven by a live run (named by another instance's plan)
   * joins it: no second writer; its completion is delivered once when that run settles (not after Host disposal).
   */
  overlayJoin(instance: OverlayInstance, complete: () => void): OverlayTransitionClaim | undefined {
    if (this.disposed) return undefined;
    const nodes = [instance.content, instance.backdrop].filter((node): node is HTMLElement => !!node);
    const own = this.localRuns.get(instance.owner); // this instance's own earlier run is superseded, never joined
    const run = [...(this.run ? [this.run] : []), ...this.localRuns.values()].find(candidate => candidate !== own && nodes.some(node => candidate.holds?.(node)));
    if (!run) return undefined;
    let set = this.joiners.get(run);
    if (!set) { set = new Set(); this.joiners.set(run, set); }
    const entry = () => complete();
    set.add(entry);
    return { cancel: () => { set!.delete(entry); } };
  }
  private releaseJoiners(run: EngineRun): void {
    const set = this.joiners.get(run);
    if (!set) return;
    this.joiners.delete(run);
    for (const entry of set) queueMicrotask(() => { if (!this.disposed) entry(); });
  }
  private nextLocal = -1;
  /**
   * Within-page choreography: capture the scope's participants now, run the business commit immediately
   * (no staging, no deferral), then bridge the layouts visually under the same lifecycle. A later
   * transition in the same scope adopts displayed poses (rapid expand/collapse continues, no restart).
   */
  local(plan: ChoreographyPlan, scope: object | undefined, commit: () => void): void {
    const key = scope ?? this;
    const previous = this.localRuns.get(key);
    const engine = Array.isArray((plan as { tracks?: unknown }).tracks) ? this.engineFor(plan) : undefined;
    if (this.disposed || this.reduced() || !engine) { previous?.settle('superseded'); commit(); return; }
    const adopted = previous?.handOff() ?? { shared: [], outgoing: new Map() };
    previous?.settle('superseded');
    const transaction = (this.nextLocal--) as TransactionId;
    let settledEarly = false;
    let committed = false;
    const holder: { run?: EngineRun } = {};
    const explicit = () => { committed = true; commit(); };
    try {
      holder.run = engine.createRun(this, transaction, plan, scope as object, adopted, () => { settledEarly = true; if (holder.run && this.localRuns.get(key) === holder.run) this.localRuns.delete(key); }, explicit);
    } catch (error) {
      // A decorative failure never swallows the explicit business commit; a commit error propagates.
      if (committed) throw error;
      this.diagnose({ type: 'unsupported', transaction, participant: '*', reason: `localFailed:${String(error)}` });
      explicit();
      return;
    }
    if (!settledEarly) this.localRuns.set(key, holder.run);
  }
  dispose(): void {
    if (this.disposed) return;
    // (Overlay completion obligations of this Host are cancelled: `deliver` checks `disposed`.)
    this.disposed = true;
    this.stopTurns();
    this.stopScroll?.();
    this.stopGeometry?.(); this.stopGeometry = undefined;
    this.liveRegion?.remove();
    this.liveRegion = undefined;
    this.run?.settle('hostDisposed');
    for (const run of [...this.localRuns.values()]) run.settle('hostDisposed');
    this.localRuns.clear();
    this.releaseRetained(); // Host destroyed: resting reactions restore
    // A replacement Host may already own the port; a retired Host never clears its successor.
    if (this.staged && hosts.get(this.staged) === this) { hosts.delete(this.staged); this.staged.coordinator.setVisualPort(undefined); }
    for (const entry of this.participants) for (const engine of this.engines) engine.forget(entry.node);
    this.participants.clear();
    this.planeNode?.remove();
    this.planeNode = undefined;
  }
}


/** Stable public subset of the Host's visual diagnostics (VisualConfiguration.onDiagnostic). */
function publicDiagnostic(event: RouteVisualDiagnostic): VisualDiagnostic | undefined {
  switch (event.type) {
    case 'unsupported': return { type: 'unsupported', participant: event.participant, reason: event.reason };
    case 'representation': return { type: 'representation', participant: event.participant, provider: event.provider, continuity: event.continuity, ...(event.reason ? { reason: event.reason } : {}) };
    case 'preparation': return { type: 'preparation', transaction: event.transaction as number, workMs: event.workMs, slices: event.slices, cached: event.cached, projected: event.projected, elements: event.elements, outcome: event.outcome, ...(event.readinessPending ? { readinessPending: event.readinessPending } : {}) };
    case 'settled': return { type: 'settled', transaction: event.transaction as number, reason: event.reason };
    default: return undefined;
  }
}
