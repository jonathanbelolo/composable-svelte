/**
 * HTML sanitization for SSR.
 *
 * Provides safe HTML rendering to prevent XSS attacks.
 *
 * Its own entry point — `@composable-svelte/core/ssr/sanitize` — rather than
 * part of `./ssr/middleware`, because it is the only server-side helper with a
 * dependency: `isomorphic-dompurify`, which pulls in jsdom — measured at +69
 * packages and +32.8MB on a fresh install. That dependency is an *optional
 * peer*, so only consumers who sanitise pay for it. Security headers and rate limiting have no dependencies at all and stay
 * on `./ssr/middleware`, which therefore always resolves.
 *
 * @packageDocumentation
 */

import DOMPurify, { type Config } from 'isomorphic-dompurify';

export interface SanitizeOptions<C extends SanitizeConfig = SanitizeConfig> {
  /** Allow specific HTML tags */
  allowedTags?: string[];

  /** Allow specific HTML attributes */
  allowedAttributes?: Record<string, string[]>;

  /** When false (default), remove data URLs from standard URL-valued
   * attributes on the sanitized DOM, including template contents and srcset.
   * Does not parse CSS, srcdoc or meta refresh; widening those allowlists needs
   * a separate policy. When true, DOMPurify still controls which data URLs pass.
   * data-* attributes remain disabled unless domPurifyConfig.ALLOW_DATA_ATTR
   * explicitly enables them. Mixed srcset removal is conservatively whole-attribute. */
  allowDataUri?: boolean;

  /** Custom DOMPurify config. Filtered TrustedHTML output requires an explicit
   * TRUSTED_TYPES_POLICY; no policy is created and content is never sanitized
   * twice. DOM/fragment return modes take precedence over Trusted Types. */
  domPurifyConfig?: C;
}

/** Minimal public policy surface supported by both minimum and current peers. */
export interface SanitizeTrustedTypesPolicy<T = unknown> {
  createHTML(html: string): T;
  createScriptURL(url: string): unknown;
}
export type SanitizeConfig = Omit<Config, 'TRUSTED_TYPES_POLICY'> & { TRUSTED_TYPES_POLICY?: SanitizeTrustedTypesPolicy | undefined };
export type StringSanitizeOptions = SanitizeOptions<SanitizeConfig & { RETURN_DOM?: false; RETURN_DOM_FRAGMENT?: false; RETURN_TRUSTED_TYPE?: false }>;
export type FragmentSanitizeOptions = SanitizeOptions<SanitizeConfig & { RETURN_DOM_FRAGMENT: true }>;
export type ElementSanitizeOptions = SanitizeOptions<SanitizeConfig & { RETURN_DOM: true; RETURN_DOM_FRAGMENT?: false }>;
export type TrustedSanitizeOptions = SanitizeOptions<SanitizeConfig & { RETURN_TRUSTED_TYPE: true; RETURN_DOM?: false; RETURN_DOM_FRAGMENT?: false }>;
export type PolicySanitizeOptions<T> = TrustedSanitizeOptions & { domPurifyConfig: SanitizeConfig & { TRUSTED_TYPES_POLICY: SanitizeTrustedTypesPolicy<T> } };

/**
 * Default safe configuration for blog posts/user content.
 */
export const defaultSanitizeOptions: StringSanitizeOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'em', 'u', 's', 'a',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'img', 'figure', 'figcaption'
  ],
  allowedAttributes: {
    'a': ['href', 'title', 'rel'],
    'img': ['src', 'alt', 'title', 'width', 'height']
  },
  allowDataUri: false
};

const URL_ATTRIBUTES = new Set(['action', 'background', 'cite', 'data', 'formaction', 'href', 'icon', 'manifest', 'poster', 'profile', 'src', 'srcset', 'usemap', 'xlink:href']);

function removeDataUriAttributes(root: Node): void {
  const nodes = [root];
  while (nodes.length) {
    const node = nodes.pop()!;
    for (const child of Array.from(node.childNodes)) nodes.push(child);
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    // Template contents are a separate fragment, not element.childNodes.
    if (element.localName === 'template') {
      const content = (element as HTMLTemplateElement).content;
      if (content) nodes.push(content);
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (!URL_ATTRIBUTES.has(name)) continue;
      // Browsers remove ASCII tab/newline inside URLs, but do NOT percent-decode
      // schemes. HTML character references have already been decoded by parsing.
      const value = attribute.value.replace(/[\t\r\n]/g, '').replace(/^[\u0000-\u0020]+/, '');
      if (/^data:/i.test(value) || (name === 'srcset' && /(?:^|,)[\u0000-\u0020]*data:/i.test(value))) {
        element.removeAttribute(attribute.name);
      }
    }
  }
}

/**
 * Sanitize HTML content to prevent XSS.
 *
 * @param html - Raw HTML string (potentially unsafe)
 * @param options - Sanitization options
 * @returns Safe string by default; DOM/Trusted Types config selects the corresponding native result.
 *
 * @example
 * ```typescript
 * const userContent = '<script>alert("XSS")</script><p>Hello</p>';
 * const safeContent = sanitizeHTML(userContent);
 * // Result: '<p>Hello</p>' (script removed)
 * ```
 */
export function sanitizeHTML(html: string, options?: StringSanitizeOptions): string;
export function sanitizeHTML(html: string, options: FragmentSanitizeOptions): DocumentFragment;
export function sanitizeHTML(html: string, options: ElementSanitizeOptions): HTMLElement;
export function sanitizeHTML<T>(html: string, options: PolicySanitizeOptions<T>): T;
export function sanitizeHTML(html: string, options: TrustedSanitizeOptions): unknown;
export function sanitizeHTML(html: string, options: SanitizeOptions): unknown;
export function sanitizeHTML(
  html: string,
  options: SanitizeOptions = defaultSanitizeOptions
): unknown {
  if (sanitizationActive) throw new Error('Reentrant sanitizeHTML calls from shared peer hooks are unsupported.');
  sanitizationActive = true;
  try { return sanitizeHTMLInternal(html, options); }
  finally { sanitizationActive = false; }
}

let sanitizationActive = false;
function sanitizeHTMLInternal(html: string, options: SanitizeOptions): unknown {
  if (!DOMPurify.isSupported) throw new Error('HTML sanitization is unavailable in this unsupported environment.');

  // Build allowed attributes array from all tags
  const allowedAttrs = options.allowedAttributes
    ? Object.values(options.allowedAttributes).flat()
    : [];

  const config: any = {
    ALLOWED_TAGS: options.allowedTags || [],
    ALLOWED_ATTR: allowedAttrs,
    ALLOW_DATA_ATTR: false,
    ...options.domPurifyConfig
  };

  // Native peer policy is sufficient when the caller explicitly permits its
  // data-URL rules. Preserve its return mode, empty-input handling and hooks.
  if (options.allowDataUri) return DOMPurify.sanitize(html, config);
  if (config.RETURN_TRUSTED_TYPE && !config.RETURN_DOM && !config.RETURN_DOM_FRAGMENT && !config.TRUSTED_TYPES_POLICY) {
    throw new TypeError('Filtered TrustedHTML requires domPurifyConfig.TRUSTED_TYPES_POLICY; the peer default policy is private.');
  }

  // Work on the sanitized DOM instead of installing hooks on the shared optional
  // peer. Nested wrapper entry is rejected before peer state can be changed.
  const domConfig: { RETURN_DOM: true; RETURN_TRUSTED_TYPE: false } = { ...config, RETURN_DOM: true, RETURN_TRUSTED_TYPE: false };
  const root = DOMPurify.sanitize(html, domConfig);
  if (!root || typeof root !== 'object' || typeof root.nodeType !== 'number') {
    throw new Error('HTML sanitization failed: the peer did not return a DOM node.');
  }
  removeDataUriAttributes(root);
  if (config.RETURN_DOM || config.RETURN_DOM_FRAGMENT) return root;
  const element = root as Element;
  let output = config.WHOLE_DOCUMENT ? element.outerHTML : element.innerHTML;
  const allowDoctype = config.ALLOWED_TAGS?.some((tag: string) => tag.toLowerCase() === '!doctype');
  let doctype = root.ownerDocument?.doctype;
  // With shadowroot attributes the peer imports into its original document.
  // That document's doctype is unrelated to this input. Recover only metadata
  // using its inert parser; do not invoke sanitizer hooks a second time.
  const Parser = root.ownerDocument?.defaultView?.DOMParser;
  if (config.WHOLE_DOCUMENT && allowDoctype && Parser) {
    let input = config.FORCE_BODY ? '<remove></remove>' + html : html;
    if (config.PARSER_MEDIA_TYPE === 'application/xhtml+xml' && (!config.NAMESPACE || config.NAMESPACE === 'http://www.w3.org/1999/xhtml')) {
      input = '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>' + input + '</body></html>';
    }
    const payload = config.TRUSTED_TYPES_POLICY ? config.TRUSTED_TYPES_POLICY.createHTML(input) : input;
    doctype = new Parser().parseFromString(payload, config.PARSER_MEDIA_TYPE || 'text/html').doctype;
  }
  if (config.WHOLE_DOCUMENT && allowDoctype && doctype?.name && /^html$/i.test(doctype.name)) {
    output = `<!DOCTYPE ${doctype.name}>\n${output}`;
  }
  // DOMPurify 3.x also performs this pass after string serialization: an
  // expression can span multiple text nodes and evade per-node filtering.
  if (config.SAFE_FOR_TEMPLATES) {
    for (const expression of [/\{\{[\w\W]*|[\w\W]*\}\}/gm, /<%[\w\W]*|[\w\W]*%>/gm, /\${[\w\W]*}/gm]) {
      output = output.replace(expression, ' ');
    }
  }
  // Let the existing peer apply its configured Trusted Types policy. Do not
  // create a new policy name: deployments may restrict names through CSP.
  if (config.RETURN_TRUSTED_TYPE) {
    return config.TRUSTED_TYPES_POLICY.createHTML(output);
  }
  return output;

}

/**
 * Create a sanitizer function with preset options.
 * Useful for consistent sanitization across your app.
 */
export function createSanitizer(options?: StringSanitizeOptions): (html: string) => string;
export function createSanitizer(options: FragmentSanitizeOptions): (html: string) => DocumentFragment;
export function createSanitizer(options: ElementSanitizeOptions): (html: string) => HTMLElement;
export function createSanitizer<T>(options: PolicySanitizeOptions<T>): (html: string) => T;
export function createSanitizer(options: TrustedSanitizeOptions): (html: string) => unknown;
export function createSanitizer(options: SanitizeOptions): (html: string) => unknown;
export function createSanitizer(options: SanitizeOptions = defaultSanitizeOptions) {
  return (html: string) => sanitizeHTML(html, options);
}
