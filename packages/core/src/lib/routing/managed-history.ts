/** Internal managed history protocol. No public export until binding qualification. */
export interface HistoryEntry {
  readonly version: 1;
  readonly chain: string;
  readonly id: string;
  readonly index: number;
}
export interface HistorySnapshot { readonly url: string; readonly state: unknown; readonly entryKey?: string | undefined }
export interface HistoryPort {
  readonly identity?: object | undefined;
  read(): HistorySnapshot;
  liveEntryKeys?: (() => readonly string[] | undefined) | undefined;
  replace(url: string, state: unknown): void;
  push(url: string, state: unknown): void;
  go(delta: number): void;
  traverseTo?: ((key: string) => Promise<void>) | undefined;
  listen(listener: () => void): () => void;
}
export interface HistoryMetadataCodec {
  read(state: unknown): HistoryEntry | undefined;
  write(state: unknown, entry: HistoryEntry): unknown;
}
const namespace = '__composableRoute';
function record(state: unknown): Record<string, unknown> {
  if (state === null) return {};
  if (typeof state !== 'object' || state === null ||
      (Object.getPrototypeOf(state) !== Object.prototype && Object.getPrototypeOf(state) !== null))
    throw new TypeError('Managed history metadata requires plain-record or null state; supply an explicit metadata codec for other shapes');
  return state as Record<string, unknown>;
}
function entry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<HistoryEntry>;
  return item.version === 1 && typeof item.chain === 'string' && item.chain.length > 0 &&
    typeof item.id === 'string' && item.id.length > 0 && Number.isSafeInteger(item.index) && item.index! >= 0;
}
export const defaultHistoryMetadataCodec: HistoryMetadataCodec = {
  read(state) {
    const value = record(state);
    if (!Object.hasOwn(value, namespace)) return undefined;
    if (!entry(value[namespace])) throw new TypeError('Reserved managed history metadata is invalid');
    return value[namespace];
  },
  write(state, metadata) {
    const value = record(state);
    if (Object.hasOwn(value, namespace) && !entry(value[namespace]))
      throw new TypeError('Reserved managed history metadata is invalid');
    return { ...value, [namespace]: metadata };
  }
};
export type HistoryDiagnostic =
  | { readonly type: 'historyRebased'; readonly visitedURL: string; readonly acceptedURL: string }
  | { readonly type: 'historyFailure'; readonly operation: 'initialize' | 'traverse' | 'write'; readonly error: unknown };
export interface TraversalResult {
  readonly outcome: 'accepted' | 'redirected' | 'rejected';
  readonly acceptedURL: string;
}
export interface ManagedHistoryOptions {
  readonly port: HistoryPort;
  readonly acceptedURL: string;
  readonly fragment?: 'route' | 'native' | undefined;
  readonly id: () => string;
  readonly codec?: HistoryMetadataCodec | undefined;
  readonly report: (diagnostic: HistoryDiagnostic) => void;
  /** Framework binding submits one captured-owner turn and settles its exact envelope. */
  readonly traverse: (url: string, settle: (result: TraversalResult) => void) => void;
  /** Internal control signal, never a diagnostic: a reconciliation rebase write failed and the accepted URL has no browser entry. */
  readonly rebaseFailed?: (() => void) | undefined;
}
const activePorts = new WeakSet<object>();

export interface ManagedHistoryConnection {
  /** Internal per-call signal distinguishes a failed physical write from preparation failures. */
  accepted(url: string, replace?: boolean, writeFailed?: () => void): boolean;
  /** Record committed feature acceptance when a policy prevents a browser write. */
  unwritten(url: string): void;
  dispose(): void;
}
/** Owns one connection; enclosing binding enrolls dispose in its ResourceScope. */
export function connectManagedHistory(options: ManagedHistoryOptions): ManagedHistoryConnection | undefined {
  const { port, id } = options;
  const codec = options.codec ?? defaultHistoryMetadataCodec;
  let live = true;
  let generation = 0;
  let settledGeneration = 0;
  const routeURL = (url: string) => options.fragment === 'native' ? url.split('#')[0]! : url;
  const preserveFragment = (url: string, physicalURL: string) => options.fragment === 'native' ? routeURL(url) + (physicalURL.includes('#') ? physicalURL.slice(physicalURL.indexOf('#')) : '') : url;
  let acceptedURL = options.acceptedURL;
  let acceptedObservedURL = acceptedURL;
  let acceptedHasEntry = true;
  let acceptedEntry: HistoryEntry;
  let pending: {entry: HistoryEntry; url: string; key: string; snapshot: HistorySnapshot; generation: number} | undefined;
  const knownEntries = new Map<string, HistoryEntry>();
  const report = (diagnostic: HistoryDiagnostic) => {
    try { options.report(diagnostic); } catch { /* Diagnostics cannot change history control flow. */ }
  };
  // Only the physical port write arms the binding's retry; codec, identity and read
  // failures stay ordinary traversal failures. The caller still reports the exact error.
  const rebase = (state: unknown) => {
    try { port.replace(acceptedURL, state); }
    catch (error) {
      acceptedHasEntry = false;
      try { options.rebaseFailed?.(); } catch { /* The signal cannot change history control flow. */ }
      throw error;
    }
  };
  const authority = port.identity ?? port;
  if (activePorts.has(authority)) {
    report({type: 'historyFailure', operation: 'initialize', error: new Error('A managed history connection already owns this browser port')});
    return undefined;
  }
  activePorts.add(authority);
  const prune = () => {
    const keys = port.liveEntryKeys?.();
    if (!keys || new Set(keys).size !== keys.length || keys.some(key => typeof key !== 'string' || key.length === 0)) {
      knownEntries.clear();
      return undefined;
    }
    const liveKeys = new Set(keys);
    if (pending && !liveKeys.has(pending.key)) pending = undefined;
    for (const key of knownEntries.keys()) if (!liveKeys.has(key)) knownEntries.delete(key);
    return keys;
  };
  const remember = (metadata: HistoryEntry) => {
    const keys = prune();
    const key = port.read().entryKey;
    if (key && keys?.includes(key)) knownEntries.set(key, metadata);
  };
  const keyFor = (metadata: HistoryEntry) => {
    for (const [key, known] of knownEntries) if (known.chain === metadata.chain && known.id === metadata.id && known.index === metadata.index) return key;
    return undefined;
  };
  const rollback = (incoming: HistoryEntry, snapshot: HistorySnapshot): boolean => {
    if (!acceptedHasEntry) return false;
    const keys = prune();
    const targetKey = keyFor(acceptedEntry);
    const from = snapshot.entryKey && keys ? keys.indexOf(snapshot.entryKey) : -1;
    const to = targetKey && keys ? keys.indexOf(targetKey) : -1;
    if (incoming.chain !== acceptedEntry.chain || from < 0 || to < 0 || from === to || !targetKey) return false;
    if (!pending) {
      pending = {entry: acceptedEntry, url: acceptedObservedURL, key: targetKey, snapshot, generation};
      if (port.traverseTo) {
        const correction = pending;
        void port.traverseTo(targetKey).catch(error => {
          if (!live || pending !== correction) return;
          pending = undefined;
          report({type:'historyFailure',operation:'traverse',error});
          try {
            const current = port.read();
            if (generation !== correction.generation || current.entryKey !== correction.snapshot.entryKey || current.url !== correction.snapshot.url || !sameEntry(codec.read(current.state), codec.read(correction.snapshot.state))) return;
            const replacement = fresh();
            rebase(codec.write(current.state, replacement));
            acceptedEntry = replacement;
            acceptedHasEntry = true;
            acceptedObservedURL = acceptedURL;
            knownEntries.clear();
            remember(replacement);
            report({type:'historyRebased',visitedURL:current.url,acceptedURL});
          } catch (recoveryError) { report({type:'historyFailure',operation:'traverse',error:recoveryError}); }
        });
      } else port.go(to - from);
    } else { pending.snapshot = snapshot; pending.generation = generation; }
    return true;
  };
  const fresh = (index = 0, chain = id()): HistoryEntry => {
    const value: HistoryEntry = {version: 1, chain, id: id(), index};
    if (!entry(value)) throw new TypeError('Managed history identity or index is invalid');
    return value;
  };
  try {
    const initial = port.read();
    acceptedURL = preserveFragment(acceptedURL,initial.url);
    acceptedObservedURL = acceptedURL;
    // Validate before any mutation or listener enrollment, including reserved-key collisions.
    codec.read(initial.state);
    acceptedEntry = fresh();
    const state = codec.write(initial.state, acceptedEntry);
    port.replace(acceptedURL, state);
    remember(acceptedEntry);
  } catch (error) {
    activePorts.delete(authority);
    report({type: 'historyFailure', operation: 'initialize', error});
    return undefined;
  }
  const sameEntry = (left: HistoryEntry | undefined, right: HistoryEntry | undefined) =>
    left !== undefined && right !== undefined && left.chain === right.chain && left.id === right.id && left.index === right.index;
  const onTraversal = () => {
    if (!live) return;
    const eventGeneration = ++generation;
    let snapshot: HistorySnapshot;
    let incoming: HistoryEntry | undefined;
    try {
      snapshot = port.read();
      incoming = codec.read(snapshot.state);
      prune();
      const known = snapshot.entryKey ? knownEntries.get(snapshot.entryKey) : undefined;
      if (!sameEntry(incoming, known)) incoming = undefined;
      // Give an unknown visited entry an identity before queued acceptance, without
      // changing its URL or user fields. A same-URL later entry is then distinguishable.
      if (incoming === undefined) {
        incoming = fresh();
        const state = codec.write(snapshot.state, incoming);
        port.replace(snapshot.url, state);
        remember(incoming);
        snapshot = port.read();
      }
    }
    catch (error) { pending = undefined; report({type: 'historyFailure', operation: 'traverse', error}); return; }
    if (sameEntry(incoming, pending?.entry) && snapshot.entryKey === pending?.key && snapshot.url === pending?.url) {
      pending = undefined;
      settledGeneration = eventGeneration;
      try {
        if (!acceptedHasEntry || !sameEntry(incoming, acceptedEntry)) {
          if (rollback(incoming!, snapshot)) return;
          const replacement = fresh();
          rebase(codec.write(snapshot.state, replacement));
          acceptedEntry = replacement;
          acceptedHasEntry = true;
          knownEntries.clear();
          remember(replacement);
          report({type:'historyRebased',visitedURL:snapshot.url,acceptedURL});
        } else if (snapshot.url !== acceptedURL) {
          port.replace(acceptedURL, codec.write(snapshot.state, acceptedEntry));
          remember(acceptedEntry);
        }
        acceptedObservedURL = acceptedURL;
      } catch (error) { report({type:'historyFailure',operation:'traverse',error}); }
      return;
    }
    let settled = false;
    const settle = (decision: TraversalResult) => {
      const result = {...decision,acceptedURL:preserveFragment(decision.acceptedURL,decision.outcome === 'rejected' ? acceptedURL : snapshot.url)};
      if (settled) return;
      settled = true;
      if (!live || eventGeneration < settledGeneration) return;
      settledGeneration = eventGeneration;
      try {
        const current = port.read();
        const active = eventGeneration === generation && current.url === snapshot.url && current.entryKey === snapshot.entryKey && sameEntry(codec.read(current.state), incoming);
        if (!active) {
          // Accepted feature turns still happened. Retain their destination for a
          // later rejection, but never write over the browser's newer active entry.
          if (result.outcome !== 'rejected') {
            acceptedEntry = incoming!;
            acceptedHasEntry = true;
            acceptedURL = result.acceptedURL;
            acceptedObservedURL = snapshot.url;
          }
          return;
        }
        if (result.outcome === 'rejected') {
          if (acceptedURL !== result.acceptedURL) { acceptedURL = result.acceptedURL; acceptedHasEntry = false; }
          if (rollback(incoming!, snapshot)) return;
          const replacement = fresh();
          const state = codec.write(current.state, replacement);
          if (!live || eventGeneration !== generation) return;
          rebase(state);
          acceptedEntry = replacement;
          acceptedHasEntry = true;
          knownEntries.clear();
          remember(replacement);
          acceptedObservedURL = acceptedURL;
          report({type: 'historyRebased', visitedURL: snapshot.url, acceptedURL});
          return;
        }
        acceptedURL = result.acceptedURL;
        acceptedHasEntry = false;
        const next = incoming!;
        const state = codec.write(current.state, next);
        if (!live || eventGeneration !== generation) return;
        // Claim unknown entries and canonicalize redirects without pushing.
        if (!sameEntry(incoming, next) || current.url !== result.acceptedURL) port.replace(result.acceptedURL, state);
        acceptedEntry = next;
        acceptedHasEntry = true;
        remember(next);
        acceptedURL = result.acceptedURL;
        acceptedObservedURL = result.acceptedURL;
      } catch (error) { pending = undefined; report({type: 'historyFailure', operation: 'traverse', error}); }
    };
    try { options.traverse(routeURL(snapshot.url), settle); }
    catch (error) { report({type: 'historyFailure', operation: 'traverse', error}); }
  };
  let stop: () => void;
  try { stop = port.listen(onTraversal); }
  catch (error) { live = false; activePorts.delete(authority); report({type: 'historyFailure', operation: 'initialize', error}); return undefined; }
  return {
    accepted(url, replace = false, writeFailed) {
      if (!live) return false;
      let current: HistorySnapshot;
      try { current = port.read(); }
      catch (error) {
        generation++; settledGeneration = generation;
        acceptedURL = preserveFragment(url,acceptedURL); acceptedHasEntry = false;
        report({type:'historyFailure',operation:'write',error});
        return false;
      }
      url = preserveFragment(url,current.url);
      if (url === acceptedURL && acceptedHasEntry) return true;
      acceptedURL = url;
      acceptedHasEntry = false;
      generation++;
      settledGeneration = generation;
      try {
        const replacingAcceptedEntry = replace && sameEntry(codec.read(current.state), acceptedEntry) && current.entryKey === keyFor(acceptedEntry);
        const next = replacingAcceptedEntry ? acceptedEntry : fresh(replace ? acceptedEntry.index : acceptedEntry.index + 1, acceptedEntry.chain);
        // Replacements preserve current state; pushes do not copy entry-specific user payload.
        const state = codec.write(replace ? current.state : null, next);
        if (!live) return false;
        try { if (replace) port.replace(url, state); else port.push(url, state); }
        catch (error) {
          try { writeFailed?.(); } catch { /* A control observer cannot replace the browser error. */ }
          throw error;
        }
        acceptedURL = url;
        acceptedObservedURL = url;
        acceptedEntry = next;
        acceptedHasEntry = true;
        remember(next);
        return true;
      } catch (error) { report({type: 'historyFailure', operation: 'write', error}); return false; }
    },
    unwritten(url) { if (!live) return; generation++; settledGeneration = generation; acceptedURL = preserveFragment(url,acceptedURL); acceptedHasEntry = false; },
    dispose() { if (!live) return; live = false; generation++; pending = undefined; knownEntries.clear(); try { stop(); } finally { activePorts.delete(authority); } }
  };
}

/** Explicit browser injection keeps construction and server imports DOM-free. */
export function browserHistoryPort(browser: Window): HistoryPort {
  let observeWrite: ((pushed: boolean) => void) | undefined;
  interface NativeNavigation { currentEntry?: {key?: string | undefined} | undefined; entries(): Array<{key?: string | undefined}>; traverseTo?: ((key:string) => {committed:Promise<unknown>;finished:Promise<unknown>}) | undefined }
  const native = (): NativeNavigation | undefined => {
    const value: unknown = Reflect.get(browser, 'navigation');
    return value && typeof value === 'object' && typeof Reflect.get(value, 'entries') === 'function' && typeof Reflect.get(value, 'traverseTo') === 'function' ? value as NativeNavigation : undefined;
  };
  return {
    identity: browser,
    read: () => {
      const key = native()?.currentEntry?.key;
      return {url: browser.location.pathname + browser.location.search + browser.location.hash, state: browser.history.state,
        ...(typeof key === 'string' && key ? {entryKey:key} : {})};
    },
    liveEntryKeys: () => {
      const entries = native()?.entries();
      if (!entries || entries.some(entry => typeof entry.key !== 'string' || entry.key.length === 0)) return undefined;
      return entries.map(entry => entry.key!);
    },
    replace: (url, state) => { browser.history.replaceState(state, '', url); observeWrite?.(false); },
    push: (url, state) => { browser.history.pushState(state, '', url); observeWrite?.(true); },
    go: delta => browser.history.go(delta),
    traverseTo: async key => {
      const navigation = native();
      if (typeof navigation?.traverseTo !== 'function') throw new Error('Exact-key browser traversal is unavailable');
      const result = navigation.traverseTo(key);
      // Physical arrival is committed even if an interceptor later fails.
      // Observe finished separately; it cannot revoke correction identity.
      void result.finished.catch(() => {});
      await result.committed;
    },
    listen(listener) {
      const locationURL = () => browser.location.pathname + browser.location.search + browser.location.hash;
      const relativeURL = (url: string) => { const parsed = new URL(url, browser.location.href); return parsed.pathname + parsed.search + parsed.hash; };
      let previousURL = locationURL();
      const updateObservedURL = (pushed: boolean) => {
        const url = locationURL();
        const candidateKey = native()?.currentEntry?.key;
        const key = typeof candidateKey === 'string' && candidateKey.length > 0 ? candidateKey : undefined;
        if (pushed || last?.url !== url || last?.key !== key) last = undefined;
        previousURL = url;
      };
      observeWrite = updateObservedURL;
      let last: {key: string | undefined; url: string; from: string; type: 'popstate' | 'hashchange'} | undefined;
      const deliver = (type: 'popstate' | 'hashchange', event?: HashChangeEvent) => {
        const url = locationURL();
        const candidateKey = native()?.currentEntry?.key;
        const key = typeof candidateKey === 'string' && candidateKey.length > 0 ? candidateKey : undefined;
        // A queued hash event for a superseded URL cannot govern the current entry.
        if (event && relativeURL(event.newURL) !== url) return;
        const samePhysicalTransaction = key !== undefined && key === last?.key && url === last.url;
        const pairedWithoutKeys = key === undefined && last?.key === undefined && last?.type === 'popstate' && type === 'hashchange' && event !== undefined && relativeURL(event.newURL) === last.url && relativeURL(event.oldURL) === last.from;
        if (samePhysicalTransaction || pairedWithoutKeys) return;
        const delivery = {key,url,from:previousURL,type};
        previousURL = url;
        last = delivery;
        listener();
      };
      const popstate = () => deliver('popstate');
      const hashchange = (event: HashChangeEvent) => deliver('hashchange', event);
      browser.addEventListener('popstate', popstate);
      browser.addEventListener('hashchange', hashchange);
      return () => { if (observeWrite === updateObservedURL) observeWrite = undefined; browser.removeEventListener('popstate', popstate); browser.removeEventListener('hashchange', hashchange); };
    }
  };
}
