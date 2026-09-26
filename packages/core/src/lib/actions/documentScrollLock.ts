/** Browser resource ownership only; importing this module acquires nothing. */
interface Property { value: string; priority: string }
interface Lock {
  body: HTMLElement;
  count: number;
  original: Map<string, Property>;
  applied: Map<string, Property>;
}
const locks = new WeakMap<Document, Lock>();
const read = (style: CSSStyleDeclaration, name: string): Property => ({
  value: style.getPropertyValue(name), priority: style.getPropertyPriority(name)
});

/** A document's first acquisition writes; its last release restores owned values. */
export function acquireDocumentScrollLock(document: Document): () => void {
  let lock = locks.get(document);
  if (!lock) {
    const body = document.body;
    if (!body) return () => {};
    lock = { body, count: 0, original: new Map(), applied: new Map() };
    const write = (name: string, value: string) => {
      lock!.original.set(name, read(body.style, name));
      body.style.setProperty(name, value, 'important');
      lock!.applied.set(name, read(body.style, name));
    };
    const view = document.defaultView;
    const gap = view ? Math.max(0, view.innerWidth - document.documentElement.clientWidth) : 0;
    const padding = view ? Number.parseFloat(view.getComputedStyle(body).paddingRight) || 0 : 0;
    write('overflow-x', 'hidden');
    write('overflow-y', 'hidden');
    if (gap > 0) write('padding-right', `${padding + gap}px`);
    locks.set(document, lock);
  }
  lock.count++;
  let live = true;
  return () => {
    if (!live) return;
    live = false;
    if (--lock.count > 0) return;
    locks.delete(document);
    for (const [name, applied] of lock.applied) {
      const current = read(lock.body.style, name);
      // A foreign style writer retains its newer value; cleanup owns only ours.
      if (current.value !== applied.value || current.priority !== applied.priority) continue;
      const original = lock.original.get(name)!;
      if (original.value) lock.body.style.setProperty(name, original.value, original.priority);
      else lock.body.style.removeProperty(name);
    }
  };
}

/** Private action: the actual rendered node chooses its document, including portals. */
export function documentScrollLock(node: HTMLElement, enabled: boolean) {
  let release: (() => void) | undefined;
  let live = true;
  const update = (active: boolean) => {
    if (!live) return;
    if (active) release ??= acquireDocumentScrollLock(node.ownerDocument);
    else { release?.(); release = undefined; }
  };
  update(enabled);
  return { update, destroy() { live = false; release?.(); release = undefined; } };
}
