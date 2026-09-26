import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createValueDomain } from './taint-values.mjs';
import { createExpressionEvaluator } from './expression-values.mjs';

function parseExpr(code) {
  const sf = ts.createSourceFile('test.ts', '(' + code + ')', ts.ScriptTarget.Latest, true);
  assert.deepEqual(sf.parseDiagnostics, [], 'valid expression fixture');
  const stmt = sf.statements[0];
  if (!stmt || !ts.isExpressionStatement(stmt)) {
    throw new Error(`Expected ExpressionStatement for: ${code}`);
  }
  return stmt.expression;
}

function setupHarness() {
  const domain = createValueDomain();
  const assignments = [];
  const invocations = [];
  const propertyLookups = [];
  const unsupportedList = [];
  let nextHeapId = 1;
  const heapMap = new Map();

  const services = {
    domain,
    identifier(node) {
      return domain.atom('state', node.text);
    },
    functionValue(node) {
      return domain.atom('state', `fn_${node.pos}`);
    },
    classValue(node) {
      return domain.atom('state', `cls_${node.pos}`);
    },
    thisValue(_node) {
      return domain.atom('state', 'this');
    },
    allocate(node, { array = false } = {}) {
      let id = heapMap.get(node);
      if (!id) {
        id = `heap_${nextHeapId++}`;
        heapMap.set(node, id);
      }
      return domain.allocate(id, { array });
    },
    property(receiver, key, node, { computed = false } = {}) {
      propertyLookups.push({ receiver, key, node, computed });
      return domain.read(receiver, key);
    },
    invoke(node, callee, args, { construct = false } = {}) {
      invocations.push({ node, callee, args, construct });
      return domain.atom('state', construct ? 'new_res' : 'call_res');
    },
    assign(target, value, assignmentNode) {
      assignments.push({ target, value, assignmentNode });
    },
    unsupported(node, construct, message) {
      unsupportedList.push({ node, construct, message });
    }
  };

  const evaluator = createExpressionEvaluator(services);
  return { domain, services, evaluator, assignments, invocations, propertyLookups, unsupportedList };
}

test('aliases and type wrappers preserve provenance', () => {
  const { evaluator, domain } = setupHarness();
  const cases = ['x', '(x)', '(x as any)', '(x!)', 'await x'];
  for (const code of cases) {
    const val = evaluator(parseExpr(code));
    assert.deepEqual(Array.from(val), Array.from(domain.atom('state', 'x')));
  }
});

test('computed key metadata on property and element access', () => {
  const { evaluator, propertyLookups } = setupHarness();

  evaluator(parseExpr('obj.prop'));
  assert.equal(propertyLookups.at(-1).key, 'prop');
  assert.equal(propertyLookups.at(-1).computed, false);

  evaluator(parseExpr("obj['literalProp']"));
  assert.equal(propertyLookups.at(-1).key, 'literalProp');
  assert.equal(propertyLookups.at(-1).computed, false);

  evaluator(parseExpr('obj[0]'));
  assert.equal(propertyLookups.at(-1).key, '0');
  assert.equal(propertyLookups.at(-1).computed, false);

  evaluator(parseExpr('obj[dynKey]'));
  assert.equal(propertyLookups.at(-1).key, '*');
  assert.equal(propertyLookups.at(-1).computed, true);
});

test('dispatch and new argument spread flags and tagged templates', () => {
  const { evaluator, invocations } = setupHarness();

  evaluator(parseExpr('fn(a, ...b, c)'));
  const call = invocations.at(-1);
  assert.equal(call.construct, false);
  assert.deepEqual(
    call.args.map((a) => a.spread),
    [false, true, false]
  );

  evaluator(parseExpr('new Cls(a, ...b)'));
  const inst = invocations.at(-1);
  assert.equal(inst.construct, true);
  assert.deepEqual(
    inst.args.map((a) => a.spread),
    [false, true]
  );

  evaluator(parseExpr('tag`hello ${a} world ${b}`'));
  const tagged = invocations.at(-1);
  assert.equal(tagged.construct, false);
  assert.equal(tagged.args.length, 3);
  assert.deepEqual(
    tagged.args.map((a) => a.spread),
    [false, false, false]
  );
});

test('object and array spreads retain descendant state', () => {
  const { evaluator, domain } = setupHarness();

  const arrHeap = evaluator(parseExpr('[...items, x]'));
  const arrRead = domain.read(arrHeap, '*');
  assert.ok(arrRead.has(JSON.stringify(['atom', 'state', 'x'])));

  const objHeap = evaluator(parseExpr('{ ...base, x }'));
  const objRead = domain.read(objHeap, 'x');
  assert.ok(objRead.has(JSON.stringify(['atom', 'state', 'x'])));
});

test('fields after array spread are conservative', () => {
  const { evaluator, domain } = setupHarness();

  const heap = evaluator(parseExpr('[first, ...mid, last]'));
  const firstVal = domain.read(heap, '0');
  // The finite array abstraction summarizes spread/post-spread elements by '*'.
  assert.deepEqual(firstVal, domain.join(domain.atom('state', 'first'), domain.atom('state', 'mid'), domain.atom('state', 'last')));

  const starVal = domain.read(heap, '*');
  assert.ok(starVal.has(JSON.stringify(['atom', 'state', 'last'])));

  const laterVal = domain.read(heap, '2');
  assert.ok(laterVal.has(JSON.stringify(['atom', 'state', 'last'])));
});

test('normal domain literals and arithmetic stop taint', () => {
  const { evaluator, domain } = setupHarness();

  const cases = [
    { code: '"text"', expected: domain.atom('literal', '"text"') },
    { code: '123', expected: domain.atom('literal', '123') },
    { code: 'true', expected: domain.atom('literal', 'true') },
    { code: 'false', expected: domain.atom('literal', 'false') },
    { code: 'null', expected: domain.atom('literal', 'null') },
    { code: 'taint + 1', expected: domain.empty() },
    { code: 'taint * 2', expected: domain.empty() },
    { code: 'taint === other', expected: domain.empty() },
    { code: '`taint ${val}`', expected: domain.empty() }
  ];

  for (const { code, expected } of cases) {
    const val = evaluator(parseExpr(code));
    assert.deepEqual(Array.from(val), Array.from(expected));
  }
});

test('assignments and logical unions', () => {
  const { evaluator, domain, assignments } = setupHarness();

  const res1 = evaluator(parseExpr('x = y'));
  assert.deepEqual(Array.from(res1), Array.from(domain.atom('state', 'y')));
  assert.equal(assignments.at(-1).target.text, 'x');

  const res2 = evaluator(parseExpr('x ||= y'));
  const expectedUnion = domain.join(domain.atom('state', 'x'), domain.atom('state', 'y'));
  assert.deepEqual(Array.from(res2), Array.from(expectedUnion));
  assert.deepEqual(Array.from(assignments.at(-1).value), Array.from(expectedUnion));

  const res3 = evaluator(parseExpr('x += y'));
  assert.deepEqual(Array.from(res3), Array.from(domain.empty()));
  assert.deepEqual(Array.from(assignments.at(-1).value), Array.from(domain.empty()));

  const res4 = evaluator(parseExpr('++x'));
  assert.deepEqual(Array.from(res4), Array.from(domain.empty()));
  assert.deepEqual(Array.from(assignments.at(-1).value), Array.from(domain.atom('state', 'x')));
});

test('callbacks and function bodies are not traversed', () => {
  const { evaluator, assignments } = setupHarness();

  evaluator(parseExpr('() => { x = y; }'));
  assert.equal(assignments.length, 0);

  evaluator(parseExpr('function fn() { x = y; }'));
  assert.equal(assignments.length, 0);
});

test('unsupported getters, setters, and dynamic keys are recorded', () => {
  const { evaluator, unsupportedList } = setupHarness();

  evaluator(parseExpr('({ get prop() { return 1; } })'));
  assert.ok(unsupportedList.some((u) => u.construct === 'GetAccessor'));

  evaluator(parseExpr('({ set prop(v) { } })'));
  assert.ok(unsupportedList.some((u) => u.construct === 'SetAccessor'));

  evaluator(parseExpr('({ [dynKey]: 123, regular: 456 })'));
  assert.ok(unsupportedList.some((u) => u.construct === 'ComputedPropertyName'));
});

test('literal dynamic imports preserve an explicit invocation identity', () => {
  const {evaluator, domain, invocations, unsupportedList} = setupHarness();
  evaluator(parseExpr('import("./helper")'));
  assert.deepEqual(invocations[0].callee, domain.atom('import', 'import'));
  assert.deepEqual(unsupportedList, []);
});
