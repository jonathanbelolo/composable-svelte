// Regression suite: the independent review's counterexamples (media-continuity-astra-evidence/isolated), copied unchanged below this line.
import { afterEach, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import VideoEmbed from '../src/lib/video-embed/VideoEmbed.svelte';
import { mediaVisualProvider, liveMediaResources, type MediaVisualProvider, type MediaRepresentation } from '../src/lib/video-embed/live-media.js';
import { reactiveProps } from './fixtures/reactive-props.svelte.js';

let serial = 0;
const cleanups: Array<() => void> = [];
afterEach(() => { for (const stop of cleanups.splice(0).reverse()) stop(); document.body.innerHTML = ''; });
function video() { const id = `astra${++serial}`; const url = `${location.origin}/tests/fixtures/live-player.html?${id}`; return { url, embedUrl: url, platform: 'vimeo', videoId: id, aspectRatio: '16:9', title: 'Original' }; }
function embed(props: Record<string, unknown>) {
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(VideoEmbed as never, { target, props }); flushSync();
  let active = true; const destroy = () => { if (active) { active = false; unmount(component); target.remove(); } };
  cleanups.push(destroy); return { target, destroy, iframe: () => target.querySelector('iframe')! };
}
function representation(iframe: HTMLIFrameElement, provider: MediaVisualProvider) {
  const controller = new AbortController(), diagnostics: string[] = [];
  const rep = provider.represent(iframe, { document, signal: controller.signal, reducedMotion: false, diagnose: reason => diagnostics.push(reason) }) as MediaRepresentation;
  document.body.append(rep.node); cleanups.push(() => { rep.dispose(); rep.node.remove(); });
  return { rep, diagnostics };
}

it('source with a key but no scope cannot transfer into a scoped destination', () => {
  const v = video(), provider = mediaVisualProvider();
  const source = embed({ video: v, mediaKey: 'hero' }); const iframe = source.iframe();
  const { rep } = representation(iframe, provider); rep.retire?.(); source.destroy();
  const destination = embed({ video: v, mediaKey: 'hero', mediaScope: provider });
  expect(destination.iframe(), 'unscoped source granted scoped player ownership').not.toBe(iframe);
});

it('source scope B cannot transfer when provider A represents it', () => {
  const v = video(), providerA = mediaVisualProvider(), providerB = mediaVisualProvider();
  const source = embed({ video: v, mediaKey: 'hero', mediaScope: providerB }); const iframe = source.iframe();
  const { rep } = representation(iframe, providerA); rep.retire?.(); source.destroy();
  const destination = embed({ video: v, mediaKey: 'hero', mediaScope: providerA });
  expect(destination.iframe(), 'source scope B was ignored').not.toBe(iframe);
});

it('old component cleanup cannot unregister the newly adopted owner', () => {
  const v = video(), provider = mediaVisualProvider();
  const source = embed({ video: v, mediaKey: 'hero', mediaScope: provider }); const iframe = source.iframe();
  const { rep } = representation(iframe, provider); rep.retire?.();
  const destination = embed({ video: v, mediaKey: 'hero', mediaScope: provider });
  expect(destination.iframe()).toBe(iframe);
  expect(liveMediaResources()).toEqual({ registered: 1, retained: 0 });
  source.destroy();
  expect(liveMediaResources(), 'retired owner cleanup released the new registration').toEqual({ registered: 1, retained: 0 });
});

it('a title update during the pre-cue period does not make the connected source unavailable', () => {
  const v = video(), provider = mediaVisualProvider();
  const props = reactiveProps<Record<string, unknown>>({ video: v, playerControl: 'player-api' });
  const source = embed(props), iframe = source.iframe();
  const { rep, diagnostics } = representation(iframe, provider);
  props.video = { ...v, title: 'Updated before cue' }; flushSync();
  expect(iframe.title).toBe('Updated before cue');
  expect(rep.retire?.(), JSON.stringify(diagnostics)).toBeDefined();
  expect(rep.node.contains(iframe)).toBe(true);
});

it('an adopted embed can become invalid then render a valid video again', () => {
  const v = video(), provider = mediaVisualProvider();
  const source = embed({ video: v, mediaKey: 'hero', mediaScope: provider }); const iframe = source.iframe();
  const { rep } = representation(iframe, provider); rep.retire?.(); source.destroy();
  const props = reactiveProps<Record<string, unknown>>({ video: v, mediaKey: 'hero', mediaScope: provider, url: undefined });
  const destination = embed(props); expect(destination.iframe()).toBe(iframe);
  props.video = undefined; props.url = 'https://example.com/not-a-video'; flushSync();
  expect(destination.iframe()).toBeNull();
  props.video = video(); props.url = undefined;
  expect(() => flushSync(), 'returning to a valid video throws after prior adoption').not.toThrow();
  expect(destination.iframe()).not.toBeNull();
  expect(liveMediaResources()).toEqual({ registered: 1, retained: 0 });
});

it('control: ordinary non-adopted embed handles valid → invalid → valid', () => {
  console.log('reviewBrowser=' + navigator.userAgent);
  const props = reactiveProps<Record<string, unknown>>({ video: video(), url: undefined });
  const current = embed(props); expect(current.iframe()).not.toBeNull();
  props.video = undefined; props.url = 'https://example.com/not-a-video'; flushSync();
  expect(current.iframe()).toBeNull();
  props.video = video(); props.url = undefined; flushSync();
  expect(current.iframe()).not.toBeNull();
});

it('control: two consecutive handoffs succeed when cleanup precedes each adoption', () => {
  const v = video(), provider = mediaVisualProvider();
  const source = embed({ video: v, mediaKey: 'hero', mediaScope: provider }); const iframe = source.iframe();
  const first = representation(iframe, provider); first.rep.retire?.(); source.destroy();
  const middle = embed({ video: v, mediaKey: 'hero', mediaScope: provider }); expect(middle.iframe()).toBe(iframe);
  const second = representation(iframe, provider); second.rep.retire?.(); middle.destroy();
  const destination = embed({ video: v, mediaKey: 'hero', mediaScope: provider }); expect(destination.iframe()).toBe(iframe);
  first.rep.dispose(); second.rep.dispose();
  expect(iframe.isConnected).toBe(true);
  expect(liveMediaResources()).toEqual({ registered: 1, retained: 0 });
});

it('control: matching source/destination scope and unchanged config retains at retirement', () => {
  const v = video(), provider = mediaVisualProvider();
  const props = reactiveProps<Record<string, unknown>>({ video: v, mediaKey: 'hero', mediaScope: provider });
  const source = embed(props), iframe = source.iframe();
  props.video = { ...v, title: 'Changed before representation' }; flushSync();
  const { rep } = representation(iframe, provider);
  expect(rep.retire?.()).toBeDefined(); source.destroy();
  const destination = embed({ video: { ...v, title: 'Changed before representation' }, mediaKey: 'hero', mediaScope: provider });
  expect(destination.iframe()).toBe(iframe);
});
