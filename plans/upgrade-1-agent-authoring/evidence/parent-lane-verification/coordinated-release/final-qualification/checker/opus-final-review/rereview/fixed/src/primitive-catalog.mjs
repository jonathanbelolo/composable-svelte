import { RESOURCE_GLOBALS, FRAME_GLOBALS } from './authority-values.mjs';

const BROWSER_AUTHORITIES = new Set([
  'window', 'document', 'history', 'location', 'navigation', 'navigator', 'element', 'element-collection'
]);

const RESOURCE_CATALOG = new Set([
  ...RESOURCE_GLOBALS,
  'navigator.sendBeacon', 'navigator.storage', 'navigator.clipboard',
  'navigator.geolocation', 'navigator.mediaDevices', 'navigator.serviceWorker'
]);

const FRAME_CATALOG = new Set(FRAME_GLOBALS);
const CLOCK_CATALOG = ['Date.now', 'performance.now'];
const CODE_STRING_CATALOG = ['eval', 'Function'];
const ANIMATION_GLOBALS = ['Animation', 'KeyframeEffect'];
const REFLECTION_GLOBALS = ['Reflect', 'Object.getOwnPropertyDescriptor', 'Object.getOwnPropertyDescriptors'];
const CONTROL_METHODS = new Set(['call', 'apply', 'bind']);
const IGNORED_KINDS = new Set(['heap', 'state', 'function', 'dispatch', 'external']);

const hasPrefix = (id, prefix) => id === prefix || id.startsWith(prefix + '.');
const matchesAny = (id, list) => {
  for (const prefix of list) if (hasPrefix(id, prefix)) return true;
  return false;
};

function unwrap(atom, authority) {
  const visited = new Set();
  let cur = atom;
  while (cur && !visited.has(cur)) {
    visited.add(cur);
    const parts = authority?.methodParts ? authority.methodParts(cur) : null;
    if (!parts) break;
    const [receiver, name] = parts;
    if (CONTROL_METHODS.has(name)) cur = receiver;
    else break;
  }
  return cur;
}

function classifyAtom(rawAtom, { domain, authority }) {
  let info;
  try { info = domain.describe(rawAtom); } catch { return null; }
  if (!info || IGNORED_KINDS.has(info.kind)) return null;

  const target = unwrap(rawAtom, authority);
  let targetInfo = target === rawAtom ? info : null;
  if (!targetInfo) {
    try { targetInfo = domain.describe(target); } catch { return null; }
  }
  if (!targetInfo || IGNORED_KINDS.has(targetInfo.kind)) return null;

  if (targetInfo.kind === 'authority') {
    return BROWSER_AUTHORITIES.has(targetInfo.id) ? { kind: 'browser', name: targetInfo.id } : null;
  }

  if (targetInfo.kind === 'method') {
    const parts = authority?.methodParts ? authority.methodParts(target) : null;
    if (!parts) return null;
    const [recv, methodName] = parts;
    let recvInfo;
    try { recvInfo = domain.describe(recv); } catch { return null; }
    if (recvInfo?.kind === 'authority' && BROWSER_AUTHORITIES.has(recvInfo.id)) {
      if (recvInfo.id === 'element' && (methodName === 'animate' || methodName === 'getAnimations')) {
        return { kind: 'web-animation', name: `element.${methodName}` };
      }
      if (recvInfo.id === 'document' && (methodName === 'getAnimations' || methodName === 'startViewTransition')) {
        return { kind: 'web-animation', name: `document.${methodName}` };
      }
      return { kind: 'browser', name: `${recvInfo.id}.${methodName}` };
    }
    return null;
  }

  if (targetInfo.kind === 'global') {
    const id = targetInfo.id;
    if (matchesAny(id, FRAME_CATALOG)) return { kind: 'frame', name: id };
    if (matchesAny(id, CLOCK_CATALOG)) return { kind: 'clock', name: id };
    if (hasPrefix(id, 'Math.random') || hasPrefix(id, 'crypto')) return { kind: 'random', name: id };
    if (matchesAny(id, CODE_STRING_CATALOG)) return { kind: 'code-string', name: id };
    if (matchesAny(id, REFLECTION_GLOBALS)) return { kind: 'reflection', name: id };
    if (matchesAny(id, ANIMATION_GLOBALS)) return { kind: 'web-animation', name: id };
    if (matchesAny(id, RESOURCE_CATALOG)) return { kind: 'resource', name: id };
  }
  return null;
}

export function classifyPrimitive(value, { domain, authority } = {}) {
  if (!domain || !authority) throw new TypeError('Primitive classification requires a value domain and authority semantics.');
  domain.join(value); // Unknown or malformed value atoms cannot silently look clean.
  const map = new Map();
  for (const atom of value) {
    const res = classifyAtom(atom, { domain, authority });
    if (res) {
      const key = `${res.kind}\0${res.name}`;
      if (!map.has(key)) map.set(key, res);
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)
  );
}
