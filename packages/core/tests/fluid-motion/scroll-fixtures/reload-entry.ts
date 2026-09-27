/** New-document fixture: every load (including real reloads) mounts the routed app at the current URL. */
import { mount } from 'svelte';
import ScrollApp from './ScrollApp.svelte';
import { scrollDefinition } from './ScrollModel.js';

const url = location.pathname + location.search + location.hash;
const target = document.getElementById('app')!;
const record = { app: undefined as unknown, attachedAt: undefined as number | undefined, loadScrollY: window.scrollY };
(window as unknown as { __scrollFixture: typeof record }).__scrollFixture = record;
mount(ScrollApp, { target, props: { url, definition: scrollDefinition(), onApp: (app: unknown) => { record.app = app; } } });
queueMicrotask(() => requestAnimationFrame(() => { record.attachedAt = performance.now(); }));
