/**
 * Top-level back/forward-cache fixture (production build, static server, no HMR). Records observations only; it
 * dispatches no synthetic events. `history.replaceState` is wrapped solely to count real history writes.
 */
import { mount } from 'svelte';
import ScrollApp from './ScrollApp.svelte';
import { scrollDefinition } from './ScrollModel.js';
import { getApplicationInternal, type ApplicationOwner } from '../../../src/lib/application/instance.svelte.js';

const log = {
  docId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  attachedAt: undefined as number | undefined,
  pageshow: [] as Array<{ persisted: boolean; scrollY: number; writes: number; seam: number }>,
  pagehide: [] as Array<{ persisted: boolean; scrollY: number }>,
  seam: [] as string[],
  writes: 0,
  seamAvailable: undefined as boolean | undefined
};
(window as unknown as { __cache: typeof log }).__cache = log;
const replace = history.replaceState.bind(history);
history.replaceState = (...args: Parameters<History['replaceState']>) => { log.writes++; return replace(...args); };
addEventListener('pageshow', event => log.pageshow.push({ persisted: event.persisted, scrollY: scrollY, writes: log.writes, seam: log.seam.length }));
addEventListener('pagehide', event => log.pagehide.push({ persisted: event.persisted, scrollY: scrollY }));

let subscribed = false;
// Attachment happens in the Host's mount; one frame later the binding and scroll ownership are live.
addEventListener('load', () => requestAnimationFrame(() => { log.attachedAt = performance.now(); }), { once: true });
const url = location.pathname + location.search + location.hash;
mount(ScrollApp, {
  target: document.getElementById('app')!,
  props: {
    url, definition: scrollDefinition(),
    onApp: (app: unknown) => {
      if (subscribed) return;
      subscribed = true;
      const seam = getApplicationInternal(app as ApplicationOwner).scroll;
      log.seamAvailable = seam !== undefined;
      seam?.subscribe(event => log.seam.push(event.type));
    }
  }
});
