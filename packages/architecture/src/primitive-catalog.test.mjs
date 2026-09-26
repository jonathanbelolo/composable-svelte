import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { createValueDomain } from './taint-values.mjs';
import { createAuthorityValues } from './authority-values.mjs';
import { classifyPrimitive } from './primitive-catalog.mjs';

describe('classifyPrimitive', () => {
  const setup = () => {
    const domain = createValueDomain();
    const authority = createAuthorityValues(domain);
    return { domain, authority };
  };

  it('free/global identity vs shadow heap and opaque external', () => {
    const { domain, authority } = setup();
    const globalFetch = authority.global('fetch');
    assert.deepEqual(classifyPrimitive(globalFetch, { domain, authority }), [
      { kind: 'resource', name: 'fetch' }
    ]);

    const heap = domain.allocate('shadow-obj');
    domain.write(heap, 'fetch', globalFetch);
    assert.deepEqual(classifyPrimitive(heap, { domain, authority }), []);

    const ext = authority.external('some-lib', 'fetch');
    assert.deepEqual(classifyPrimitive(ext, { domain, authority }), []);
  });

  it('dotted resource', () => {
    const { domain, authority } = setup();
    const localStorage = authority.global('localStorage');
    const setItem = authority.member(localStorage, 'setItem');
    assert.deepEqual(classifyPrimitive(setItem, { domain, authority }), [
      { kind: 'resource', name: 'localStorage.setItem' }
    ]);

    const nav = authority.authority('navigator');
    const sendBeacon = authority.member(nav, 'sendBeacon');
    assert.deepEqual(classifyPrimitive(sendBeacon, { domain, authority }), [
      { kind: 'resource', name: 'navigator.sendBeacon' }
    ]);
  });

  it('method wrappers (.bind, .call)', () => {
    const { domain, authority } = setup();
    const rAF = authority.global('requestAnimationFrame');
    const boundRAF = authority.member(rAF, 'bind');
    const calledRAF = authority.member(boundRAF, 'call');
    assert.deepEqual(classifyPrimitive(calledRAF, { domain, authority }), [
      { kind: 'frame', name: 'requestAnimationFrame' }
    ]);

    const fetchGlobal = authority.global('fetch');
    const boundFetch = authority.member(fetchGlobal, 'bind');
    assert.deepEqual(classifyPrimitive(boundFetch, { domain, authority }), [
      { kind: 'resource', name: 'fetch' }
    ]);
  });

  it('matching mutation names on domain object produce no hit', () => {
    const { domain, authority } = setup();
    const heap = domain.allocate('domain-model');
    domain.write(heap, 'animate', domain.empty());
    domain.write(heap, 'pushState', domain.empty());
    assert.deepEqual(classifyPrimitive(heap, { domain, authority }), []);
  });

  it('Date now vs Date', () => {
    const { domain, authority } = setup();
    const dateGlobal = authority.global('Date');
    assert.deepEqual(classifyPrimitive(dateGlobal, { domain, authority }), []);

    const dateNow = authority.member(dateGlobal, 'now');
    assert.deepEqual(classifyPrimitive(dateNow, { domain, authority }), [
      { kind: 'clock', name: 'Date.now' }
    ]);
  });

  it('pure math/easing no hit, random hits', () => {
    const { domain, authority } = setup();
    const mathGlobal = authority.global('Math');
    const mathSin = authority.member(mathGlobal, 'sin');
    assert.deepEqual(classifyPrimitive(mathSin, { domain, authority }), []);

    const mathRandom = authority.member(mathGlobal, 'random');
    assert.deepEqual(classifyPrimitive(mathRandom, { domain, authority }), [
      { kind: 'random', name: 'Math.random' }
    ]);

    const cryptoGlobal = authority.global('crypto');
    const getRandomValues = authority.member(cryptoGlobal, 'getRandomValues');
    assert.deepEqual(classifyPrimitive(getRandomValues, { domain, authority }), [
      { kind: 'random', name: 'crypto.getRandomValues' }
    ]);
  });

  it('browser/location reads classify as browser for zone detectors', () => {
    const { domain, authority } = setup();
    const win = authority.authority('window');
    assert.deepEqual(classifyPrimitive(win, { domain, authority }), [
      { kind: 'browser', name: 'window' }
    ]);

    const loc = authority.member(win, 'location');
    assert.deepEqual(classifyPrimitive(loc, { domain, authority }), [
      { kind: 'browser', name: 'location' }
    ]);

    const hist = authority.authority('history');
    const pushState = authority.member(hist, 'pushState');
    assert.deepEqual(classifyPrimitive(pushState, { domain, authority }), [
      { kind: 'browser', name: 'history.pushState' }
    ]);
  });

  it('WebAnimation different from ordinary local animate', () => {
    const { domain, authority } = setup();
    const el = authority.authority('element');
    const elAnimate = authority.member(el, 'animate');
    assert.deepEqual(classifyPrimitive(elAnimate, { domain, authority }), [
      { kind: 'web-animation', name: 'element.animate' }
    ]);

    const doc = authority.authority('document');
    const docGetAnimations = authority.member(doc, 'getAnimations');
    assert.deepEqual(classifyPrimitive(docGetAnimations, { domain, authority }), [
      { kind: 'web-animation', name: 'document.getAnimations' }
    ]);

    const globalAnim = authority.global('Animation');
    assert.deepEqual(classifyPrimitive(globalAnim, { domain, authority }), [
      { kind: 'web-animation', name: 'Animation' }
    ]);

    const localObj = domain.allocate('local-animator');
    const localAnimate = domain.read(localObj, 'animate');
    assert.deepEqual(classifyPrimitive(localAnimate, { domain, authority }), []);
  });

  it('stable dedup and ordering', () => {
    const { domain, authority } = setup();
    const win = authority.authority('window');
    const fetch1 = authority.global('fetch');
    const fetch2 = authority.member(fetch1, 'bind');
    const joined = domain.join(win, fetch1, fetch2, win);
    assert.deepEqual(classifyPrimitive(joined, { domain, authority }), [
      { kind: 'browser', name: 'window' },
      { kind: 'resource', name: 'fetch' }
    ]);
  });
});

// Malformed analysis input must not look like a clean application.
test('invalid value input refuses classification', () => {
 const domain=createValueDomain();const authority=createAuthorityValues(domain);
 assert.throws(()=>classifyPrimitive(new Set(['unknown']),{domain,authority}),TypeError);
 assert.throws(()=>classifyPrimitive([], {domain,authority}),TypeError);
 assert.throws(()=>classifyPrimitive(new Set()),TypeError);
});
