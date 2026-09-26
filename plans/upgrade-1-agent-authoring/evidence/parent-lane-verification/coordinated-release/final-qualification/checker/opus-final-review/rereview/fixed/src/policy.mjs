// Consumer-architecture policy substrate (development-only).
// Strict versioned policy parsing, an external sha256 pin and deterministic fail-closed errors.
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, realpathSync, statSync} from 'node:fs';
import {isAbsolute, join, relative, sep} from 'node:path';
import ts from 'typescript';
import {compareVersions, isVersion} from './version.mjs';

// compareVersions is re-exported for the existing check entry; new code should import ./version.mjs directly.
export {compareVersions};
export const POLICY_SCHEMA = 'composable-svelte/consumer-architecture-policy';
export const POLICY_SCHEMA_VERSION = 2;
// A policy states the rule catalog it was authored for; this checker evaluates exactly one catalog.
export const CATALOG_VERSION = 2;
// The core line this checker was qualified against. A policy may narrow the range but never widen it.
export const CHECKER_KNOWN_CORE = Object.freeze({min: '0.13.0-next.1', maxExclusive: '0.14.0-0'});
export const MAX_EXCEPTION_DAYS = 180;

// Only `active` catalog rules may be enabled. `staged` rules are catalog-only in this
// slice: they have no evaluator, emit no diagnostics and never count as enforced.
export const RULE_CATALOG = Object.freeze([
  Object.freeze({id: 'routing/no-manual-browser-authority', stage: 'active', required: true}),
  Object.freeze({id: 'presentation/no-subscription-orchestration', stage: 'active', required: true}),
  Object.freeze({id: 'reducers/pure-decisions', stage: 'active', required: true}),
  Object.freeze({id: 'resources/no-unowned-infrastructure', stage: 'active', required: true}),
  Object.freeze({id: 'motion/no-competing-playback', stage: 'active', required: true}),
  Object.freeze({id: 'presentation/no-fabricated-view', stage: 'staged', required: false}),
  Object.freeze({id: 'adapters/least-authority', stage: 'staged', required: false})
]);
export const CAPABILITY_CATALOG = Object.freeze(['browser-history', 'focus', 'motion-driver', 'resource-scope', 'business-client']);
export const INACTIVE_REASONS = Object.freeze(['supported-replacement-pending']);
// One spelling per provenance: a second spelling would give byte-different policies, and so different pins, for the same approval.
export const APPROVED_PROVENANCES = Object.freeze(['registry', 'pinned-tarball']);

const TOP_KEYS = ['schema', 'schemaVersion', 'catalogVersion', 'policyId', 'policyVersion', 'supportedCore', 'project', 'rules', 'capabilityGrants', 'qualificationRecords', 'exceptions', 'opaquePackages'];
const EXCEPTION_KEYS = ['id', 'rule', 'path', 'reason', 'reviewedBy', 'reviewedOn', 'expires'];
const SHA256 = /^[0-9a-f]{64}$/;
// Bounded npm package-name grammar: an optional lowercase @scope/ and one lowercase name. Segments start with a letter or digit,
// so empty, dot and dot-dot segments, extra slashes, percent-encoding and uppercase never name an approval.
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*[/])?[a-z0-9][a-z0-9._-]*$/;
const MAX_PACKAGE_NAME_LENGTH = 214;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const GLOB_CHARACTERS = ['*', '?', '[', ']', '{', '}'];
const BACKSLASH = String.fromCharCode(92);
const CORE_MANIFEST = 'node_modules/@composable-svelte/core/package.json';

const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

function sortErrors(errors) {
  return [...errors].sort((left, right) => compareText(left.where, right.where) || compareText(left.code, right.code) || compareText(left.message, right.message));
}

function fail(errors, code, where, message) {
  errors.push({code, where, message});
  return false;
}

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

// Exact release or prerelease identity. Build metadata is refused: `1.0.0+a` and `1.0.0+b` would be two spellings of one version.
export function isExactVersion(value) {
  return isVersion(value) && !value.includes('+');
}

/** @deprecated Compatibility alias for the existing check entry; import isVersion from ./version.mjs instead. */
export const isPlainVersion = isVersion;

// Half-open SemVer range test: min <= version < maxExclusive.
function inRange(version, {min, maxExclusive}) {
  return compareVersions(version, min) >= 0 && compareVersions(version, maxExclusive) < 0;
}

// Day number of a strict UTC calendar date, or NaN when the text is not a real date.
export function dayNumber(text) {
  if (typeof text !== 'string' || !DATE.test(text)) return Number.NaN;
  const time = Date.parse(`${text}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== text) return Number.NaN;
  return time / 86400000;
}

export function isInside(child, parent) {
  const path = relative(parent, child);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

// Paths are rejected rather than normalized, so a directory or glob can never be a grant.
export function relativePathProblem(value) {
  if (typeof value !== 'string' || value === '') return 'must be a nonempty string';
  if (value !== value.normalize('NFC')) return 'must be NFC-normalized';
  if (value.includes(BACKSLASH)) return 'must not contain a backslash';
  if (value.startsWith('/') || value.endsWith('/')) return 'must not start or end with a slash';
  if (GLOB_CHARACTERS.some((character) => value.includes(character))) return 'must not contain glob characters';
  if (value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) return 'must not contain empty, dot or dot-dot segments';
  return undefined;
}

function isObject(value, where, keys, errors) {
  if (value === undefined) return false;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail(errors, 'policy-invalid-value', where, 'expected an object');
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail(errors, 'policy-unknown-field', `${where}.${key}`, 'unknown field');
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) fail(errors, 'policy-missing-field', `${where}.${key}`, 'required field is missing');
  }
  return true;
}

function isText(value, where, errors, pattern) {
  if (value === undefined) return false;
  if (typeof value !== 'string' || value === '') return fail(errors, 'policy-invalid-value', where, 'expected a nonempty string');
  if (pattern && !pattern.test(value)) return fail(errors, 'policy-invalid-value', where, `expected text matching ${pattern.source}`);
  return true;
}

function isList(value, where, errors) {
  if (value === undefined) return false;
  if (!Array.isArray(value)) return fail(errors, 'policy-invalid-value', where, 'expected an array');
  return true;
}

function isPath(value, where, errors) {
  if (value === undefined) return false;
  const problem = relativePathProblem(value);
  if (problem) return fail(errors, 'policy-invalid-path', where, `exact project-relative file path ${problem}`);
  return true;
}

function isVersionText(value, where, errors) {
  if (value === undefined) return false;
  if (!isExactVersion(value)) return fail(errors, 'policy-invalid-value', where, 'expected an exact SemVer release or prerelease such as 0.13.0-next.1, without build metadata');
  return true;
}

function noteDuplicates(values, where, label, errors) {
  const seen = new Set();
  values.forEach((value, index) => {
    if (typeof value !== 'string') return;
    if (seen.has(value)) fail(errors, 'policy-duplicate-entry', `${where}[${index}]`, `duplicate ${label}: ${value}`);
    seen.add(value);
  });
}

// JSON.parse silently keeps the last duplicate key, so duplicates are found on the syntax tree.
function duplicateKeys(text) {
  const found = [];
  const visit = (node, where) => {
    if (ts.isObjectLiteralExpression(node)) {
      const seen = new Set();
      for (const property of node.properties) {
        const key = property.name && 'text' in property.name ? property.name.text : '';
        if (seen.has(key)) found.push(`${where}.${key}`);
        seen.add(key);
        if (ts.isPropertyAssignment(property)) visit(property.initializer, `${where}.${key}`);
      }
    } else if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((element, index) => visit(element, `${where}[${index}]`));
    }
  };
  const [statement] = ts.parseJsonText('policy.json', text).statements;
  if (statement) visit(statement.expression, '$');
  return found;
}

// A policy may narrow the checker's known core range but never widen it past the pairing the checker was qualified for.
function validateSupportedCore(value, errors) {
  if (!isObject(value, '$.supportedCore', ['min', 'maxExclusive'], errors)) return;
  const min = isVersionText(value.min, '$.supportedCore.min', errors);
  const max = isVersionText(value.maxExclusive, '$.supportedCore.maxExclusive', errors);
  if (!min || !max) return;
  if (compareVersions(value.min, value.maxExclusive) >= 0) fail(errors, 'policy-invalid-value', '$.supportedCore', 'min must be lower than maxExclusive');
  else if (compareVersions(value.min, CHECKER_KNOWN_CORE.min) < 0 || compareVersions(value.maxExclusive, CHECKER_KNOWN_CORE.maxExclusive) > 0) {
    fail(errors, 'policy-core-outside-checker-range', '$.supportedCore', `supportedCore must lie inside the checker's known core range ${CHECKER_KNOWN_CORE.min} <= version < ${CHECKER_KNOWN_CORE.maxExclusive}`);
  }
}

function validateProject(value, errors) {
  if (!isObject(value, '$.project', ['tsconfig', 'roots'], errors)) return;
  isPath(value.tsconfig, '$.project.tsconfig', errors);
  if (!isList(value.roots, '$.project.roots', errors)) return;
  if (value.roots.length === 0) fail(errors, 'policy-empty-roots', '$.project.roots', 'at least one exact root file is required');
  value.roots.forEach((root, index) => isPath(root, `$.project.roots[${index}]`, errors));
  noteDuplicates(value.roots, '$.project.roots', 'root', errors);
}

// Every catalog rule must be accounted for exactly once across `active` and `inactive`.
function validateRules(rules, errors) {
  const activeIds = [];
  if (!isObject(rules, '$.rules', ['active', 'inactive'], errors)) return activeIds;
  const listed = [];
  if (isList(rules.active, '$.rules.active', errors)) {
    rules.active.forEach((entry, index) => {
      const where = `$.rules.active[${index}]`;
      if (!isObject(entry, where, ['id', 'severity'], errors)) return;
      if (entry.severity !== undefined && entry.severity !== 'error') fail(errors, 'policy-invalid-value', `${where}.severity`, 'severity must be error');
      if (isText(entry.id, `${where}.id`, errors)) listed.push({id: entry.id, list: 'active', where});
    });
  }
  if (isList(rules.inactive, '$.rules.inactive', errors)) {
    rules.inactive.forEach((entry, index) => {
      const where = `$.rules.inactive[${index}]`;
      if (!isObject(entry, where, ['id', 'reason', 'detail'], errors)) return;
      if (entry.reason !== undefined && !INACTIVE_REASONS.includes(entry.reason)) fail(errors, 'policy-invalid-value', `${where}.reason`, `reason must be one of: ${INACTIVE_REASONS.join(', ')}`);
      isText(entry.detail, `${where}.detail`, errors);
      if (isText(entry.id, `${where}.id`, errors)) listed.push({id: entry.id, list: 'inactive', where});
    });
  }
  const seen = new Set();
  for (const entry of listed) {
    const known = RULE_CATALOG.find((rule) => rule.id === entry.id);
    if (seen.has(entry.id)) fail(errors, 'policy-duplicate-entry', entry.where, `rule is listed more than once: ${entry.id}`);
    seen.add(entry.id);
    if (!known) fail(errors, 'unknown-rule', entry.where, `rule is not in the catalog: ${entry.id}`);
    else if (entry.list === 'active' && known.stage !== 'active') fail(errors, 'rule-not-activatable', entry.where, `staged rule has no evaluator and cannot be activated: ${entry.id}`);
    else if (entry.list === 'inactive' && known.required) fail(errors, 'required-rule-disabled', entry.where, `required rule cannot be inactive: ${entry.id}`);
    else if (entry.list === 'active') activeIds.push(entry.id);
  }
  for (const rule of RULE_CATALOG) {
    if (!seen.has(rule.id)) fail(errors, 'catalog-rule-unaccounted', '$.rules', `catalog rule is neither active nor inactive: ${rule.id}`);
  }
  return activeIds;
}

function validateGrants(data, errors) {
  const records = Array.isArray(data.qualificationRecords) ? data.qualificationRecords : [];
  const recordIds = records.map((record) => record?.id).filter((id) => typeof id === 'string');
  if (isList(data.qualificationRecords, '$.qualificationRecords', errors)) {
    records.forEach((record, index) => {
      const where = `$.qualificationRecords[${index}]`;
      if (!isObject(record, where, ['id', 'file', 'sha256'], errors)) return;
      isText(record.id, `${where}.id`, errors);
      isPath(record.file, `${where}.file`, errors);
      isText(record.sha256, `${where}.sha256`, errors, SHA256);
    });
    noteDuplicates(records.map((record) => record?.id), '$.qualificationRecords', 'qualification record id', errors);
  }
  if (!isList(data.capabilityGrants, '$.capabilityGrants', errors)) return;
  // Entries stay schema-checked so the field survives for a later upgrade, but no grant can be honoured: this checker version has no extension point to register against.
  if (data.capabilityGrants.length > 0) {
    fail(errors, 'grants-unsupported-in-checker', '$.capabilityGrants', 'capability grants are not supported by this checker version: no extension point exists to register a grant');
  }
  data.capabilityGrants.forEach((grant, index) => {
    const where = `$.capabilityGrants[${index}]`;
    if (!isObject(grant, where, ['path', 'capability', 'qualificationRecord'], errors)) return;
    isPath(grant.path, `${where}.path`, errors);
    if (isText(grant.capability, `${where}.capability`, errors) && !CAPABILITY_CATALOG.includes(grant.capability)) {
      fail(errors, 'unknown-capability', `${where}.capability`, `capability is not in the catalog: ${grant.capability}`);
    }
    if (isText(grant.qualificationRecord, `${where}.qualificationRecord`, errors) && !recordIds.includes(grant.qualificationRecord)) {
      fail(errors, 'grant-record-unknown', `${where}.qualificationRecord`, `grant names an undeclared qualification record: ${grant.qualificationRecord}`);
    }
  });
  noteDuplicates(data.capabilityGrants.map((grant) => grant?.path), '$.capabilityGrants', 'grant path', errors);
}

function validateExceptions(list, activeIds, today, errors) {
  if (!isList(list, '$.exceptions', errors)) return;
  list.forEach((exception, index) => {
    const where = `$.exceptions[${index}]`;
    if (!isObject(exception, where, EXCEPTION_KEYS, errors)) return;
    for (const key of ['id', 'reason', 'reviewedBy']) isText(exception[key], `${where}.${key}`, errors);
    isPath(exception.path, `${where}.path`, errors);
    if (isText(exception.rule, `${where}.rule`, errors) && !activeIds.includes(exception.rule)) {
      fail(errors, 'exception-rule-inactive', `${where}.rule`, `exceptions may only name an active rule: ${exception.rule}`);
    }
    const datesPresent = [isText(exception.reviewedOn, `${where}.reviewedOn`, errors, DATE), isText(exception.expires, `${where}.expires`, errors, DATE)];
    if (datesPresent.includes(false)) return;
    const reviewed = dayNumber(exception.reviewedOn);
    const expires = dayNumber(exception.expires);
    if (Number.isNaN(reviewed) || Number.isNaN(expires)) fail(errors, 'exception-invalid-dates', where, 'reviewedOn and expires must be real calendar dates');
    else if (reviewed > today) fail(errors, 'exception-invalid-dates', where, 'reviewedOn must not be in the future');
    else if (expires <= today) fail(errors, 'exception-expired', where, 'exception has expired');
    else if (expires - reviewed > MAX_EXCEPTION_DAYS) fail(errors, 'exception-invalid-dates', where, `exception lifetime must not exceed ${MAX_EXCEPTION_DAYS} days`);
  });
  noteDuplicates(list.map((exception) => exception?.id), '$.exceptions', 'exception id', errors);
  const pairs = list.map((exception) => (typeof exception?.rule === 'string' && typeof exception?.path === 'string' ? `${exception.rule} ${exception.path}` : undefined));
  noteDuplicates(pairs, '$.exceptions', 'exception rule and path', errors);
}

function validateOpaquePackages(list, errors) {
  if (!isList(list, '$.opaquePackages', errors)) return;
  list.forEach((entry, index) => {
    const where = `$.opaquePackages[${index}]`;
    const isTarball = entry?.provenance === 'pinned-tarball';
    const keys = isTarball ? ['name', 'version', 'provenance', 'sha256'] : ['name', 'version', 'provenance'];
    if (!isObject(entry, where, keys, errors)) return;
    if (isText(entry.name, `${where}.name`, errors) && (entry.name.length > MAX_PACKAGE_NAME_LENGTH || !PACKAGE_NAME.test(entry.name))) {
      fail(errors, 'policy-invalid-value', `${where}.name`, 'expected a lowercase npm package name with an optional @scope/ prefix');
    }
    isVersionText(entry.version, `${where}.version`, errors);
    if (isText(entry.provenance, `${where}.provenance`, errors) && !APPROVED_PROVENANCES.includes(entry.provenance)) {
      fail(errors, 'policy-invalid-value', `${where}.provenance`, `provenance must be one of: ${APPROVED_PROVENANCES.join(', ')}`);
    }
    if (isTarball) isText(entry.sha256, `${where}.sha256`, errors, SHA256);
  });
  noteDuplicates(list.map((entry) => entry?.name), '$.opaquePackages', 'opaque package name', errors);
}

export function validatePolicy(data, options = {}) {
  const errors = [];
  const today = dayNumber(options.today ?? utcToday());
  if (Number.isNaN(today)) throw new TypeError('today must be a YYYY-MM-DD calendar date');
  if (!isObject(data, '$', TOP_KEYS, errors)) {
    if (data === undefined) fail(errors, 'policy-invalid-value', '$', 'expected an object');
    return {errors: sortErrors(errors)};
  }
  if (data.schema !== undefined && data.schema !== POLICY_SCHEMA) fail(errors, 'policy-unsupported-schema', '$.schema', `schema must be ${POLICY_SCHEMA}`);
  if (data.schemaVersion !== undefined && data.schemaVersion !== POLICY_SCHEMA_VERSION) fail(errors, 'policy-unsupported-schema', '$.schemaVersion', `schemaVersion must be ${POLICY_SCHEMA_VERSION}`);
  if (data.catalogVersion !== undefined && data.catalogVersion !== CATALOG_VERSION) fail(errors, 'policy-catalog-mismatch', '$.catalogVersion', `catalogVersion must be ${CATALOG_VERSION}: the policy was authored for a different rule catalog`);
  isText(data.policyId, '$.policyId', errors);
  isVersionText(data.policyVersion, '$.policyVersion', errors);
  validateSupportedCore(data.supportedCore, errors);
  validateProject(data.project, errors);
  const activeIds = validateRules(data.rules, errors);
  validateGrants(data, errors);
  validateExceptions(data.exceptions, activeIds, today, errors);
  validateOpaquePackages(data.opaquePackages, errors);
  return {errors: sortErrors(errors)};
}

// The pin is checked before the bytes are interpreted, and the policy must live outside the scanned project.
export function loadPolicy({policyPath, policySha256, projectRoot, today}) {
  const reject = (code, message, sha256 = null) => ({ok: false, sha256, policy: null, errors: [{code, where: '$', message}]});
  if (typeof policySha256 !== 'string' || !SHA256.test(policySha256)) return reject('policy-pin-invalid', 'policy sha256 pin must be 64 lowercase hexadecimal characters');
  let bytes;
  try {
    bytes = readFileSync(policyPath);
  } catch {
    return reject('policy-unreadable', 'policy file could not be read');
  }
  const sha256 = sha256Hex(bytes);
  if (sha256 !== policySha256) return reject('policy-pin-mismatch', 'policy bytes do not match the supplied sha256 pin', sha256);
  if (projectRoot !== undefined && isInside(realpathSync(policyPath), realpathSync(projectRoot))) {
    return reject('policy-inside-project', 'policy must be supplied from outside the scanned project', sha256);
  }
  let text;
  let data;
  try {
    text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
    data = JSON.parse(text);
  } catch {
    return reject('policy-parse-error', 'policy must be strict UTF-8 JSON without comments or trailing commas', sha256);
  }
  const errors = duplicateKeys(text).map((where) => ({code: 'policy-duplicate-field', where, message: 'duplicate field'}));
  errors.push(...validatePolicy(data, {today}).errors);
  if (errors.length > 0) return {ok: false, sha256, policy: null, errors: sortErrors(errors)};
  return {ok: true, sha256, policy: data, errors: []};
}

// The installed core must be the exact expected release or prerelease and lie inside both the policy bounds and the checker's known range.
export function checkCorePairing({projectRoot, supportedCore, expectedCoreVersion}) {
  const core = {installed: null, expected: expectedCoreVersion, supported: supportedCore, paired: false};
  const errors = [];
  try {
    const version = JSON.parse(readFileSync(join(projectRoot, CORE_MANIFEST), 'utf8')).version;
    core.installed = typeof version === 'string' ? version : null;
  } catch {
    return {core, errors: [{code: 'core-not-installed', where: CORE_MANIFEST, message: 'installed core manifest could not be read'}]};
  }
  if (!isExactVersion(core.installed)) {
    fail(errors, 'core-version-invalid', CORE_MANIFEST, 'installed core version must be an exact SemVer release or prerelease without build metadata');
  } else {
    if (core.installed !== expectedCoreVersion) fail(errors, 'core-version-mismatch', CORE_MANIFEST, `installed core ${core.installed} is not the expected ${expectedCoreVersion}`);
    if (!inRange(core.installed, supportedCore)) {
      fail(errors, 'unsupported-core-version', CORE_MANIFEST, `installed core ${core.installed} is outside ${supportedCore.min} <= version < ${supportedCore.maxExclusive}`);
    } else if (!inRange(core.installed, CHECKER_KNOWN_CORE)) {
      fail(errors, 'core-outside-checker-range', CORE_MANIFEST, `installed core ${core.installed} is outside the checker's known core range ${CHECKER_KNOWN_CORE.min} <= version < ${CHECKER_KNOWN_CORE.maxExclusive}`);
    }
  }
  core.paired = errors.length === 0;
  return {core, errors: sortErrors(errors)};
}

// Records stay outside the project and are pinned by sha256. Their content is not interpreted in this slice.
export function verifyQualificationRecords({policy, recordsRoot, projectRoot}) {
  const errors = [];
  if (policy.qualificationRecords.length === 0) return errors;
  if (recordsRoot === undefined || !existsSync(recordsRoot) || !statSync(recordsRoot).isDirectory()) {
    fail(errors, 'records-root-missing', '$.qualificationRecords', 'declared qualification records require an existing records root');
    return errors;
  }
  const root = realpathSync(recordsRoot);
  if (isInside(root, realpathSync(projectRoot))) {
    fail(errors, 'records-inside-project', '$.qualificationRecords', 'qualification records must be supplied from outside the scanned project');
    return errors;
  }
  policy.qualificationRecords.forEach((record, index) => {
    const where = `$.qualificationRecords[${index}]`;
    const file = join(root, record.file);
    if (!existsSync(file) || !statSync(file).isFile() || !isInside(realpathSync(file), root)) fail(errors, 'qualification-record-missing', where, `record file is missing under the records root: ${record.file}`);
    else if (sha256Hex(readFileSync(file)) !== record.sha256) fail(errors, 'record-pin-mismatch', where, `record bytes do not match the pinned sha256: ${record.file}`);
  });
  return sortErrors(errors);
}

export function ruleInventory(policy) {
  return {
    active: policy.rules.active.map(({id, severity}) => ({id, severity})),
    inactive: policy.rules.inactive.map(({id, reason, detail}) => ({id, status: 'not-active', reason, detail}))
  };
}
