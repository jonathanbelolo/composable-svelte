// Identity-based browser/framework member semantics. Lexical binding and execution
// zones belong to the analyzer; this module never identifies a name in source text.
import {lookupAnchor} from './anchors.mjs';

export const RESOURCE_GLOBALS = Object.freeze([
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker',
  'BroadcastChannel', 'localStorage', 'sessionStorage', 'indexedDB', 'caches',
  'Notification', 'setTimeout', 'setInterval', 'requestIdleCallback'
]);
export const FRAME_GLOBALS = Object.freeze(['requestAnimationFrame', 'cancelAnimationFrame']);
const browser = new Map([
  ...['window', 'globalThis', 'self', 'top', 'parent', 'frames'].map((name) => [name, 'window']),
  ...['document', 'history', 'location', 'navigation', 'navigator'].map((name) => [name, name])
]);
const otherGlobals = new Set([...RESOURCE_GLOBALS, ...FRAME_GLOBALS, 'Animation', 'KeyframeEffect', 'Date', 'Math', 'performance', 'crypto', 'Object', 'Reflect', 'Proxy', 'Function', 'eval', 'console', 'JSON', 'String', 'Boolean']);
const windowSelf = new Set(['window', 'self', 'top', 'parent', 'frames', 'globalThis']);
const navigatorResources = new Set(['sendBeacon', 'storage', 'clipboard', 'geolocation', 'mediaDevices', 'serviceWorker']);
const documentElements = new Set(['documentElement', 'body', 'head']);
const getters = new Set(['querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName', 'getElementsByTagName', 'getElementsByName', 'getElementsByTagNameNS']);
const controlMethods = new Set(['call', 'apply', 'bind']);

export function createAuthorityValues(domain) {
  const a = (kind, id) => domain.atom(kind, id);
  const authority = (name) => a('authority', name);
  const external = (specifier, name, path = []) => a('external', JSON.stringify([specifier, name, path]));
  const unknown = (atom) => {const info = domain.describe(atom); return info.kind === 'unknown-member' ? new Set([atom]) : a('unknown-member', JSON.stringify([info.kind, info.id]));};
  const method = (receiver, name) => a('method', JSON.stringify([receiver, name]));
  function global(name) {
    if (browser.has(name)) return authority(browser.get(name));
    if (name === 'addEventListener' || name === 'removeEventListener') return member(authority('window'), name);
    return otherGlobals.has(name) ? a('global', name) : domain.empty();
  }
  function project(atom, name) {
    if (typeof name !== 'string') throw new TypeError('Member name must be a literal string or explicit wildcard.');
    let result = domain.empty();
    const add = (next) => { result = domain.join(result, next); };
    {
      const info = domain.describe(atom);
      if (info.kind === 'unknown-member') return new Set([atom]);
      if (name === '*' && !(info.kind === 'authority' && info.id === 'element-collection')) return unknown(atom);
      if (info.kind === 'authority') {
        if (info.id === 'window') {
          if (windowSelf.has(name)) add(authority('window'));
          else if (browser.has(name)) add(authority(browser.get(name)));
          else if (otherGlobals.has(name)) add(a('global', name));
          else if (name === 'addEventListener' || name === 'removeEventListener') add(method(atom, name));
        } else if (info.id === 'document') {
          if (name === 'defaultView') add(authority('window'));
          else if (name === 'location') add(authority('location'));
          else if (documentElements.has(name)) add(authority('element'));
          else if (getters.has(name) || ['getAnimations', 'startViewTransition', 'addEventListener', 'removeEventListener'].includes(name)) add(method(atom, name));
        } else if (info.id === 'navigator') {
          if (navigatorResources.has(name)) add(a('global', `navigator.${name}`));
        } else if (info.id === 'element-collection') {
          if (name === '*' || /^\d+$/.test(name)) add(authority('element'));
          else if (['item', 'namedItem', 'forEach', 'entries', 'values', 'keys'].includes(name)) add(method(atom, name));
        } else if (info.id === 'element') {
          if (name === 'ownerDocument') add(authority('document'));
          else if (['parentElement', 'parentNode', 'offsetParent', 'firstElementChild', 'lastElementChild', 'nextElementSibling', 'previousElementSibling'].includes(name)) add(authority('element'));
          else if (['children', 'childNodes'].includes(name)) add(authority('element-collection'));
          else if (['animate', 'getAnimations', 'closest', 'getRootNode', 'addEventListener', 'removeEventListener', ...getters].includes(name)) add(method(atom, name));
          // style/data/text projections carry no ownership authority.
        } else if (info.id === 'app') {
          if (name === 'store') add(authority('store'));
        } else if (['store', 'view', 'legacy-view'].includes(info.id)) {
          if (name === 'dispatch') add(a('dispatch', info.id));
          else if (info.id !== 'legacy-view' && (name === 'subscribe' || name === 'subscribeToActions')) add(method(atom, name));
          // state and select results are application data, not store handles.
        } else if (info.id === 'views') {
          add(authority('feature-handle'));
        } else if (['builder', 'composition', 'destination', 'slot', 'scope-builder'].includes(info.id)) {
          if (name === 'reducer' && ['composition', 'destination'].includes(info.id)) add(authority('reducer'));
          else add(method(atom, name));
        } else if (['history', 'location', 'navigation'].includes(info.id)) {
          if (!['state', 'length', 'href', 'hash', 'pathname', 'search', 'host', 'hostname', 'port', 'protocol', 'origin'].includes(name)) add(method(atom, name));
        }
      } else if (info.kind === 'external') {
        const [specifier, imported, path = []] = JSON.parse(info.id);
        if (controlMethods.has(name) && imported !== '*') add(method(atom, name));
        else if (imported === '*' && path.length === 0) add(external(specifier, name));
        else if (path.length < 2) add(external(specifier, imported, [...path, name]));
        else add(unknown(atom));
      } else if (info.kind === 'global') {
        if (controlMethods.has(name)) add(method(atom, name));
        else if (info.id.split('.').length < 3) add(a('global', `${info.id}.${name}`));
        else add(unknown(atom));
      } else if (['method', 'function', 'dispatch'].includes(info.kind) && controlMethods.has(name)) {
        let depth = 0; let base = atom;
        while (domain.describe(base).kind === 'method') {depth++; base = JSON.parse(domain.describe(base).id)[0];}
        if (depth >= 3) add(unknown(atom));
        else add(method(atom, name));
      }
    }
    return result;
  }
  function member(value, name) {
    return domain.read(value, name, project);
  }
  function externalParts(atom) {
    const info = domain.describe(atom);
    if (info.kind !== 'external') return null;
    const [specifier, imported, path = []] = JSON.parse(info.id);
    return {specifier, imported, path};
  }
  function anchor(atom) {
    const info = domain.describe(atom);
    if (info.kind !== 'external') return null;
    const parts = externalParts(atom);
    let found = lookupAnchor(parts.specifier, parts.imported);
    for (const member of parts.path) {
      if (!found?.members || !Object.hasOwn(found.members, member)) return null;
      found = found.members[member];
    }
    return found;
  }
  function methodParts(atom) {
    const info = domain.describe(atom);
    return info.kind === 'method' ? JSON.parse(info.id) : null;
  }
  return {authority, external, externalParts, global, member, project, anchor, methodParts};
}
