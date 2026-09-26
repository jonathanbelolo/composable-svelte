import { expect, test } from 'vitest';
import { planTransformMix } from '../src/lib/application/renderer/transform-mix.js';

const assert = {
  equal(actual: unknown, expected: unknown, message?: string) { expect(actual, message).toBe(expected); },
  deepEqual(actual: unknown, expected: unknown, message?: string) { expect(actual, message).toEqual(expected); },
  ok(actual: unknown, message?: string) { expect(actual, message).toBeTruthy(); }
};

function mix(from: string, to: string, expectedFrom: string, expectedTo: string) {
  const plan = planTransformMix(from, to);
  assert.equal(plan.kind, 'mix');
  if (plan.kind !== 'mix') return;
  assert.equal(plan.from, expectedFrom);
  assert.equal(plan.to, expectedTo);
  assert.equal(plan.emitted.global, false);
  assert.ok(plan.emitted.test(expectedFrom));
  assert.ok(plan.emitted.test(expectedTo));
}

test('canonicalizes signs, exponents, leading dots, decimals and whitespace', () => {
  mix('  translateX(+1e3px) rotate(-.5turn)  ', 'translateX(1e-7px) rotate(+0deg)',
    'translateX(1000px) rotate(-0.5turn)', 'translateX(0.0000001px) rotate(0turn)');
  mix('scale(+.500000)', 'scale(1e0, 2.5000001)', 'scale(0.5, 0.5)', 'scale(1, 2.5000001)');
});

test('normalizes translate and scale arity', () => {
  mix('translate(10px)', 'translate(20px, 30px)', 'translate(10px, 0px)', 'translate(20px, 30px)');
  mix('scale(0.9)', 'scale(1, 2)', 'scale(0.9, 0.9)', 'scale(1, 2)');
});

test('adopts counterpart units for zero and deterministic defaults for two zeros', () => {
  mix('translateX(0)', 'translateX(100%)', 'translateX(0%)', 'translateX(100%)');
  mix('translateY(0rem)', 'translateY(20px)', 'translateY(0px)', 'translateY(20px)');
  mix('rotate(0)', 'rotate(0turn)', 'rotate(0turn)', 'rotate(0turn)');
  mix('skewX(0)', 'skewX(0)', 'skewX(0deg)', 'skewX(0deg)');
  mix('translate(0, 0)', 'translate(0, 0)', 'translate(0px, 0px)', 'translate(0px, 0px)');
});

test('expands none to the counterpart identity in both directions', () => {
  mix('none', 'translateY(16px) scale(0.96)', 'translateY(0px) scale(1, 1)', 'translateY(16px) scale(0.96, 0.96)');
  mix('rotate(45deg) scale(1.2)', 'none', 'rotate(45deg) scale(1.2, 1.2)', 'rotate(0deg) scale(1, 1)');
  assert.deepEqual(planTransformMix('none', 'none'), { kind: 'identity' });
});

test('accepts the mandatory 2D function table and preserves order', () => {
  mix('translateX(1px) translateY(2rem) scaleX(1) scaleY(2) rotate(3deg) skewX(4rad) skewY(5turn)',
    'translateX(2px) translateY(3rem) scaleX(2) scaleY(3) rotate(4deg) skewX(5rad) skewY(6turn)',
    'translateX(1px) translateY(2rem) scaleX(1) scaleY(2) rotate(3deg) skewX(4rad) skewY(5turn)',
    'translateX(2px) translateY(3rem) scaleX(2) scaleY(3) rotate(4deg) skewX(5rad) skewY(6turn)');
});

test('returns precise parse and validation fallbacks', () => {
  const rows: Array<[string, string, string]> = [
    ['', 'none', 'unparseable'],
    ['translateX (1px)', 'translateX(2px)', 'unparseable'],
    ['translateX(1px 2px)', 'translateX(2px)', 'unparseable'],
    ['translateX(1px)', 'translateY(1px)', 'function-mismatch'],
    ['translateX(1px) rotate(1deg)', 'rotate(1deg) translateX(1px)', 'function-mismatch'],
    ['translateX(1px)', 'translateX(1rem)', 'unit-mismatch'],
    ['rotate(1deg)', 'rotate(1turn)', 'unit-mismatch'],
    ['translateX(1)', 'translateX(2px)', 'invalid-argument'],
    ['rotate(45)', 'rotate(90deg)', 'invalid-argument'],
    ['scale(1px)', 'scale(2)', 'invalid-argument'],
    ['translate(1px, 2px, 3px)', 'none', 'invalid-argument'],
    ['translateX(1000001px)', 'none', 'number-out-of-range'],
    ['translateX(Infinitypx)', 'none', 'unparseable'],
    ['TRANSLATEX(1px)', 'none', 'unsupported-function'],
    ['toString(1)', 'none', 'unsupported-function'],
    ['matrix(1, 0, 0, 1, 0, 0)', 'none', 'unsupported-function'],
    ['translateX(calc(1px))', 'none', 'unparseable'],
    ['\ttranslateX(1px)', 'none', 'unparseable']
  ];
  for (const [from, to, reason] of rows) assert.deepEqual(planTransformMix(from, to), { kind: 'fallback', reason }, `${from} -> ${to}`);
});

test('keeps the unqualified 3D tier explicitly unsupported', () => {
  for (const value of ['translateZ(1px)', 'translate3d(1px, 2px, 3px)', 'scaleZ(1)', 'scale3d(1, 1, 1)', 'rotateX(1deg)', 'rotateY(1deg)', 'rotateZ(1deg)', 'rotate3d(1, 0, 0, 1deg)', 'perspective(10px)']) {
    assert.deepEqual(planTransformMix(value, 'none'), { kind: 'fallback', reason: 'unsupported-function' });
  }
});

test('bounds function count and input length', () => {
  const sixteen = Array.from({ length: 16 }, () => 'scale(1)').join('');
  assert.equal(planTransformMix(sixteen, sixteen).kind, 'mix');
  assert.deepEqual(planTransformMix(`${sixteen}scale(1)`, 'none'), { kind: 'fallback', reason: 'too-many-functions' });
  const adversarial = `translateX(${ '0'.repeat(4070) }.1px)`;
  assert.ok(adversarial.length <= 4096);
  assert.equal(planTransformMix(adversarial, 'none').kind, 'mix');
  assert.deepEqual(planTransformMix(`${adversarial}${' '.repeat(4097)}`, 'none'), { kind: 'fallback', reason: 'unparseable' });
});

test('emitted shape is anchored and rejects mixer drift', () => {
  const plan = planTransformMix('none', 'translate(10px, -20%) scale(1.2, 0.8) rotate(45deg)');
  assert.equal(plan.kind, 'mix');
  if (plan.kind !== 'mix') return;
  for (const value of [
    'translate(0px, -10%) scale(1.1, 0.9) rotate(22.5deg)',
    'translate(.5px, 0%) scale(-1, 2) rotate(0deg)'
  ]) assert.ok(plan.emitted.test(value), value);
  for (const value of [
    ' translate(0px, -10%) scale(1.1, 0.9) rotate(22.5deg)',
    'translate(0px,-10%) scale(1.1, 0.9) rotate(22.5deg)',
    'translate(0rem, -10%) scale(1.1, 0.9) rotate(22.5deg)',
    'translate(0px, -10%) rotate(22.5deg) scale(1.1, 0.9)',
    'translate(1e-7px, -10%) scale(1.1, 0.9) rotate(22.5deg)',
    'translate(+1px, -10%) scale(1.1, 0.9) rotate(22.5deg)',
    'translate(0px, -10%) scale(1.1, 0.9) rotate(22.5deg) ',
    'translate(0px, -10%) scale(1.1, 0.9) rotate(22.5deg)\n'
  ]) assert.equal(plan.emitted.test(value), false, value);
});

test('does not mutate inputs and returns frozen plan records', () => {
  const from = 'translateX(0)';
  const to = 'translateX(10px)';
  const plan = planTransformMix(from, to);
  assert.equal(from, 'translateX(0)');
  assert.equal(to, 'translateX(10px)');
  assert.ok(Object.isFrozen(plan));
});
