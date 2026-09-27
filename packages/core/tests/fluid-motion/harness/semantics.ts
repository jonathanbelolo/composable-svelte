/**
 * DOM approximation of accessibility exposure, for counting duplicated content while temporary
 * representations exist (added in harness correction).
 *
 * An element counts as exposed unless it or an ancestor is aria-hidden="true", inert, display:none
 * or visibility:hidden. This mirrors the main exclusion rules but is not the browser's
 * accessibility tree: roles, names, aria-owns and shadow trees are not modelled. Pair it with
 * role-based locator queries.
 */
export function isExposedToAccessibility(el: Element): boolean {
  if (el.closest('[aria-hidden="true"], [inert]')) return false;
  for (let curr: Element | null = el; curr; curr = curr.parentElement) {
    const style = window.getComputedStyle(curr);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

/** Deepest elements under `root` whose text contains `text`. */
export function findTextElements(text: string, root: ParentNode = document.body): Element[] {
  const matches = [...root.querySelectorAll('*')].filter(el => el.textContent?.includes(text));
  return matches.filter(el => ![...el.children].some(child => child.textContent?.includes(text)));
}

/** Counts of text matches in the DOM and among exposed elements. */
export function countTextExposure(text: string, root: ParentNode = document.body): { dom: number; exposed: number } {
  const elements = findTextElements(text, root);
  return { dom: elements.length, exposed: elements.filter(isExposedToAccessibility).length };
}
