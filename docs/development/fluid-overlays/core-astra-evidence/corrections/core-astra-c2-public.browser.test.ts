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
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); overlayHooks.withPlans = false; overlayHooks.twoHeroes = false; overlayHooks.media = false; overlayHooks.conditional = false; overlayHooks.catalog = false; overlayHooks.noHero = false; overlayHooks.local = false; overlayHooks.video = false; });
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

for(const defer of [false,true]) it(`correction review: direct bindable destructive update after mounted flush; framework subscriptions ready=${defer}`,async()=>{
 overlayHooks.local=true;const host=setup();if(defer)await frame();
 const before=document.querySelector<HTMLElement>('[data-card]')!.getBoundingClientRect();
 overlayHooks.setLocal!('presenting',true);flushSync();await Promise.resolve();
 expect(document.querySelector('[data-card]')).toBeNull();
 const flight=document.querySelector<HTMLElement>('[data-route-representation="card"]');
 console.log('[astra-c2]',JSON.stringify({defer,diagnostics:host.diagnostics}));expect(flight).not.toBeNull();expect(host.diagnostics.some(e=>e.type==='prepared'&&(e.skipped??[]).includes('card:missingSource'))).toBe(false);
});
