/**
 * Overlay orchestration through the public assembly (fluid-overlays implementation-interface §1–§2): a real
 * ApplicationHost, reducer-owned PresentationState, ModalPrimitive with `motion={useOverlayMotion(...)}`.
 * Claimed transitions skip the spring; completion is delivered exactly once per current obligation; a refused
 * close claims nothing; a reopen during dismissal cancels the old obligation without dispatch.
 */
import { afterEach, beforeEach, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import OverlayApp from './overlay-fixtures/OverlayApp.svelte';
import { overlayDefinition, overlayHooks } from './overlay-fixtures/OverlayModel.js';
import { liveChoreographyLeases } from '../../src/lib/application/renderer/target-registry.js';
import type { RouteHost } from '../../src/lib/application/renderer/choreography/route-host.js';

const cleanups: (() => void)[] = [];
beforeEach(() => { overlayHooks.withPlans = true; overlayHooks.completions = { present: 0, dismiss: 0 }; });
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); overlayHooks.withPlans = false; overlayHooks.twoHeroes = false; });
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const until = async (predicate: () => boolean, frames = 180) => { for (let i = 0; i < frames && !predicate(); i++) await frame(); return predicate(); };
const status = () => overlayHooks.state!().presentation.status;
const opacity = (selector: string) => Number(getComputedStyle(document.querySelector(selector)!).opacity);

function setup() {
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(OverlayApp, { target, props: { definition: overlayDefinition() as never } });
  cleanups.push(() => { unmount(component); target.remove(); });
  flushSync();
  return overlayHooks.host as unknown as Omit<RouteHost, "diagnostics"> & { diagnostics: { type: string; reason?: string; participant?: string; skipped?: string[] }[] };
}


import { tick } from 'svelte';
import { defineChoreography } from '../../src/lib/application/renderer/choreography/plan.js';
import type { OverlayMotionHandle } from '../../src/lib/application/renderer/choreography/overlay-motion.js';
it('review: two unaccepted explicit entries in one flush discard both preparations', async () => {
 const host=setup();await frame();
 const handle=overlayHooks.handle as OverlayMotionHandle;
 const p=defineChoreography({cueMs:0,durationMs:100,tracks:[{participant:handle.select('content'),side:'outgoing',startMs:0,durationMs:100}]});
 const runs=()=> (host as unknown as {localRuns:Map<object,unknown>}).localRuns.size;
 expect(runs()).toBe(0);
 handle.transition(p,()=>{});handle.transition(p,()=>{});await tick();await Promise.resolve();
 expect(runs()).toBe(0);
});
it('review: reversing a default dismissal adopts displayed opacity', async () => {
 setup();await frame();overlayHooks.dispatch!({type:'close'});flushSync();
 for(let i=0;i<6;i++)await frame();
 const before=opacity('[data-modal-content]');expect(before).toBeGreaterThan(0.1);expect(before).toBeLessThan(0.95);
 overlayHooks.dispatch!({type:'open'});flushSync();await Promise.resolve();
 const after=opacity('[data-modal-content]');
 expect(Math.abs(after-before),`before=${before}, after=${after}`).toBeLessThan(0.1);
});
