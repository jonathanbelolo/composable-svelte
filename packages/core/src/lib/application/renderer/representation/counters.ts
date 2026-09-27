/**
 * Read-only resolution of generated content that uses CSS counters (`counter()`, `counters()`), plus `attr()`.
 * No API exposes rendered counter text, but the counter state is readable: computed `counter-reset`,
 * `counter-increment` and `counter-set` of every element and its ::before/::after. This walks the document in
 * tree order with CSS Lists scoping (a counter created by an element is visible to it, its descendants and its
 * following siblings; reset, then increment, then set; an increment without a counter in scope instantiates one
 * on the element), stopping after the participant subtree. Nothing is mutated.
 *
 * Bounded precisely: at most WALK_LIMIT elements. The implicit `list-item` operations are exposed inconsistently in
 * computed style across engines, so they are derived from the DOM list structure (`ol` start/reversed, `li` value,
 * one per list item) wherever computed style does not already state them, then simulated like any other counter. Quotes use the simulated nesting depth and the computed `quotes` pairs (`auto`: the
 * language's CLDR quotation marks for common languages, else English, reported). `@counter-style` rules are not
 * resolved and unknown counter styles fall back to decimal (reported).
 */
export const WALK_LIMIT = 20000;
interface Instance { value: number; readonly owner: Element | null }
type Scope = Map<string, Instance[]>;
type Snapshot = ReadonlyMap<string, readonly number[]>;

function pairs(value: string, fallback: number): [string, number][] {
  if (!value || value === 'none') return [];
  const tokens = value.trim().split(/\s+/);
  const out: [string, number][] = [];
  for (let index = 0; index < tokens.length; index++) {
    const name = tokens[index]!;
    if (/^-?\d+$/.test(name)) continue;
    const next = tokens[index + 1];
    if (next !== undefined && /^-?\d+$/.test(next)) { out.push([name, Number(next)]); index++; } else out.push([name, fallback]);
  }
  return out;
}
const ROMAN: readonly [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
const roman = (n: number) => { if (n <= 0 || n >= 4000) return String(n); let out = ''; for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; } return out; };
const alpha = (n: number) => { if (n <= 0) return String(n); let out = ''; while (n > 0) { n--; out = String.fromCharCode(97 + (n % 26)) + out; n = Math.floor(n / 26); } return out; };
const GREEK = 'αβγδεζηθικλμνξοπρστυφχψω';
/** Armenian additive symbols (CSS Counter Styles §6.2, upper-armenian); lower-armenian is its lower case. */
const ARMENIAN: readonly (readonly [number, string])[] = [[9000, 'Ք'], [8000, 'Փ'], [7000, 'Ւ'], [6000, 'Ց'], [5000, 'Ր'], [4000, 'Տ'], [3000, 'Վ'], [2000, 'Ս'], [1000, 'Ռ'], [900, 'Ջ'], [800, 'Պ'], [700, 'Չ'], [600, 'Ո'], [500, 'Շ'], [400, 'Ն'], [300, 'Յ'], [200, 'Մ'], [100, 'Ճ'], [90, 'Ղ'], [80, 'Ձ'], [70, 'Հ'], [60, 'Կ'], [50, 'Ծ'], [40, 'Խ'], [30, 'Լ'], [20, 'Ի'], [10, 'Ժ'], [9, 'Թ'], [8, 'Ը'], [7, 'Է'], [6, 'Զ'], [5, 'Ե'], [4, 'Դ'], [3, 'Գ'], [2, 'Բ'], [1, 'Ա']];
function additive(value: number, table: readonly (readonly [number, string])[], min: number, max: number): string | undefined {
  if (value < min || value > max) return undefined;
  let n = value, out = '';
  for (const [weight, symbol] of table) while (n >= weight) { out += symbol; n -= weight; }
  return n === 0 ? out : undefined;
}
type CounterStyleRule = CSSRule & { name: string; system: string; symbols: string; additiveSymbols: string; range: string; fallback: string };
/**
 * The applicable author `@counter-style` rule by name (CSSOM), as the cascade chooses it: only definitions whose
 * conditions apply (enabled sheets, sheet/`@import` media, `@media`, `@supports`); unlayered definitions outrank
 * layered ones; otherwise the last definition in document order (sheets, then adopted sheets) wins.
 */
function counterStyleRule(doc: Document | undefined, name: string): CounterStyleRule | undefined {
  if (!doc) return undefined;
  const win = doc.defaultView;
  const matches = (media: MediaList | undefined | null) => !media || !media.mediaText || media.mediaText === 'all' || !!win?.matchMedia(media.mediaText).matches;
  let found: CounterStyleRule | undefined, foundLayered = true;
  const search = (rules: CSSRuleList, layered: boolean): void => {
    for (const rule of Array.from(rules)) {
      if ((rule as CounterStyleRule).name === name && 'system' in rule) { if (!layered || foundLayered) { found = rule as CounterStyleRule; foundLayered = layered; } continue; }
      const media = (rule as CSSRule & { media?: MediaList }).media;
      if ('conditionText' in rule && media !== undefined && !matches(media)) continue; // inactive @media
      if (rule.constructor?.name === 'CSSSupportsRule' || /^@supports/.test(rule.cssText)) { const condition = (rule as CSSRule & { conditionText?: string }).conditionText; if (condition && !(win as (Window & { CSS?: typeof CSS }) | null)?.CSS?.supports(condition)) continue; }
      const imported = (rule as CSSRule & { styleSheet?: CSSStyleSheet | null }).styleSheet;
      if (imported !== undefined) { if (imported && matches((rule as CSSRule & { media?: MediaList }).media)) { let inner: CSSRuleList | undefined; try { inner = imported.cssRules; } catch { inner = undefined; } if (inner) search(inner, layered || !!(rule as CSSRule & { layerName?: string | null }).layerName); } continue; }
      const isLayer = rule.constructor?.name === 'CSSLayerBlockRule' || /^@layer\b/.test(rule.cssText);
      const nested = (rule as CSSRule & { cssRules?: CSSRuleList }).cssRules; if (nested) search(nested, layered || isLayer);
    }
  };
  for (const sheet of [...Array.from(doc.styleSheets), ...((doc as Document & { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets ?? [])]) {
    if (sheet.disabled || !matches(sheet.media)) continue;
    let rules: CSSRuleList; try { rules = sheet.cssRules; } catch { continue; }
    search(rules, false);
  }
  return found;
}
const symbolList = (text: string) => (text.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s"']+/g) ?? []).map(token => token.startsWith('"') || token.startsWith("'") ? unquote(token) : token);
/** CSS Counter Styles §3.1 algorithms for an author rule; undefined when the value is outside its range (fallback). */
function formatWithRule(value: number, rule: CounterStyleRule, doc: Document, report: (reason: string) => void, depth: number, rules?: Map<string, CounterStyleRule | undefined>): string | undefined {
  const system = (rule.system || 'symbolic').trim();
  const symbols = symbolList(rule.symbols || '');
  const inRange = (low: number, high: number) => value >= low && value <= high;
  if (rule.range && rule.range !== 'auto') {
    const ranges = rule.range.split(',').map(part => part.trim().split(/\s+/).map(bound => bound === 'infinite' ? Number.NaN : Number(bound)));
    if (!ranges.some(([low, high]) => inRange(Number.isNaN(low!) ? -Infinity : low!, Number.isNaN(high!) ? Infinity : high!))) return undefined;
  }
  if (system.startsWith('extends')) return formatCounter(value, system.slice(7).trim(), report, doc, depth + 1, rules);
  if (system === 'cyclic') return symbols.length ? symbols[(((value - 1) % symbols.length) + symbols.length) % symbols.length] : undefined;
  if (system.startsWith('fixed')) { const first = Number(system.slice(5).trim() || 1); return value >= first && value < first + symbols.length ? symbols[value - first] : undefined; }
  if (system === 'symbolic') return value >= 1 && symbols.length ? symbols[(value - 1) % symbols.length]!.repeat(Math.ceil(value / symbols.length)) : undefined;
  if (system === 'alphabetic') { if (value < 1 || symbols.length < 2) return undefined; let out = '', n = value; while (n > 0) { n--; out = symbols[n % symbols.length] + out; n = Math.floor(n / symbols.length); } return out; }
  if (system === 'numeric') { if (symbols.length < 2) return undefined; let n = Math.abs(value), out = n ? '' : symbols[0]!; while (n > 0) { out = symbols[n % symbols.length] + out; n = Math.floor(n / symbols.length); } return (value < 0 ? '-' : '') + out; }
  if (system === 'additive') {
    const pairs = (rule.additiveSymbols || '').split(',').map(part => { const m = /^\s*(\d+)\s+(.*)$/.exec(part); return m ? [Number(m[1]), symbolList(m[2]!)[0] ?? ''] as const : undefined; }).filter((pair): pair is readonly [number, string] => !!pair);
    if (value === 0) { const zero = pairs.find(([weight]) => weight === 0); return zero ? zero[1] : undefined; }
    if (value < 0) return undefined;
    let n = value, out = '';
    for (const [weight, symbol] of pairs) { if (!weight) continue; while (n >= weight) { out += symbol; n -= weight; } }
    return n === 0 ? out : undefined;
  }
  return undefined;
}
/** Predefined names an author `@counter-style` cannot override (CSS Counter Styles §3). */
const NON_OVERRIDABLE = new Set(['decimal', 'disc', 'square', 'circle', 'disclosure-open', 'disclosure-closed', 'none']);
export function formatCounter(value: number, style: string, report: (reason: string) => void, doc?: Document, depth = 0, rules?: Map<string, CounterStyleRule | undefined>): string {
  const lookup = (name: string) => { if (!rules) return counterStyleRule(doc, name); if (!rules.has(name)) rules.set(name, counterStyleRule(doc, name)); return rules.get(name); };
  // An author definition of an overridable name (including predefined ones such as lower-armenian) takes precedence.
  const authored = depth < 8 && !NON_OVERRIDABLE.has(style) ? lookup(style) : undefined;
  if (authored) { const text = formatWithRule(value, authored, doc!, report, depth, rules); return text ?? formatCounter(value, authored.fallback || 'decimal', report, doc, depth + 1, rules); }
  switch (style) {
    case 'decimal': return String(value);
    case 'decimal-leading-zero': return value >= 0 && value < 10 ? `0${value}` : String(value);
    case 'lower-alpha': case 'lower-latin': return alpha(value);
    case 'upper-alpha': case 'upper-latin': return alpha(value).toUpperCase();
    case 'lower-roman': return roman(value);
    case 'upper-roman': return roman(value).toUpperCase();
    case 'lower-greek': { if (value < 1) return String(value); let out = '', n = value; while (n > 0) { n--; out = GREEK[n % GREEK.length] + out; n = Math.floor(n / GREEK.length); } return out; }
    // Predefined styles (CSS Counter Styles §6), outside the additive range falling back to decimal.
    case 'lower-armenian': case 'upper-armenian': {
      const text = additive(value, ARMENIAN, 1, 9999);
      if (text !== undefined) return style === 'lower-armenian' ? text.toLowerCase() : text;
      // Outside the qualified 1–9999 range engines paint differently (Chromium does not paint the specified decimal
      // fallback): deterministically, in every engine, the containing participant settles (the `settle:` report prefix)
      // rather than animating text that may not be what this engine paints (Main disposition, RC4).
      report(`settle:counterStyleOutsideQualifiedRange:${style}:${value}`);
      return String(value);
    }
    case 'cjk-decimal': return (value < 0 ? '-' : '') + String(Math.abs(value)).split('').map(digit => '〇一二三四五六七八九'[Number(digit)]).join('');
    case 'disc': return '•'; case 'circle': return '◦'; case 'square': return '▪'; case 'none': return '';
    default: report(`counterStyleApproximated:${style}`); return String(value);
  }
}
const unquote = (token: string) => token.slice(1, -1).replace(/\\(.)/g, '$1');
const QUOTE_TOKEN = /^(open-quote|close-quote|no-open-quote|no-close-quote)$/;
/** CLDR quotation marks (outer, inner) for `quotes: auto`, by primary language. */
const AUTO_QUOTES: Record<string, readonly string[]> = {
  en: ['“', '”', '‘', '’'], fr: ['«\u202f', '\u202f»', '«\u202f', '\u202f»'], de: ['„', '“', '‚', '‘'], es: ['«', '»', '“', '”'], it: ['«', '»', '“', '”'],
  pt: ['“', '”', '‘', '’'], nl: ['‘', '’', '“', '”'], ru: ['«', '»', '„', '“'], ja: ['「', '」', '『', '』'], zh: ['“', '”', '‘', '’'], ko: ['“', '”', '‘', '’'], pl: ['„', '”', '«', '»'], sv: ['”', '”', '’', '’']
};
function quotePairs(quotes: string, lang: string, report: (reason: string) => void): readonly string[] {
  if (quotes === 'none') return [];
  if (quotes && quotes !== 'auto' && quotes !== 'match-parent') { const strings = quotes.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g); if (strings) return strings.map(unquote); }
  const primary = lang.toLowerCase().split('-')[0] ?? '';
  const pairs = AUTO_QUOTES[primary];
  if (!pairs) { report(`quotesApproximated:${lang || 'unknown'}`); return AUTO_QUOTES['en']!; }
  return pairs;
}

export class CounterResolver {
  private readonly snapshots = new Map<Element, { before?: Snapshot; after?: Snapshot }>();
  /** Quote nesting depth at the start of each pseudo-element's content (document order). */
  private readonly quoteDepth = new Map<Element, { before?: number; after?: number }>();
  /** `@counter-style` lookups for this projection (bounded by the distinct style names it formats). */
  private readonly rules = new Map<string, CounterStyleRule | undefined>();
  private done = false;
  private walked = 0;
  bounded = false;
  constructor(private readonly participant: Element, private readonly report: (reason: string) => void) {}
  private walk(): void {
    if (this.done) return;
    this.done = true;
    const doc = this.participant.ownerDocument;
    const win = doc.defaultView;
    if (!win) return;
    const scope: Scope = new Map();
    const top = (name: string) => { const list = scope.get(name); return list?.[list.length - 1]; };
    const apply = (style: CSSStyleDeclaration, owner: Element | null, element?: Element) => {
      // `reversed(name) [value]` (Firefox exposes it for `ol[reversed]`) is a reset of `name`; without a value, the DOM default.
      const reversedResets: [string, number | undefined][] = [...(style.counterReset || '').matchAll(/reversed\(\s*([^)\s]+)\s*\)(?:\s+(-?\d+))?/g)].map(match => [match[1]!, match[2] === undefined ? undefined : Number(match[2])]);
      const resets = pairs((style.counterReset || '').replace(/reversed\(\s*[^)\s]+\s*\)(?:\s+-?\d+)?/g, ' '), 0), increments = pairs(style.counterIncrement, 1), sets = pairs((style as CSSStyleDeclaration & { counterSet?: string }).counterSet ?? 'none', 0);
      if (!element) for (const [name, value] of reversedResets) resets.push([name, value ?? 0]);
      if (element) {
        // The implicit `list-item` operations (CSS Lists; HTML list attributes), where computed style does not already
        // expose them (engines differ). Authored `list-item` operations are applied as written.
        const mentions = (list: readonly (readonly [string, number])[], _raw: string) => list.some(([name]) => name === 'list-item');
        const html = element.namespaceURI === 'http://www.w3.org/1999/xhtml';
        const reversedList = (list: Element | null) => !!list && list.localName === 'ol' && list.hasAttribute('reversed');
        const listDefault = () => {
          const items = Array.from(element.children).filter(child => win.getComputedStyle(child).display === 'list-item').length;
          const start = element.localName === 'ol' && element.hasAttribute('start') ? Number.parseInt(element.getAttribute('start')!, 10) : Number.NaN;
          return reversedList(element) ? (Number.isFinite(start) ? start : items) + 1 : (Number.isFinite(start) ? start : 1) - 1;
        };
        for (const [name, value] of reversedResets) resets.push([name, value ?? (name === 'list-item' ? listDefault() : 0)]);
        if (html && ['ol', 'ul', 'menu'].includes(element.localName) && !mentions(resets, style.counterReset)) {
          resets.push(['list-item', listDefault()]);
        }
        if (style.display === 'list-item' && !mentions(increments, style.counterIncrement)) increments.push(['list-item', reversedList(element.parentElement) ? -1 : 1]);
        const own = html && element.localName === 'li' && element.hasAttribute('value') ? Number.parseInt(element.getAttribute('value')!, 10) : Number.NaN;
        if (Number.isFinite(own) && !mentions(sets, '')) sets.push(['list-item', own]);
      }
      // A reset in the same parent scope replaces a counter a preceding sibling created (siblings do not nest).
      for (const [name, value] of resets) { const list = scope.get(name) ?? []; if (list.length && list[list.length - 1]!.owner === owner) list.pop(); list.push({ value, owner }); scope.set(name, list); }
      for (const [name, value] of increments) { let instance = top(name); if (!instance) { instance = { value: 0, owner }; scope.set(name, [...(scope.get(name) ?? []), instance]); } instance.value += value; }
      for (const [name, value] of sets) { let instance = top(name); if (!instance) { instance = { value: 0, owner }; scope.set(name, [...(scope.get(name) ?? []), instance]); } instance.value = value; }
    };
    const snapshot = (): Snapshot => new Map([...scope].map(([name, list]) => [name, list.map(instance => instance.value)]));
    // Leaving an element ends the scope of counters its children created (owner === element).
    const leave = (element: Element) => { for (const [name, list] of scope) { while (list.length && list[list.length - 1]!.owner === element) list.pop(); if (!list.length) scope.delete(name); } };
    let depth = 0;
    const quotes = (content: string) => { for (const token of content.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+/g) ?? []) { if (token === 'open-quote' || token === 'no-open-quote') depth++; else if (token === 'close-quote' || token === 'no-close-quote') depth = Math.max(0, depth - 1); } };
    let finished = false;
    const visit = (element: Element, inside: boolean): void => {
      if (finished) return;
      if (++this.walked > WALK_LIMIT) { this.bounded = true; finished = true; return; }
      const within = inside || element === this.participant;
      const style = win.getComputedStyle(element);
      // Elements that generate no box (display:none), and their subtrees and pseudo-elements, do not affect counters.
      if (style.display === 'none') { if (element === this.participant) finished = true; return; }
      apply(style, element.parentElement, element);
      const before = win.getComputedStyle(element, '::before');
      const hasBefore = before.content && before.content !== 'none' && before.content !== 'normal';
      if (hasBefore) apply(before, element);
      if (within && hasBefore) { this.snapshots.set(element, { ...this.snapshots.get(element), before: snapshot() }); this.quoteDepth.set(element, { ...this.quoteDepth.get(element), before: depth }); }
      if (hasBefore) quotes(before.content);
      for (const child of Array.from(element.children)) visit(child, within);
      const after = win.getComputedStyle(element, '::after');
      if (after.content && after.content !== 'none' && after.content !== 'normal') { apply(after, element); if (within) { this.snapshots.set(element, { ...this.snapshots.get(element), after: snapshot() }); this.quoteDepth.set(element, { ...this.quoteDepth.get(element), after: depth }); } quotes(after.content); }
      leave(element);
      if (element === this.participant) finished = true;
    };
    visit(doc.documentElement, false);
    if (this.bounded) this.report(`counterSimulationBounded:${WALK_LIMIT}`);
  }
  /** Resolve generated `content` for `element`'s pseudo-element, or undefined when a token is not resolvable. */
  content(element: Element, which: '::before' | '::after', content: string, quotes = 'auto', lang = ''): string | undefined {
    const tokens = content.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|counters?\([^)]*\)|attr\([^)]*\)|\S+/g);
    if (!tokens) return undefined;
    let text = '';
    let depth: number | undefined;
    for (const token of tokens) {
      if (token.startsWith('"') || token.startsWith("'")) { text += unquote(token); continue; }
      if (QUOTE_TOKEN.test(token)) {
        if (depth === undefined) { this.walk(); depth = this.quoteDepth.get(element)?.[which === '::before' ? 'before' : 'after'] ?? 0; }
        const pairs = quotePairs(quotes, lang, this.report);
        const level = (d: number) => Math.min(d, pairs.length / 2 - 1);
        if (token === 'open-quote') { if (pairs.length) text += pairs[level(depth) * 2]!; depth++; }
        else if (token === 'close-quote') { if (depth > 0) { depth--; if (pairs.length) text += pairs[level(depth) * 2 + 1]!; } }
        else if (token === 'no-open-quote') depth++;
        else depth = Math.max(0, depth - 1);
        continue;
      }
      const attr = /^attr\(\s*([^\s,)]+)/.exec(token);
      if (attr) { text += element.getAttribute(attr[1]!) ?? ''; continue; }
      const counter = /^(counters?)\((.*)\)$/.exec(token);
      if (!counter) { this.report(`generatedContentUnresolved:${token}`); return undefined; }
      this.walk();
      const snap = this.snapshots.get(element)?.[which === '::before' ? 'before' : 'after'];
      if (!snap) return undefined;
      const args = counter[2]!.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,\s]+/g) ?? [];
      const name = args[0]!;
      const values = snap.get(name) ?? [0];
      if (counter[1] === 'counter') text += formatCounter(values[values.length - 1] ?? 0, args[1] ?? 'decimal', this.report, element.ownerDocument, 0, this.rules);
      else { const separator = args[1] ? unquote(args[1]) : ''; text += values.map(value => formatCounter(value, args[2] ?? 'decimal', this.report, element.ownerDocument, 0, this.rules)).join(separator); }
    }
    return text;
  }
}
