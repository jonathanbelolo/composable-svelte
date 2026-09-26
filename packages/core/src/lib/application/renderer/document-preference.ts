import type { CleanupFunction, ResourceRecord, ResourceRecordOptions } from '../../execution/resources.js';
import { connectMotionPreference, prefersReducedMotionIn, reportMotionPreferenceError } from '../../animation/reduced-motion.js';

export interface DocumentPreferences {
  reduced(nodes: readonly Node[]): boolean;
  watch(nodes: readonly Node[], onReduced: () => void): CleanupFunction;
  dispose(): void;
}
interface PreferenceEntry {
  record: ResourceRecord | undefined;
  live: boolean;
  dispose(): void;
  readonly subscribers: Set<() => void>;
  reduced: boolean;
}
/** Root-owned, document-keyed observation. Silent mid-run adoption is not observed;
 * stale document events are ignored, and the next start rereads actual documents. */
export function createDocumentPreferences(
  register: (options: ResourceRecordOptions) => ResourceRecord,
  onError: (error: unknown) => void
): DocumentPreferences {
  const entries = new Map<Document, PreferenceEntry>();
  let disposed = false;
  const report = (error: unknown) => reportMotionPreferenceError(onError, error);
  const resolveDoc = (node: Node): Document | null => node.ownerDocument ?? (node.nodeType === 9 ? node as Document : null);
  const deliver = (subscriber: () => void) => {
    try { void Promise.resolve(subscriber()).catch(report); } catch (error) { report(error); }
  };
  return {
    reduced(nodes) {
      if (disposed) return false;
      const docs = new Set(nodes.map(resolveDoc));
      for (const doc of docs) {
        if (doc && prefersReducedMotionIn(doc.defaultView, report)) return true;
      }
      return false;
    },
    watch(nodes, onReduced) {
      if (disposed) return () => {};
      const cleanups: CleanupFunction[] = [];
      const initial: Array<() => void> = [];
      for (const doc of new Set(nodes.map(resolveDoc))) {
        if (!doc || disposed) continue;
        let entry = entries.get(doc);
        if (!entry) {
          let owned: PreferenceEntry | undefined;
          let observed: boolean | undefined;
          const connection = connectMotionPreference(doc.defaultView, reduced => {
            observed = reduced;
            if (!owned || !owned.live || entries.get(doc) !== owned) return;
            owned.reduced = reduced;
            if (owned.record?.live && reduced) for (const sub of [...owned.subscribers]) {
              if (owned.subscribers.has(sub)) deliver(sub);
            }
          }, report);
          if (!connection) continue;
          // Reserve the successfully acquired connection before resource registration:
          // runtime observers can synchronously start another run in register().
          const current: PreferenceEntry = {
            record: undefined, live: true, subscribers: new Set(),
            reduced: observed ?? connection.reduced,
            dispose() {
              if (!current.live) return;
              current.live = false;
              if (entries.get(doc) === current) entries.delete(doc);
              current.subscribers.clear();
              connection.dispose();
              current.record?.dispose();
            }
          };
          entry = owned = current;
          entries.set(doc, current);
          let record: ResourceRecord;
          try { record = register({ kind: 'subscription', description: 'Document motion preference' }); }
          catch (error) { current.dispose(); report(error); continue; }
          current.record = record;
          record.addCleanup(() => current.dispose());
          if (disposed || !current.live || !record.live) {
            current.dispose(); record.dispose(); continue;
          }
          // Nested watchers joined the reservation while registration was publishing.
          // Notify them only once the acquired listener has resource ownership.
          if (current.reduced) initial.push(...current.subscribers);
        }
        const current = entry;
        const subscriber = () => {
          if (current.subscribers.has(subscriber) && nodes.some(node => resolveDoc(node) === doc)) return onReduced();
        };
        current.subscribers.add(subscriber);
        cleanups.push(() => {
          if (current.subscribers.delete(subscriber) && !current.subscribers.size) current.record?.dispose();
        });
        if (current.record?.live && current.reduced) initial.push(subscriber);
      }
      // Publish all cleanup ownership before initial delivery can supersede a run.
      for (const subscriber of initial) deliver(subscriber);
      return () => { for (const cleanup of cleanups) { try { cleanup(); } catch (error) { report(error); } } };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const snapshot = [...entries.values()];
      entries.clear();
      for (const entry of snapshot) { try { entry.dispose(); } catch (error) { report(error); } }
    }
  };
}
