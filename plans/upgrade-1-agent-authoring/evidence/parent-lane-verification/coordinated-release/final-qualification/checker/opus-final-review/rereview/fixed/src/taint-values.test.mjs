import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createValueDomain } from './taint-values.mjs';

test('join immutability and basic operations', () => {
  const d = createValueDomain();
  const e = d.empty();
  assert.equal(e.size, 0);

  const a = d.atom('core', 'a');
  const b = d.atom('core', 'b');
  const j1 = d.join(a, b);
  assert.equal(a.size, 1);
  assert.equal(b.size, 1);
  assert.equal(j1.size, 2);
  assert.equal(d.equal(a, b), false);
  assert.equal(d.equal(j1, d.join(b, a)), true);

  const j2 = d.join(a, e);
  assert.equal(d.equal(j2, a), true);
  assert.equal(a.size, 1);
});

test('object precise fields and literal retention', () => {
  const d = createValueDomain();
  const h = d.allocate('obj');
  const v1 = d.atom('core', 'v1');
  const v2 = d.atom('core', 'v2');

  assert.equal(d.write(h, 'x', v1), true);
  assert.equal(d.write(h, 'y', v2), true);
  assert.equal(d.write(h, 'x', v1), false);

  assert.equal(d.equal(d.read(h, 'x'), v1), true);
  assert.equal(d.equal(d.read(h, 'y'), v2), true);
  assert.equal(d.equal(d.read(h, 'z'), d.empty()), true);
});

test('string key atom collision safety', () => {
  const d = createValueDomain();
  const a1 = d.atom('a:b', 'c');
  const a2 = d.atom('a', 'b:c');
  assert.equal(d.equal(a1, a2), false);

  const desc1 = d.describe(a1);
  const desc2 = d.describe(a2);
  assert.deepEqual(desc1, { kind: 'a:b', id: 'c' });
  assert.deepEqual(desc2, { kind: 'a', id: 'b:c' });
});

test('aliases observe later write and allocate stability', () => {
  const d = createValueDomain();
  const r1 = d.allocate('node');
  const r2 = d.allocate('node');
  assert.equal(d.equal(r1, r2), true);

  const val = d.atom('data', 'val');
  d.write(r1, 'prop', val);
  assert.equal(d.equal(d.read(r2, 'prop'), val), true);
});

test('state shallow vs descendant distinction', () => {
  const d = createValueDomain();
  const state = d.atom('state', 'todos');
  const browser = d.atom('browser', 'window');

  assert.equal(d.equal(d.read(state, 'anyProperty'), state), true);
  assert.equal(d.equal(d.read(browser, 'location'), d.empty()), true);

  const copy = d.allocate('copy');
  d.spread(copy, state, { array: false });
  assert.deepEqual(d.describe(copy), { kind: 'heap', id: 'copy' });

  const readItems = d.read(copy, 'items');
  assert.equal(d.equal(readItems, state), true);
});

test('array-copy element alias and sorting copy untainted', () => {
  const d = createValueDomain();
  const state = d.atom('state', 'model');
  const stateItems = d.read(state, 'items');
  assert.equal(d.equal(stateItems, state), true);

  const arrCopy = d.allocate('arr', { array: true });
  d.spread(arrCopy, stateItems, { array: true });

  assert.deepEqual(d.describe(arrCopy), { kind: 'heap', id: 'arr' });

  const elem0 = d.read(arrCopy, '0');
  assert.equal(d.equal(elem0, state), true);
  const elem1 = d.read(arrCopy, '1');
  assert.equal(d.equal(elem1, state), true);
});

test('cyclic shallow spreads retain leaf values', () => {
  const d = createValueDomain();
  const o1 = d.allocate('o1');
  const o2 = d.allocate('o2');
  assert.equal(d.spread(o1, o2), true);
  assert.equal(d.spread(o2, o1), true);

  const leaf = d.atom('leaf', 'target');
  d.write(o1, 'k', leaf);

  const res = d.read(o2, 'k');
  assert.equal(d.equal(res, leaf), true);
});

test('spreads observe later fields and revision updates', () => {
  const d = createValueDomain();
  const src = d.allocate('src');
  const dst = d.allocate('dst');

  const rev0 = d.revision;
  assert.equal(d.spread(dst, src), true);
  assert.equal(d.revision, rev0 + 1);

  assert.equal(d.spread(dst, src), false);
  assert.equal(d.revision, rev0 + 1);

  const laterVal = d.atom('v', 'late');
  assert.equal(d.write(src, 'lateKey', laterVal), true);
  assert.equal(d.revision, rev0 + 2);

  assert.equal(d.equal(d.read(dst, 'lateKey'), laterVal), true);
});

test('numeric/index "*" analysis for objects and arrays', () => {
  const d = createValueDomain();
  const a0 = d.atom('elem', '0');
  const a1 = d.atom('elem', '1');

  const src = d.allocate('srcArr', { array: true });
  d.write(src, '0', a0);
  d.write(src, '1', a1);

  const allSrc = d.read(src, '*');
  assert.equal(d.equal(allSrc, d.join(a0, a1)), true);

  const copy = d.allocate('dstArr', { array: true });
  d.spread(copy, src, { array: true });

  assert.equal(d.equal(d.read(copy, '0'), d.join(a0, a1)), true);
  assert.equal(d.equal(d.read(copy, '9'), d.join(a0, a1)), true);
  assert.equal(d.equal(d.read(copy, '*'), d.join(a0, a1)), true);

  assert.equal(d.equal(d.read(copy, 'custom'), d.empty()), true);
});

test('separate domains retain independent heaps even with stable matching IDs', () => {
  const d1 = createValueDomain();
  const d2 = createValueDomain();
  const h1 = d1.allocate('same');
  const h2 = d2.allocate('same');
  const v = d1.atom('state', 'model');
  d1.write(h1, 'child', v);
  assert.deepEqual(d1.read(h1, 'child'), v);
  assert.equal(d2.read(h2, 'child').size, 0);
  assert.throws(() => d2.join(v), TypeError);
  assert.throws(() => d2.describe(v), TypeError);
});

test('unknown-key writes conservatively flow to known property reads', () => {
  const d = createValueDomain();
  const h = d.allocate('object');
  const v = d.atom('state', 'source');
  d.write(h, '*', v);
  assert.deepEqual(d.read(h, 'items'), v);
  assert.deepEqual(d.read(h, '0'), v);
});

test('invalid input throws deterministic TypeError', () => {
  const d = createValueDomain();
  const h = d.allocate('h');
  const v = d.atom('k', 'v');

  assert.throws(() => d.allocate('h', { array: true }), TypeError);
  assert.throws(() => d.allocate(123), TypeError);
  assert.throws(() => d.atom(1, 'x'), TypeError);
  assert.throws(() => d.atom('heap', 'h'), TypeError);
  assert.throws(() => d.allocate('x', {array: 'false'}), TypeError);
  assert.throws(() => d.spread(h, v, {array: 1}), TypeError);
  assert.throws(() => d.equal(new Set(['unknown']), new Set()), TypeError);

  assert.throws(() => d.write(d.empty(), 'k', v), TypeError);
  assert.throws(() => d.write(v, 'k', v), TypeError);
  assert.throws(() => d.write(h, 123, v), TypeError);
  assert.throws(() => d.write(h, 'k', 'not-a-set'), TypeError);

  assert.throws(() => d.spread(d.empty(), h), TypeError);
  assert.throws(() => d.spread(h, 'not-a-set'), TypeError);
  assert.throws(() => d.spread(v, h), TypeError);

  assert.throws(() => d.read('not-a-set', 'k'), TypeError);
  assert.throws(() => d.read(h, 123), TypeError);
  assert.throws(() => d.equal(h, 'not-a-set'), TypeError);
  assert.throws(() => d.describe('unknown'), TypeError);
});
