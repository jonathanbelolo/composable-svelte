/** Private pure planning for the bounded 2D transform string mixer. */

export type TransformMixFallbackReason =
  | 'unparseable'
  | 'unsupported-function'
  | 'invalid-argument'
  | 'number-out-of-range'
  | 'too-many-functions'
  | 'function-mismatch'
  | 'unit-mismatch';

export type TransformMixPlan =
  | Readonly<{ kind: 'mix'; from: string; to: string; emitted: RegExp }>
  | Readonly<{ kind: 'identity' }>
  | Readonly<{ kind: 'fallback'; reason: TransformMixFallbackReason }>;

export class TransformMixError extends Error {
  readonly name = 'TransformMixError';
  readonly reason: TransformMixFallbackReason | 'emitted-shape';
  constructor(reason: TransformMixFallbackReason | 'emitted-shape') {
    super(`Transform interpolation failed: ${reason}`);
    this.reason = reason;
  }
}

type ArgumentKind = 'length' | 'angle' | 'number';
interface Argument { value: number; unit: string; kind: ArgumentKind }
interface TransformFunction { name: FunctionName; args: Argument[] }
type FunctionName = keyof typeof FUNCTIONS;
interface FunctionRule { min: number; max: number; kinds: readonly ArgumentKind[] }

const MAX_INPUT_LENGTH = 4096;
const MAX_FUNCTIONS = 16;
const MAX_MAGNITUDE = 1_000_000;
const NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/;
const EMITTED_NUMBER = '-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)';

const FUNCTIONS = Object.freeze({
  translate: { min: 1, max: 2, kinds: ['length', 'length'] },
  translateX: { min: 1, max: 1, kinds: ['length'] },
  translateY: { min: 1, max: 1, kinds: ['length'] },
  scale: { min: 1, max: 2, kinds: ['number', 'number'] },
  scaleX: { min: 1, max: 1, kinds: ['number'] },
  scaleY: { min: 1, max: 1, kinds: ['number'] },
  rotate: { min: 1, max: 1, kinds: ['angle'] },
  skewX: { min: 1, max: 1, kinds: ['angle'] },
  skewY: { min: 1, max: 1, kinds: ['angle'] }
} satisfies Record<string, FunctionRule>);

type Parsed =
  | { kind: 'none' }
  | { kind: 'list'; functions: TransformFunction[] }
  | { kind: 'fallback'; reason: TransformMixFallbackReason };

const fallback = (reason: TransformMixFallbackReason): TransformMixPlan => Object.freeze({ kind: 'fallback', reason });
const parsedFallback = (reason: TransformMixFallbackReason): Parsed => ({ kind: 'fallback', reason });
const isNameStart = (char: string | undefined) => char !== undefined && /[A-Za-z]/.test(char);
const isNamePart = (char: string | undefined) => char !== undefined && /[A-Za-z0-9]/.test(char);
const isUnitPart = (char: string | undefined) => char !== undefined && /[A-Za-z]/.test(char);

function trimSpaces(value: string): string {
  let start = 0, end = value.length;
  while (value[start] === ' ') start++;
  while (end > start && value[end - 1] === ' ') end--;
  return value.slice(start, end);
}

function parse(css: string): Parsed {
  if (css.length > MAX_INPUT_LENGTH) return parsedFallback('unparseable');
  const input = trimSpaces(css);
  if (input === 'none') return { kind: 'none' };
  if (!input) return parsedFallback('unparseable');
  const functions: TransformFunction[] = [];
  let at = 0;
  const spaces = () => { while (input[at] === ' ') at++; };

  while (at < input.length) {
    spaces();
    if (at === input.length) break;
    if (functions.length === MAX_FUNCTIONS) return parsedFallback('too-many-functions');
    if (!isNameStart(input[at])) return parsedFallback('unparseable');
    const nameStart = at++;
    while (isNamePart(input[at])) at++;
    const rawName = input.slice(nameStart, at);
    if (!Object.hasOwn(FUNCTIONS, rawName)) return parsedFallback('unsupported-function');
    const name = rawName as FunctionName;
    const rule = FUNCTIONS[name];
    if (input[at++] !== '(') return parsedFallback('unparseable');
    spaces();
    const args: Argument[] = [];
    while (true) {
      const match = NUMBER.exec(input.slice(at));
      if (!match) return parsedFallback('unparseable');
      at += match[0].length;
      const value = Number(match[0]);
      if (!Number.isFinite(value) || Math.abs(value) > MAX_MAGNITUDE) return parsedFallback('number-out-of-range');
      const unitStart = at;
      if (input[at] === '%') at++;
      else while (isUnitPart(input[at])) at++;
      const unit = input.slice(unitStart, at);
      const index = args.length;
      const kind = rule.kinds[Math.min(index, rule.kinds.length - 1)]!;
      args.push({ value, unit, kind });
      spaces();
      if (input[at] === ',') { at++; spaces(); continue; }
      if (input[at] === ')') { at++; break; }
      return parsedFallback('unparseable');
    }
    if (args.length < rule.min || args.length > rule.max) return parsedFallback('invalid-argument');
    for (const arg of args) {
      if (arg.kind === 'number') {
        if (arg.unit !== '') return parsedFallback('invalid-argument');
      } else {
        const allowed = arg.kind === 'length' ? arg.unit === 'px' || arg.unit === '%' || arg.unit === 'rem'
          : arg.unit === 'deg' || arg.unit === 'rad' || arg.unit === 'turn';
        if (arg.value !== 0 && !allowed) return parsedFallback('invalid-argument');
        if (arg.value === 0 && arg.unit !== '' && !allowed) return parsedFallback('invalid-argument');
      }
    }
    if (name === 'translate' && args.length === 1) args.push({ value: 0, unit: args[0]!.unit, kind: 'length' });
    if (name === 'scale' && args.length === 1) args.push({ ...args[0]! });
    functions.push({ name, args });
    spaces();
  }
  return functions.length ? { kind: 'list', functions } : parsedFallback('unparseable');
}

function identityOf(functions: readonly TransformFunction[]): TransformFunction[] {
  return functions.map(fn => ({
    name: fn.name,
    args: fn.args.map(arg => ({ ...arg, value: arg.kind === 'number' ? 1 : 0 }))
  }));
}

function fallbackUnit(kind: ArgumentKind): string {
  return kind === 'length' ? 'px' : kind === 'angle' ? 'deg' : '';
}

function pairUnits(left: Argument, right: Argument): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'number') return left.unit === '' && right.unit === '';
  if (left.value === 0 && right.value === 0) {
    const unit = right.unit || left.unit || fallbackUnit(left.kind);
    left.unit = right.unit = unit;
  } else if (left.value === 0) left.unit = right.unit;
  else if (right.value === 0) right.unit = left.unit;
  return left.unit === right.unit;
}

/** Exact decimal expansion of the shortest round-trip form; no digit is dropped. */
function formatNumberNoExp(n: number): string {
  if (n === 0) return '0';
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(String(n));
  if (!match) return String(n);
  const sign = match[1] ?? '';
  const whole = match[2] ?? '';
  const digits = whole + (match[3] ?? '');
  const point = whole.length + Number(match[4]);
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${'0'.repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

function serialize(functions: readonly TransformFunction[]): string {
  return functions.map(fn => `${fn.name}(${fn.args.map(arg => `${formatNumberNoExp(arg.value)}${arg.unit}`).join(', ')})`).join(' ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function emittedShape(functions: readonly TransformFunction[]): RegExp {
  const body = functions.map(fn => `${escapeRegExp(fn.name)}\\(${fn.args.map(arg => `${EMITTED_NUMBER}${escapeRegExp(arg.unit)}`).join(', ')}\\)`).join(' ');
  return new RegExp(`^${body}$`);
}

export function planTransformMix(fromCss: string, toCss: string): TransformMixPlan {
  const fromParsed = parse(fromCss);
  if (fromParsed.kind === 'fallback') return fallback(fromParsed.reason);
  const toParsed = parse(toCss);
  if (toParsed.kind === 'fallback') return fallback(toParsed.reason);
  if (fromParsed.kind === 'none' && toParsed.kind === 'none') return Object.freeze({ kind: 'identity' });

  const from = fromParsed.kind === 'none' ? identityOf((toParsed as { kind: 'list'; functions: TransformFunction[] }).functions)
    : fromParsed.functions.map(fn => ({ name: fn.name, args: fn.args.map(arg => ({ ...arg })) }));
  const to = toParsed.kind === 'none' ? identityOf(from)
    : toParsed.functions.map(fn => ({ name: fn.name, args: fn.args.map(arg => ({ ...arg })) }));
  if (from.length !== to.length) return fallback('function-mismatch');
  for (let i = 0; i < from.length; i++) {
    const left = from[i]!, right = to[i]!;
    if (left.name !== right.name || left.args.length !== right.args.length) return fallback('function-mismatch');
    for (let j = 0; j < left.args.length; j++) if (!pairUnits(left.args[j]!, right.args[j]!)) return fallback('unit-mismatch');
  }
  return Object.freeze({ kind: 'mix', from: serialize(from), to: serialize(to), emitted: emittedShape(to) });
}
