import {readFileSync} from 'node:fs';
import {isAbsolute, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256Hex, validatePolicy} from './policy.mjs';

export const BUNDLED_STARTER_SHA256 = 'f2821ebf0fa5cd34b346361089edd56bb4ec01a40c59eb969c60f90c7e77d190';
// Companion profiles registered after external qualification (core 0.13.1, Svelte 5.55.3): chat, code and media on
// the shipped managed recipes and default-root consumers of them; maps, graphics and charts on production consumers of
// the shipped native fixtures; auth on the Auth-only production derivative of the reviewed Auth+Charts author app.
export const BUNDLED_PROFILE_SHA256 = Object.freeze({
  chat: '4e958b18f465a2bb65cff36ecf97f76e66a7da3bed83942ef5397f0c9030436f',
  code: '669cd1a15dcba7a7c3e6ebe572888e4611e0e214dd2e607c744076182762e437',
  media: '717854d1add64795bf06a7d8ecf73a768dd8fb717cf706b3846b0e5384b501c3',
  'chat-code-media': 'f1127dc259280482a726bb380f376f1874894b3dd2caa2136a82c71214e63327',
  maps: '6c60262dc74594255ba2d245b4a0b057edc008bb450ff7b4309a975b1d5c760a',
  graphics: '5b66bb6ec3b309fba9f4696f07ac35f5f7b9c86e75520d11d9de966b2fe0f03b',
  charts: '853f929a63217a9667ec64e928dbd8767c15ad49ff82e75e802e4209e4398645',
  auth: 'ab100ba510f5cdc4931bca33e0dc398d21f1382010b51ed44242d30dc6846662'
});
export const BUNDLED_SELECTOR_PREFIX = 'bundled:';
export const POLICIES_DIRECTORY = fileURLToPath(new URL('../policies', import.meta.url));

const SHA256 = /^[0-9a-f]{64}$/;
// Names are plain lowercase slugs, so no selector can spell a path, a prototype member or an empty name.
const BUNDLED_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isPolicyPathContained(targetPath, policiesDir = POLICIES_DIRECTORY) {
  if (typeof targetPath !== 'string' || !isAbsolute(targetPath)) return false;
  const rel = relative(resolve(policiesDir), resolve(targetPath));
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export function bundledEntry(name, relativePath, sha256, baseUrl = import.meta.url) {
  const fullPath = fileURLToPath(new URL(relativePath, baseUrl));
  if (!isPolicyPathContained(fullPath, POLICIES_DIRECTORY)) {
    throw new Error(`Production registered policy must resolve within shipped policies directory: ${name}`);
  }
  return Object.freeze({name, path: fullPath, sha256});
}

// Every registered profile ships its bytes and its embedded pin together. A profile is registered only once it
// has been independently qualified; until then it is not selectable. Auth+Charts, other combinations and all-packages
// profiles are never bundled.
export const BUNDLED_POLICY_REGISTRY = Object.freeze(Object.assign(Object.create(null), {
  starter: bundledEntry('starter', '../policies/starter.json', BUNDLED_STARTER_SHA256),
  chat: bundledEntry('chat', '../policies/chat.json', BUNDLED_PROFILE_SHA256.chat),
  code: bundledEntry('code', '../policies/code.json', BUNDLED_PROFILE_SHA256.code),
  media: bundledEntry('media', '../policies/media.json', BUNDLED_PROFILE_SHA256.media),
  'chat-code-media': bundledEntry('chat-code-media', '../policies/chat-code-media.json', BUNDLED_PROFILE_SHA256['chat-code-media']),
  maps: bundledEntry('maps', '../policies/maps.json', BUNDLED_PROFILE_SHA256.maps),
  graphics: bundledEntry('graphics', '../policies/graphics.json', BUNDLED_PROFILE_SHA256.graphics),
  charts: bundledEntry('charts', '../policies/charts.json', BUNDLED_PROFILE_SHA256.charts),
  auth: bundledEntry('auth', '../policies/auth.json', BUNDLED_PROFILE_SHA256.auth)
}));

export function isBundledPolicySelector(argument) {
  return typeof argument === 'string' && argument.startsWith(BUNDLED_SELECTOR_PREFIX);
}

// Own, frozen, well-formed entries only; anything else is treated as unknown.
export function getBundledPolicyEntry(name, registry = BUNDLED_POLICY_REGISTRY) {
  if (typeof name !== 'string' || !BUNDLED_NAME.test(name)) return null;
  if (registry === null || typeof registry !== 'object' || !Object.isFrozen(registry)) return null;
  const registryDesc = Object.getOwnPropertyDescriptor(registry, name);
  if (!registryDesc || registryDesc.get !== undefined || registryDesc.set !== undefined || !('value' in registryDesc)) {
    return null;
  }
  const entry = registryDesc.value;
  if (entry === null || typeof entry !== 'object' || !Object.isFrozen(entry)) return null;

  const nameDesc = Object.getOwnPropertyDescriptor(entry, 'name');
  if (!nameDesc || nameDesc.get !== undefined || nameDesc.set !== undefined || !('value' in nameDesc)) {
    return null;
  }
  const pathDesc = Object.getOwnPropertyDescriptor(entry, 'path');
  if (!pathDesc || pathDesc.get !== undefined || pathDesc.set !== undefined || !('value' in pathDesc)) {
    return null;
  }
  const shaDesc = Object.getOwnPropertyDescriptor(entry, 'sha256');
  if (!shaDesc || shaDesc.get !== undefined || shaDesc.set !== undefined || !('value' in shaDesc)) {
    return null;
  }

  for (const key of Reflect.ownKeys(entry)) {
    const desc = Object.getOwnPropertyDescriptor(entry, key);
    if (!desc || desc.get !== undefined || desc.set !== undefined || !('value' in desc)) {
      return null;
    }
  }

  const entryName = nameDesc.value;
  const entryPath = pathDesc.value;
  const entrySha256 = shaDesc.value;

  if (entryName !== name || typeof entryPath !== 'string' || !isAbsolute(entryPath)) return null;
  if (typeof entrySha256 !== 'string' || !SHA256.test(entrySha256)) return null;

  if (registry === BUNDLED_POLICY_REGISTRY && !isPolicyPathContained(entryPath, POLICIES_DIRECTORY)) {
    return null;
  }

  return entry;
}

export function resolveBundledPolicySelector(argument, registry = BUNDLED_POLICY_REGISTRY) {
  if (!isBundledPolicySelector(argument)) return null;
  return getBundledPolicyEntry(argument.slice(BUNDLED_SELECTOR_PREFIX.length), registry);
}

const failure = (code, message, sha256 = null) => ({ok: false, sha256, policy: null, errors: [{code, where: '$', message}], source: 'bundled'});

// The pin is checked before the bytes are interpreted.
export function validateBundledPolicyBytes(bytes, {today, expectedSha256 = BUNDLED_STARTER_SHA256} = {}) {
  if (typeof expectedSha256 !== 'string' || !SHA256.test(expectedSha256)) {
    return failure('policy-pin-invalid', 'policy sha256 pin must be 64 lowercase hexadecimal characters');
  }
  let sha = null;
  try {
    sha = sha256Hex(bytes);
  } catch {
    return failure('policy-invalid-bytes', 'policy bytes could not be processed');
  }
  if (sha !== expectedSha256) {
    return failure('policy-pin-mismatch', 'policy bytes do not match the supplied sha256 pin', sha);
  }
  let data;
  try {
    const text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
    data = JSON.parse(text);
  } catch {
    return failure('policy-parse-error', 'policy must be strict UTF-8 JSON without comments or trailing commas', sha);
  }
  const {errors} = validatePolicy(data, {today});
  if (errors.length > 0) {
    return {ok: false, sha256: sha, policy: null, errors, source: 'bundled'};
  }
  return {ok: true, sha256: sha, policy: data, errors: [], source: 'bundled'};
}

export function loadBundledPolicy(name, {today, registry = BUNDLED_POLICY_REGISTRY} = {}) {
  const entry = getBundledPolicyEntry(name, registry);
  if (!entry) return failure('bundled-policy-unknown', 'unknown bundled policy');
  const entryPath = entry.path;
  const expectedSha256 = entry.sha256;
  let bytes;
  try {
    bytes = readFileSync(entryPath);
  } catch {
    return failure('policy-unreadable', 'policy file could not be read');
  }
  return validateBundledPolicyBytes(bytes, {today, expectedSha256});
}

export function loadBundledStarterPolicy({today} = {}) {
  return loadBundledPolicy('starter', {today});
}
