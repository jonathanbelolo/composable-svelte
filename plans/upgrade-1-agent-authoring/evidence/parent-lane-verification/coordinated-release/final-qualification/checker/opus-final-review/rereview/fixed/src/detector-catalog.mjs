// Grounded detector catalog for the five active rule families.
// Enumerate exactly the implemented detector strings from the three evaluators:
// - rules/semantic-rules.mjs
// - rules/routing-template.mjs
// - rules/motion-syntax.mjs

export {CATALOG_VERSION} from './policy.mjs';

export const DETECTOR_CATALOG = Object.freeze([
  Object.freeze({
    id: 'routing/no-manual-browser-authority',
    stage: 'active',
    detectors: Object.freeze([
      'authority-escape',
      'history-write',
      'location-write',
      'traversal-listener'
    ])
  }),
  Object.freeze({
    id: 'presentation/no-subscription-orchestration',
    stage: 'active',
    detectors: Object.freeze([
      'lifecycle-dispatch',
      'lifecycle-mirror',
      'state-mirror',
      'view-subscribe'
    ])
  }),
  Object.freeze({
    id: 'reducers/pure-decisions',
    stage: 'active',
    detectors: Object.freeze([
      'effect-body-primitive',
      'impure-primitive',
      'state-mutation',
      'store-authority-in-reducer'
    ])
  }),
  Object.freeze({
    id: 'resources/no-unowned-infrastructure',
    stage: 'active',
    detectors: Object.freeze([
      'module-load-io',
      'view-io'
    ])
  }),
  Object.freeze({
    id: 'motion/no-competing-playback',
    stage: 'active',
    detectors: Object.freeze([
      'frame-scheduler',
      'svelte-motion-import',
      'transition-directive',
      'web-animations'
    ])
  }),
  Object.freeze({
    id: 'presentation/no-fabricated-view',
    stage: 'staged',
    detectors: Object.freeze([])
  }),
  Object.freeze({
    id: 'adapters/least-authority',
    stage: 'staged',
    detectors: Object.freeze([])
  })
]);

export const KNOWN_LIMITATION_CODES = Object.freeze([
  'opaque-decision-call',
  'opaque-property-key-coercion'
]);

const ACTIVE_DETECTOR_MAP = new Map(
  DETECTOR_CATALOG.filter((rule) => rule.stage === 'active').map((rule) => [rule.id, new Set(rule.detectors)])
);

export function isValidFinding(finding) {
  if (!finding || typeof finding !== 'object') return false;
  const detectors = ACTIVE_DETECTOR_MAP.get(finding.rule);
  if (!detectors) return false;
  return detectors.has(finding.detector);
}

export function isValidLimitation(limitation) {
  if (!limitation || typeof limitation !== 'object') return false;
  return KNOWN_LIMITATION_CODES.includes(limitation.code);
}
