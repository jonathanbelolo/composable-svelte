/**
 * Strict SemVer 2.0.0 utilities.
 * Canonical format: X.Y.Z(-prerelease)?(\+build)?
 */

const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const IS_NUMERIC = /^\d+$/;

function compareNumeric(a, b) {
  if (a.length !== b.length) {
    return a.length > b.length ? 1 : -1;
  }
  return a > b ? 1 : a < b ? -1 : 0;
}

function parseVersion(value) {
  if (typeof value !== 'string') return null;
  const match = SEMVER_REGEX.exec(value);
  if (!match) return null;
  return {
    major: match[1],
    minor: match[2],
    patch: match[3],
    prerelease: match[4] ? match[4].split('.') : null,
  };
}

function comparePrerelease(a, b) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const idA = a[i];
    const idB = b[i];
    if (idA === undefined) return -1;
    if (idB === undefined) return 1;
    if (idA === idB) continue;

    const aNum = IS_NUMERIC.test(idA);
    const bNum = IS_NUMERIC.test(idB);
    if (aNum && bNum) return compareNumeric(idA, idB);
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
    return idA > idB ? 1 : -1;
  }
  return 0;
}

/**
 * Checks whether value is a canonical SemVer 2.0.0 string.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isVersion(value) {
  return typeof value === 'string' && SEMVER_REGEX.test(value);
}

/**
 * Compares two SemVer strings by SemVer 2.0.0 precedence ignoring build metadata.
 * @param {string} left
 * @param {string} right
 * @returns {number} -1 if left < right, 0 if left == right, 1 if left > right
 * @throws {TypeError} If either operand is invalid
 */
export function compareVersions(left, right) {
  const v1 = parseVersion(left);
  const v2 = parseVersion(right);
  if (!v1 || !v2) {
    throw new TypeError(`Invalid SemVer operands: left=${JSON.stringify(left)}, right=${JSON.stringify(right)}`);
  }
  for (const part of ['major', 'minor', 'patch']) {
    const cmp = compareNumeric(v1[part], v2[part]);
    if (cmp !== 0) return cmp;
  }
  return comparePrerelease(v1.prerelease, v2.prerelease);
}

/**
 * Checks whether value is an exact canonical SemVer with optional single ^ or ~ prefix.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isRegistrySpec(value) {
  if (typeof value !== 'string') return false;
  const v = value.startsWith('^') || value.startsWith('~') ? value.slice(1) : value;
  return isVersion(v);
}
