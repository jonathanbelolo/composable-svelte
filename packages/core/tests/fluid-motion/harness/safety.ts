/**
 * Decoration safety inspection.
 * Verifies that temporary motion representations and route planes remain strictly
 * non-interactive, aria-hidden, inert, and devoid of duplicate IDs, real controls,
 * or business resource elements.
 *
 * Checks the root element itself as well as all descendants.
 *
 * Limits: attribute/tag inspection of the light DOM only. It does not read the browser's
 * accessibility tree, shadow roots, or CSS-generated affordances; pair with role queries and
 * semantics.ts counts while the plane exists.
 */
import type { DecorationSafetyReport } from './types.js';

export function checkDecorationSafety(element: Element | null): DecorationSafetyReport {
  if (!element) {
    return {
      isSafe: false,
      inert: false,
      ariaHidden: false,
      bannedIds: [],
      bannedControls: [],
      bannedResources: [],
      violations: ['Target decoration element does not exist (null)']
    };
  }

  const violations: string[] = [];

  // 1. Inertness inspection (root or ancestor)
  const inert = element.hasAttribute('inert') || Boolean(element.closest('[inert]'));
  if (!inert) {
    violations.push('Missing required inert attribute on decoration element');
  }

  // 2. Accessibility tree exclusion inspection
  const ariaHidden = element.getAttribute('aria-hidden') === 'true' || element.closest('[aria-hidden="true"]') !== null;
  if (!ariaHidden) {
    violations.push('Missing or invalid aria-hidden attribute (expected aria-hidden="true")');
  }

  // 3. Duplicate identity inspection (banned IDs inside temporary representations)
  const elementsWithIds = [...element.querySelectorAll('[id]')];
  if (element.hasAttribute('id')) {
    elementsWithIds.unshift(element);
  }
  const bannedIds = elementsWithIds.map(el => el.id);
  if (bannedIds.length > 0) {
    violations.push(`Banned IDs found in decoration subtree: ${bannedIds.join(', ')}`);
  }

  // 4. Banned controls & interactive affordances (checking root itself and descendants)
  const controlSelectors = [
    'a',
    'button',
    'input',
    'select',
    'textarea',
    '[tabindex]',
    '[role="button"]',
    '[role="link"]',
    '[role="textbox"]',
    '[role="combobox"]',
    '[contenteditable]',
    // Added in harness correction: remaining interactive tags and widget roles.
    'summary',
    'details',
    'label',
    'area',
    '[popover]',
    '[autofocus]',
    '[draggable="true"]',
    ...['checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'searchbox', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'treeitem', 'gridcell', 'scrollbar'].map(role => `[role="${role}"]`)
  ];
  const controlMatches = controlSelectors.join(',');
  const controlsFound = [...element.querySelectorAll(controlMatches)];
  if (element.matches(controlMatches)) {
    controlsFound.unshift(element);
  }

  const bannedControls = controlsFound.map(el => {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const tabIndex = el.getAttribute('tabindex');
    return `${tag}${role ? `[role=${role}]` : ''}${tabIndex ? `[tabindex=${tabIndex}]` : ''}`;
  });

  if (bannedControls.length > 0) {
    violations.push(`Banned interactive controls found in decoration subtree: ${bannedControls.join(', ')}`);
  }

  // 5. Banned resource-bearing elements & forms (checking root itself and descendants)
  const resourceSelectors = ['audio', 'video', 'iframe', 'embed', 'object', 'canvas', 'form'];
  const resourceMatches = resourceSelectors.join(',');
  const resourcesFound = [...element.querySelectorAll(resourceMatches)];
  if (element.matches(resourceMatches)) {
    resourcesFound.unshift(element);
  }

  const bannedResources = resourcesFound.map(el => el.tagName.toLowerCase());
  if (bannedResources.length > 0) {
    violations.push(`Banned resource-bearing elements found in decoration subtree: ${bannedResources.join(', ')}`);
  }

  // 6. Inline event handler attributes (added in harness correction)
  const withHandlers = [element, ...element.querySelectorAll('*')].filter(el =>
    [...el.attributes].some(attr => attr.name.startsWith('on'))
  );
  if (withHandlers.length > 0) {
    violations.push(`Inline event handler attributes found in decoration subtree: ${withHandlers.map(el => el.tagName.toLowerCase()).join(', ')}`);
  }

  const isSafe = violations.length === 0;

  return {
    isSafe,
    inert,
    ariaHidden,
    bannedIds,
    bannedControls,
    bannedResources,
    violations
  };
}
