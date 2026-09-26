// Value flow over the semantic context: finite, monotone provenance for bindings,
// heap containers, call facts and assignment facts. Zones and rules interpret these
// facts; this module never executes application code.
import ts from 'typescript';
import {createValueDomain} from './taint-values.mjs';
import {createAuthorityValues} from './authority-values.mjs';
import {createExpressionEvaluator, isInstantiationExpression} from './expression-values.mjs';

const MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin', 'set', 'delete', 'clear', 'add']);
const COPIES = new Set(['toSorted', 'toReversed', 'slice', 'concat', 'filter', 'map', 'flat', 'flatMap']);
const ITERATORS = new Set(['forEach', 'find', 'findLast', 'some', 'every', 'at', 'values', 'entries']);
const GETTERS = new Set(['querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName', 'getElementsByTagName', 'getElementsByName', 'getElementsByTagNameNS']);
const HEAP_KINDS = new Set(['heap']);
const CONTAINER_KINDS = new Set(['heap', 'state']);
const DATA_KINDS = new Set(['heap', 'state', 'literal']);
const PARAMETER_PROPERTY_MODIFIERS = new Set([ts.SyntaxKind.PublicKeyword, ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword, ts.SyntaxKind.ReadonlyKeyword]);
const ZERO_SPAN = Object.freeze({start: {line: 1, column: 0, offset: 0}, end: {line: 1, column: 0, offset: 0}});

export function buildValueFlow(context, {maxPasses = 100, onInvoke, onProperty} = {}) {
  if (!Number.isInteger(maxPasses) || maxPasses <= 0) throw new TypeError('maxPasses must be a positive integer.');
  if (onInvoke !== undefined && typeof onInvoke !== 'function') throw new TypeError('onInvoke must be a function.');
  if (onProperty !== undefined && typeof onProperty !== 'function') throw new TypeError('onProperty must be a function.');
  const domain = createValueDomain();
  const authority = createAuthorityValues(domain);
  const bindingValues = new Map();
  const seededNodes = new Map();
  const functionReturns = new Map();
  const parameterInputs = new Map();
  const activeParameterDefaults = new Set();
  const promiseValues = new Map();
  const calls = new Map();
  const assignments = new Map();
  const boundFunctions = new Map();
  const arrayMethods = new Map();
  const arrayReceiverChecks = new Map();
  const computedKeyChecks = new Map();
  const settleChecks = new Map();
  const executorIds = new Set();
  const constructChecks = new Map();
  const classInstances = new Map();
  const nativeErrorClasses = new Set();
  const memberReceivers = new WeakMap();
  const activeOrigins = new Set();
  const activeInitializers = new Set();
  const errors = [];
  const deferredErrors = [];
  const errorKeys = new Set();
  let internalRevision = 0;
  let converged = false;

  for (const [classId] of context.classes) classInstances.set(classId, domain.allocate(`class-instance:${classId}`, {array: false}));

  const empty = () => domain.empty();
  const join = (...values) => domain.join(...values);
  const nodeId = (node) => context.info(node)?.id ?? `pos:${node?.pos}`;
  const describeAtom = (info) => `${info.kind} ${info.id}`;
  const literalKey = (expression) => expression && (ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression)) ? expression.text : '*';
  const bump = () => { internalRevision++; };

  function filterKinds(value, kinds) {
    const result = empty();
    for (const atom of value) if (kinds.has(domain.describe(atom).kind)) result.add(atom);
    return result;
  }
  function without(value, excluded) {
    const result = empty();
    for (const atom of value) if (!excluded.has(atom)) result.add(atom);
    return result;
  }
  function hasKind(value, kind) {
    for (const atom of value) if (domain.describe(atom).kind === kind) return true;
    return false;
  }
  const tentativeMethod = info => info.kind === 'array-method' && arrayMethods.get(info.id)?.tentative === true;

  function addError(node, construct, message, deferred = false) {
    const info = node ? context.info(node) : null;
    const mod = info?.module ?? context.modules[0] ?? null;
    const span = info ? context.span(node) : (mod && typeof mod.span === 'function' ? mod.span(0, 0) : ZERO_SPAN);
    const path = mod?.path ?? '';
    const key = `${path}:${span.start.offset}:${construct}:${message}`;
    if (deferred) {
      deferredErrors.push({code: 'unsupported-construct', construct, path, span, message});
      return;
    }
    if (errorKeys.has(key)) return;
    errorKeys.add(key);
    errors.push({code: 'unsupported-construct', construct, path, span, message});
  }

  function bindingValue(binding) {
    return binding ? (bindingValues.get(binding) ?? empty()) : empty();
  }
  function seedBinding(binding, val) {
    if (!binding || !(val instanceof Set) || val.size === 0) return;
    const current = bindingValue(binding);
    const joined = join(current, val);
    if (domain.equal(current, joined)) return;
    bindingValues.set(binding, joined);
    bump();
  }
  function seedNode(node, val) {
    if (!node || !(val instanceof Set) || val.size === 0) return;
    const current = seededNodes.get(node) ?? empty();
    const joined = join(current, val);
    if (domain.equal(current, joined)) return;
    seededNodes.set(node, joined);
    bump();
  }
  // Seeds apply wherever the evaluator produces the node's value, not only at the
  // outer query, so a seeded call inside `getProps().store` is visible to `.store`.
  function seeded(node, val) {
    if (node && ts.isAwaitExpression(node)) val = awaitValue(val);
    const seed = seededNodes.get(node);
    return seed ? join(val, seed) : val;
  }

  // ---- origins and member projection ----------------------------------------
  function originValue(target, node) {
    switch (target?.kind) {
      case 'binding': return bindingValue(target.binding);
      case 'external': return authority.external(target.specifier, target.name ?? target.imported ?? '*');
      case 'namespace': return domain.atom('namespace', target.path);
      case 'component': return domain.atom('component', target.path);
      case 'expression': {
        if (!target.node || activeOrigins.has(target.node)) return empty();
        activeOrigins.add(target.node);
        try { return value(target.node); } finally { activeOrigins.delete(target.node); }
      }
      default:
        addError(node, 'unresolved-origin', `Unsupported origin kind: ${target?.kind ?? 'unknown'}.`);
        return empty();
    }
  }
  function namespaceMember(atom, path, name, node) {
    if (name === 'then') return domain.atom('promise-then', path);
    if (name === '*') {
      addError(node, 'computed-authority-access', `Dynamic member access on module namespace ${path} cannot be modeled; use a literal export name.`);
      return authority.project(atom, '*');
    }
    let result = empty();
    for (const target of context.origins.resolveExport(path, name)) result = join(result, originValue(target, node));
    return result;
  }
  // Every member read in this module goes through this projector, so heap spreads of
  // opaque values (authorities, externals, namespaces) either project or fail explicitly.
  // Heap, state and literal values are ordinary data: computed reads on them stay legal.
  function readMember(receiver, key, node, {computed = false} = {}) {
    const projector = (atom, name) => {
      const info = domain.describe(atom);
      if (info.kind === 'unknown-member') return new Set([atom]);
      if (info.kind === 'literal') return empty();
      if (info.kind === 'array-method' && ['call', 'apply', 'bind'].includes(name)) return domain.atom('method', JSON.stringify([atom, name]));
      // Shape-unknown state may expose a method or an ordinary data field. Its
      // tentative callable alternative has no additional data descendants; the
      // accompanying state atom retains those. Definite methods still refuse
      // wildcard projection through the normal authority projector.
      if (tentativeMethod(info)) return empty();
      if (info.kind === 'authority' && info.id === 'window' && name === 'Error') return domain.atom('native-error', 'constructor');
      if (info.kind === 'native-error') {
        if (info.id === 'constructor' && name === 'prototype') return domain.atom('native-error', 'prototype');
        if (info.id === 'prototype' && name === 'constructor') return domain.atom('native-error', 'constructor');
        if (['name', 'length', 'message', 'stack'].includes(name)) return empty();
        addError(node, 'native-error-member', 'This native Error member requires explicit provenance support.');
        return empty();
      }
      if (info.kind === 'bound-function' && ['call','apply','bind'].includes(name)) return domain.atom('method', JSON.stringify([atom,name]));
      if (info.kind === 'promise-constructor') {
        if (name === 'resolve' || name === 'reject') return domain.atom('promise-factory', name);
        addError(node, 'promise-operation', 'This Promise operation requires explicit asynchronous flow review.');
        return empty();
      }
      if (info.kind === 'promise-settle') {
        addError(node, 'promise-operation', 'Invoke Promise settle functions directly; their members are not modeled.');
        return empty();
      }
      if (info.kind === 'async-result') {
        addError(node, 'promise-operation', 'Use await for inspectable local Promise value flow.');
        return empty();
      }
      if (info.kind === 'namespace') return namespaceMember(atom, info.id, name, node);
      const projected = authority.project(atom, name);
      if (!hasKind(projected, 'unknown-member')) return projected;
      if (computed || name === '*') addError(node, 'computed-authority-access', `Dynamic member access on ${describeAtom(info)} cannot be modeled; use a literal member name.`);
      else addError(node, 'unknown-member-access', `Member ${name} of ${describeAtom(info)} is beyond the modeled projection depth.`);
      return projected;
    };
    return domain.read(receiver, key, projector);
  }

  // ---- destructuring ---------------------------------------------------------
  function propertyNameKey(name) {
    if (!name) return '*';
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name) || ts.isPrivateIdentifier(name)) return name.text;
    if (ts.isComputedPropertyName(name)) {
      const key = literalKey(name.expression);
      if (key === '*') evaluate(name.expression);
      return key;
    }
    return '*';
  }
  // Defaults are always joined: the analysis cannot decide whether the incoming value
  // is undefined, so default provenance is part of the conservative result.
  function evaluateDefault(node) {
    if (!node || activeInitializers.has(node)) return empty();
    activeInitializers.add(node);
    try { return evaluate(node); } finally { activeInitializers.delete(node); }
  }
  function bindPattern(name, val, node) {
    if (ts.isIdentifier(name)) {
      const binding = context.symbols.bindingOf(name);
      if (binding) seedBinding(binding, val);
      return;
    }
    if (ts.isObjectBindingPattern(name)) {
      const named = [];
      for (const element of name.elements) {
        if (!ts.isBindingElement(element)) continue;
        if (element.dotDotDotToken) {
          const rest = domain.allocate(`pattern-rest:${nodeId(element)}`, {array: false});
          if (val.size) domain.spread(rest, val, {array: false, shadowed: named});
          bindPattern(element.name, rest, element);
          continue;
        }
        const key = propertyNameKey(element.propertyName ?? element.name);
        if (key !== '*') named.push(key);
        let elementValue = readMember(val, key, element, {computed: key === '*'});
        if (element.initializer) elementValue = join(elementValue, evaluateDefault(element.initializer));
        bindPattern(element.name, elementValue, element);
      }
      return;
    }
    if (ts.isArrayBindingPattern(name)) {
      let index = 0;
      for (const element of name.elements) {
        if (ts.isOmittedExpression(element)) { index++; continue; }
        if (!ts.isBindingElement(element)) continue;
        if (element.dotDotDotToken) {
          const rest = domain.allocate(`pattern-rest:${nodeId(element)}`, {array: true});
          if (val.size) domain.spread(rest, val, {array: true});
          bindPattern(element.name, rest, element);
          continue;
        }
        let elementValue = readMember(val, String(index), element);
        if (element.initializer) elementValue = join(elementValue, evaluateDefault(element.initializer));
        bindPattern(element.name, elementValue, element);
        index++;
      }
      return;
    }
    addError(node ?? name, 'unmodelled-binding', `Unsupported binding pattern: ${ts.SyntaxKind[name.kind]}.`);
  }

  // ---- assignment ------------------------------------------------------------
  function assign(target, rhs, assignNode) {
    if (!target || !(rhs instanceof Set)) return;
    let fact = assignments.get(assignNode);
    if (!fact) {
      fact = {node: assignNode, target, targets: [], leaves: [], value: empty()};
      assignments.set(assignNode, fact);
    }
    fact.value = join(fact.value, rhs);
    assignInto(target, rhs, assignNode, fact);
  }
  function recordLeaf(fact, target, val) {
    const leaf = fact.leaves.find((item) => item.target === target);
    if (leaf) { leaf.value = join(leaf.value, val); return; }
    fact.leaves.push({target, value: val});
    fact.targets.push(target);
  }
  function assignInto(target, rhs, assignNode, fact) {
    if (ts.isIdentifier(target)) {
      recordLeaf(fact, target, rhs);
      const binding = context.symbols.bindingOf(target);
      if (binding) seedBinding(binding, rhs);
      return;
    }
    if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
      recordLeaf(fact, target, rhs);
      const receiver = evaluate(target.expression);
      let key;
      if (ts.isPropertyAccessExpression(target)) key = target.name.text;
      else {
        key = literalKey(target.argumentExpression);
        if (key === '*') {
          evaluate(target.argumentExpression);
          for (const atom of receiver) {
            const info = domain.describe(atom);
            if (DATA_KINDS.has(info.kind) || info.kind === 'unknown-member' || tentativeMethod(info)) continue;
            addError(target, 'computed-authority-access', `Dynamic member assignment on ${describeAtom(info)} cannot be modeled; use a literal member name.`);
          }
        }
      }
      const heaps = filterKinds(receiver, HEAP_KINDS);
      if (heaps.size && rhs.size) domain.write(heaps, key, rhs);
      return;
    }
    if (ts.isParenthesizedExpression(target)) { assignInto(target.expression, rhs, assignNode, fact); return; }
    if (ts.isArrayLiteralExpression(target)) {
      let index = 0;
      for (const element of target.elements) {
        if (ts.isOmittedExpression(element)) { index++; continue; }
        if (ts.isSpreadElement(element)) {
          const rest = domain.allocate(`assign-rest:${nodeId(element)}`, {array: true});
          if (rhs.size) domain.spread(rest, rhs, {array: true});
          assignInto(element.expression, rest, assignNode, fact);
          continue;
        }
        const withDefault = ts.isBinaryExpression(element) && element.operatorToken.kind === ts.SyntaxKind.EqualsToken;
        let elementValue = readMember(rhs, String(index), element);
        if (withDefault) elementValue = join(elementValue, evaluateDefault(element.right));
        assignInto(withDefault ? element.left : element, elementValue, assignNode, fact);
        index++;
      }
      return;
    }
    if (ts.isObjectLiteralExpression(target)) {
      const named = [];
      for (const property of target.properties) {
        if (ts.isShorthandPropertyAssignment(property)) {
          const key = property.name.text;
          named.push(key);
          let propertyValue = readMember(rhs, key, property);
          if (property.objectAssignmentInitializer) propertyValue = join(propertyValue, evaluateDefault(property.objectAssignmentInitializer));
          assignInto(property.name, propertyValue, assignNode, fact);
        } else if (ts.isPropertyAssignment(property)) {
          const key = propertyNameKey(property.name);
          if (key !== '*') named.push(key);
          let propertyValue = readMember(rhs, key, property, {computed: key === '*'});
          const withDefault = ts.isBinaryExpression(property.initializer) && property.initializer.operatorToken.kind === ts.SyntaxKind.EqualsToken;
          if (withDefault) propertyValue = join(propertyValue, evaluateDefault(property.initializer.right));
          assignInto(withDefault ? property.initializer.left : property.initializer, propertyValue, assignNode, fact);
        } else if (ts.isSpreadAssignment(property)) {
          const rest = domain.allocate(`assign-rest:${nodeId(property)}`, {array: false});
          if (rhs.size) domain.spread(rest, rhs, {array: false, shadowed: named});
          assignInto(property.expression, rest, assignNode, fact);
        } else {
          addError(property, 'unmodelled-assignment-target', `Unsupported destructuring assignment property: ${ts.SyntaxKind[property.kind]}.`);
        }
      }
      return;
    }
    addError(target, 'unmodelled-assignment-target', `Unsupported assignment target: ${ts.SyntaxKind[target.kind]}.`);
  }

  // ---- this / values -----------------------------------------------------------
  function instanceOf(classNode) {
    if (!classNode || !ts.isClassLike(classNode)) return null;
    const info = context.info(classNode);
    return info?.class ? (classInstances.get(info.class.id) ?? null) : null;
  }
  function getThisReceiver(node) {
    for (let current = node.parent; current; current = current.parent) {
      if (ts.isArrowFunction(current)) continue;
      if (ts.isClassLike(current)) return instanceOf(current);
      const classMember = ts.isMethodDeclaration(current) || ts.isConstructorDeclaration(current) || ts.isAccessor(current) || ts.isPropertyDeclaration(current)
        || (typeof ts.isClassStaticBlockDeclaration === 'function' && ts.isClassStaticBlockDeclaration(current));
      if (classMember && current.parent && ts.isClassLike(current.parent)) return instanceOf(current.parent);
      if (ts.isFunctionLike(current)) return null;
    }
    return null;
  }
  function identifier(node) {
    const binding = context.symbols.bindingOf(node);
    return seeded(node, binding ? bindingValue(binding) : node.text === 'Promise' ? domain.atom('promise-constructor', 'Promise')
      : node.text === 'Error' ? domain.atom('native-error', 'constructor') : authority.global(node.text));
  }
  function functionValue(node) {
    const info = context.info(node);
    return seeded(node, info?.function ? domain.atom('function', info.function.id) : empty());
  }
  function classValue(node) {
    const info = context.info(node);
    return seeded(node, info?.class ? domain.atom('class', info.class.id) : empty());
  }
  function thisValue(node) {
    if (node.kind === ts.SyntaxKind.SuperKeyword && nativeErrorClasses.has(context.info(node)?.class?.id)
      && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
      addError(node, 'native-error-super-member', 'Inherited Error members require explicit support; use own class members.');
      return empty();
    }
    const receiver = getThisReceiver(node);
    const seed = seededNodes.get(node) ?? null;
    if (receiver || seed) return join(receiver ?? empty(), seed ?? empty());
    addError(node, 'ambiguous-this', 'Unsupported ambiguous this expression; this is only modeled inside class members and arrow functions within them.');
    return empty();
  }
  function allocate(node, {array = false} = {}) {
    return domain.allocate(nodeId(node), {array});
  }

  function property(receiver, key, node, metadata = {}) {
    const computed = Boolean(metadata.computed);
    memberReceivers.set(node, receiver);
    let result = readMember(receiver, key, node, {computed});
    if (!computed && (MUTATORS.has(key) || COPIES.has(key) || ITERATORS.has(key))) {
      // A named field on an ordinary object is not an Array prototype method.
      // Keep definite arrays separate from tentative methods on unknown state.
      for (const tentative of [false, true]) {
        const containers = new Set([...receiver].filter(atom => tentative
          ? domain.describe(atom).kind === 'state' : domain.isArray(atom)));
        if (!containers.size) continue;
        const id = JSON.stringify([nodeId(node), key, tentative]);
        const record = arrayMethods.get(id);
        if (!record) { arrayMethods.set(id, {receiver: containers, key, tentative}); bump(); }
        else {
          const joined = join(record.receiver, containers);
          if (!domain.equal(record.receiver, joined)) { record.receiver = joined; bump(); }
        }
        result = join(result, domain.atom('array-method', id));
      }
    }
    if (onProperty) {
      const extra = onProperty({node, receiver, key, computed}, api);
      if (extra instanceof Set) result = join(result, extra);
    }
    return seeded(node, result);
  }

  // ---- calls -------------------------------------------------------------------
  // Positional arguments before the first spread are exact; everything from the
  // first spread onwards forms a conservative tail shared by later parameters.
  function shapeArguments(args) {
    const fixed = [], sources = [];
    let tail = null;
    for (const arg of Array.isArray(args) ? args : []) {
      const val = arg?.value instanceof Set ? arg.value : empty();
      if (tail === null && !arg?.spread) { fixed.push(val); sources.push(arg); continue; }
      const items = arg?.spread ? readMember(val, '*', arg.node ?? null, {computed: true}) : val;
      tail = join(tail ?? empty(), items);
    }
    return {fixed, tail, sources};
  }
  function unionArgs(current, incoming) {
    const length = Math.max(current.length, incoming.length);
    const result = [];
    for (let index = 0; index < length; index++) {
      const a = current[index];
      const b = incoming[index];
      if (!a) { result.push({node: b.node ?? null, value: b.value instanceof Set ? b.value : empty(), spread: Boolean(b.spread)}); continue; }
      if (!b) { result.push(a); continue; }
      result.push({node: a.node ?? b.node ?? null, value: join(a.value, b.value instanceof Set ? b.value : empty()), spread: Boolean(a.spread || b.spread)});
    }
    return result;
  }
  function bindParameters(record, {fixed, tail, sources}, callNode) {
    const parameters = (record.parameters ?? []).filter((param) => !(ts.isIdentifier(param.name) && param.name.text === 'this'));
    parameters.forEach((param, index) => {
      let received;
      if (!parameterInputs.has(param)) parameterInputs.set(param, new Map());
      const input = sources[index] ?? {value: tail ?? empty(), uncertain: true};
      const inputKey = JSON.stringify([nodeId(callNode ?? record.node), input.node ? nodeId(input.node) : null, Boolean(input.uncertain), Boolean(input.spread)]);
      parameterInputs.get(param).set(inputKey, input);
      if (param.dotDotDotToken) {
        const rest = domain.allocate(`rest:${callNode ? nodeId(callNode) : record.id}:${index}`, {array: true});
        for (let position = index; position < fixed.length; position++) if (fixed[position].size) domain.write(rest, String(position - index), fixed[position]);
        if (tail && tail.size) domain.write(rest, '*', tail);
        received = rest;
      } else {
        received = fixed[index] ?? empty();
        if (tail && index >= fixed.length) received = join(received, tail);
        if (param.initializer && activeParameterDefaults.has(param)) received = join(received, evaluateDefault(param.initializer));
      }
      if (ts.isIdentifier(param.name) && param.modifiers?.some((modifier) => PARAMETER_PROPERTY_MODIFIERS.has(modifier.kind))) {
        const instance = instanceOf(param.parent?.parent);
        if (instance && received.size) domain.write(instance, param.name.text, received);
      }
      bindPattern(param.name, received, param);
    });
  }
  function invokeLocal(fnValue, args, callNode = null, seen = new Set()) {
    let result = empty();
    if (!(fnValue instanceof Set)) return result;
    let shape = null;
    for (const atom of fnValue) {
      const info = domain.describe(atom);
      if (info.kind === 'bound-function') {
        const bound = boundFunctions.get(info.id);
        if (bound && !seen.has(atom)) result = join(result, invokeLocal(bound.target, [...bound.args, ...args], callNode, new Set([...seen, atom])));
        continue;
      }
      if (info.kind !== 'function' && info.kind !== 'snippet') continue;
      const record = info.kind==='snippet' ? context.snippets?.get(info.id) : context.functions.get(info.id);
      if (!record) continue;
      shape ??= shapeArguments(args);
      bindParameters(record, shape, callNode);
      const async = record.node?.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword);
      result = join(result, async ? domain.atom('async-result', record.id) : functionReturns.get(record.id) ?? empty());
    }
    return result;
  }
  // Resolve callable identity without recursively executing functions merely held
  // inside returned data. Bound arguments are applied only by invokeLocal.
  function callableTargets(values, seen = new Set()) {
    let result = empty();
    for (const atom of values) {
      if (seen.has(atom)) continue;
      seen.add(atom);
      const info = domain.describe(atom);
      if (info.kind === 'function' || info.kind === 'snippet') result = join(result, new Set([atom]));
      else if (info.kind === 'bound-function') {
        const bound = boundFunctions.get(info.id);
        if (bound) result = join(result, callableTargets(bound.target, seen));
      }
    }
    return result;
  }
  function awaitValue(values, seen = new Set()) {
    let result = empty();
    for (const atom of values) {
      if (seen.has(atom)) continue;
      const info = domain.describe(atom);
      result = join(result, info.kind === 'async-result'
        ? awaitValue(functionReturns.get(info.id) ?? promiseValues.get(info.id) ?? empty(), new Set([...seen, atom]))
        : new Set([atom]));
    }
    return result;
  }
  function isActiveNode(node) {
    for (let child = node, parent = node?.parent; parent; child = parent, parent = parent.parent) {
      if (ts.isParameter(parent) && parent.initializer === child && !activeParameterDefaults.has(parent)) return false;
    }
    return true;
  }
  function callbackTargets(values, seen = new Set()) {
    let result = callableTargets(values);
    for (const atom of values) {
      if (seen.has(atom)) continue;
      seen.add(atom);
      if (domain.describe(atom).kind === 'heap') result = join(result, callbackTargets(authority.member(new Set([atom]), '*'), seen));
    }
    return result;
  }
  function hasOpaqueEntry(record) {
    const target = [...domain.atom('function', record.id)][0];
    for (const call of calls.values()) {
      if (callableTargets(call.resolvedCallee ?? call.callee).size) continue;
      // Binding a known local function stores arguments; it does not invoke them.
      if (call.method === 'bind' && callableTargets(call.receiver ?? empty()).size) continue;
      for (const invocation of call.invocations?.length ? call.invocations : [call]) {
        const cleanupIndexes = new Set([...invocation.callee].flatMap(atom => authority.anchor(atom)?.cleanupFromArguments ?? []));
        for (const [index, argument] of invocation.args.entries()) {
          if (!cleanupIndexes.has(index) && callbackTargets(argument.value).has(target)) return true;
        }
      }
    }
    return false;
  }
  // Absence of provenance is not proof of undefined or of a supplied value.
  // Suppress a default only when every known input is syntactically definitely
  // supplied, recursively following local aliases/parameters. Unknown external
  // invocation, spread, reassignment, missing argument and cycles stay conservative.
  function definitelySupplied(argument, seen = new Set()) {
    if (!argument || argument.uncertain || argument.spread) return false;
    const node = argument.node;
    if (!node) return argument.value?.size > 0 && [...argument.value].every(atom => ['dispatch','function','bound-function','snippet','heap','literal','authority'].includes(domain.describe(atom).kind));
    if (seen.has(node)) return false;
    const next = new Set([...seen, node]);
    const expression = child => definitelySupplied({node:child}, next);
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node) || isInstantiationExpression(node)) return expression(node.expression);
    if (ts.isConditionalExpression(node)) return expression(node.whenTrue) && expression(node.whenFalse);
    if (ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind === ts.SyntaxKind.CommaToken) return expression(node.right);
      if ([ts.SyntaxKind.BarBarToken,ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) return expression(node.left) && expression(node.right);
      return false;
    }
    if (ts.isIdentifier(node)) {
      const binding = context.symbols.bindingOf(node);
      if (!binding) return false;
      if ([...assignments.values()].some(fact => fact.targets.some(target => ts.isIdentifier(target) && context.symbols.bindingOf(target) === binding))) return false;
      const declarations = binding.declarations.filter(declaration => !declaration.typeOnly);
      return declarations.length > 0 && declarations.every(({node:declaration}) => {
        if (ts.isFunctionDeclaration(declaration) || ts.isClassDeclaration(declaration)) return true;
        if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)) return declaration.initializer && expression(declaration.initializer);
        if (ts.isParameter(declaration) && ts.isIdentifier(declaration.name)) return parameterSupplied(declaration, next);
        return false;
      });
    }
    return ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isClassExpression(node)
      || ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)
      || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)
      || [ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(node.kind);
  }
  function parameterSupplied(param, seen = new Set()) {
    if (seen.has(param)) return false;
    const fn = context.info(param)?.function;
    if (fn && hasOpaqueEntry(fn)) return false;
    const inputs = parameterInputs.get(param);
    return Boolean(inputs?.size) && [...inputs.values()].every(input => definitelySupplied(input, new Set([...seen, param])));
  }
  function seedParameterDefaults() {
    for (const {node} of declarations) {
      if (!ts.isParameter(node)) continue;
      if (node.initializer && !parameterSupplied(node)) {
        if (!activeParameterDefaults.has(node)) { activeParameterDefaults.add(node); bump(); }
        bindPattern(node.name, evaluateDefault(node.initializer), node);
      } else if (!parameterInputs.has(node) && !ts.isIdentifier(node.name)) bindPattern(node.name, empty(), node);
    }
  }
  function constructInstance(classId, args, node) {
    const instance = classInstances.get(classId);
    if (!instance) return empty();
    const record = context.classes.get(classId);
    if (nativeErrorClasses.has(classId) && !record.node.members.some(ts.isConstructorDeclaration)) {
      checkNativeErrorArguments(args, node);
    }
    for (const member of record?.node.members ?? []) {
      if (!ts.isConstructorDeclaration(member) || !member.body) continue;
      const info = context.info(member);
      if (info?.function) invokeLocal(domain.atom('function', info.function.id), args, node);
    }
    return instance;
  }
  function dynamicImport(node, args) {
    const spec = args[0]?.node;
    const specifier = spec && ts.isStringLiteralLike(spec) ? spec.text : null;
    if (!specifier) { addError(node, 'dynamic-import', 'Dynamic import requires a literal string specifier.'); return empty(); }
    const mod = context.info(node)?.module;
    const targets = mod ? context.origins.resolveTarget(mod, specifier, '*') : [];
    if (!targets.length) { addError(node, 'unresolved-dynamic-import', `Cannot establish dynamic import origin for ${specifier}.`); return empty(); }
    let result = empty();
    for (const target of targets) result = join(result, target.kind === 'external' ? authority.external(target.specifier, '*') : originValue(target, node));
    return result;
  }
  function copyOf(node, receiver) {
    const copy = domain.allocate(`array-copy:${nodeId(node)}`, {array: true});
    const containers = filterKinds(receiver, CONTAINER_KINDS);
    if (containers.size) domain.spread(copy, containers, {array: true});
    return copy;
  }
  // The receiver recorded when the method was extracted is authoritative, so an
  // alias such as `const push = list.push; push(x)` still mutates `list`.
  function arrayMethod(node, id, args, explicitReceiver) {
    const [, name] = JSON.parse(id);
    const record = arrayMethods.get(id);
    let receiver = record ? record.receiver : empty();
    if (explicitReceiver instanceof Set) {
      const containers = filterKinds(explicitReceiver, CONTAINER_KINDS);
      const checkId = `${nodeId(node)}:${id}`;
      const previous = arrayReceiverChecks.get(checkId);
      arrayReceiverChecks.set(checkId, {node, value: join(previous?.value ?? empty(), explicitReceiver)});
      receiver = containers;
    }
    const heaps = filterKinds(receiver, HEAP_KINDS);
    const {fixed, tail} = shapeArguments(args);
    const argumentsFrom = (index) => join(...fixed.slice(index), tail ?? empty());
    const writeItems = (items) => { if (heaps.size && items.size) domain.write(heaps, '*', items); };
    const call = calls.get(node);
    if (call) call.invocations.push({callee: domain.atom('array-method', id), args, construct: false, receiver, method: name});
    if (ITERATORS.has(name)) {
      const element = readMember(receiver, '*', node);
      if (args[0] && !['at', 'values', 'entries'].includes(name)) invokeLocal(args[0].value, [
        {node: args[0].node, value: element, spread: false},
        {node: null, value: empty(), spread: false},
        {node: null, value: receiver, spread: false}
      ], node);
      if (['find','findLast','at'].includes(name)) return element;
      if (name === 'values') return copyOf(node, receiver);
      if (name === 'entries') {
        const pair = domain.allocate(`array-entry:${nodeId(node)}`, {array:true});
        domain.write(pair, '1', element);
        const out = domain.allocate(`array-entries:${nodeId(node)}`, {array:true});
        domain.write(out, '*', pair); return out;
      }
      return empty();
    }
    if (MUTATORS.has(name)) {
      if (name === 'sort' && args[0]) {
        const item = readMember(receiver, '*', node);
        invokeLocal(args[0].value, [{node: args[0].node, value:item, spread:false},{node:null,value:item,spread:false}], node);
      }
      if (name === 'push' || name === 'unshift') { writeItems(argumentsFrom(0)); return empty(); }
      if (name === 'splice') { writeItems(argumentsFrom(2)); return copyOf(node, receiver); }
      if (name === 'fill') { writeItems(fixed[0] ?? tail ?? empty()); return receiver; }
      if (name === 'pop' || name === 'shift') return readMember(receiver, '*', node);
      return receiver;
    }
    // map creates elements from callback results; retaining input descendants
    // here would incorrectly reject writes to freshly copied mapped children.
    const copy = name === 'map' || name === 'flatMap'
      ? domain.allocate(`array-copy:${nodeId(node)}`, {array:true})
      : copyOf(node, receiver);
    if (name === 'map' || name === 'flatMap' || name === 'filter') {
      const callback = args[0] && !args[0].spread && args[0].value instanceof Set ? args[0].value : empty();
      const element = readMember(receiver, '*', node);
      const returned = invokeLocal(callback, [
        {node: args[0]?.node ?? null, value: element, spread: false},
        {node: null, value: empty(), spread: false},
        {node: null, value: receiver, spread: false}
      ], node);
      if (name !== 'filter' && returned.size) {
        domain.write(copy, '*', returned);
        if (name === 'flatMap') {
          const nested = filterKinds(returned, CONTAINER_KINDS);
          if (nested.size) domain.spread(copy, nested, {array: true});
        }
      }
    } else if (name === 'concat') {
      for (const arg of args) {
        const val = arg?.value instanceof Set ? arg.value : empty();
        const items = arg?.spread ? readMember(val, '*', arg.node ?? node, {computed: true}) : val;
        const containers = filterKinds(items, CONTAINER_KINDS);
        if (containers.size) domain.spread(copy, containers, {array: true});
        const scalars = without(items, containers);
        if (scalars.size) domain.write(copy, '*', scalars);
      }
    } else if (name === 'flat') {
      const nested = filterKinds(readMember(receiver, '*', node), CONTAINER_KINDS);
      if (nested.size) domain.spread(copy, nested, {array: true});
    }
    return copy;
  }
  function controlMethod(node, atom, args, options, seen) {
    const parts = authority.methodParts(atom);
    if (!parts) return empty();
    const [receiverAtom, name] = parts;
    const receiverInfo = domain.describe(receiverAtom);
    const target = new Set([receiverAtom]);
    if (receiverInfo.kind === 'array-method' && args[0]?.spread && ['call', 'apply', 'bind'].includes(name)) {
      addError(node, 'array-method-receiver', 'A spread cannot establish the array invocation receiver.');
    }
    if (name === 'bind') {
      const id = nodeId(node);
      const boundArgs = args[0]?.spread ? args : args.slice(1);
      const receiver = receiverInfo.kind === 'array-method' ? args[0]?.value ?? empty() : undefined;
      const current = boundFunctions.get(id);
      if (!current) {
        boundFunctions.set(id, {target, args: unionArgs([], boundArgs), receiver});
        bump();
      } else {
        const joinedTarget = join(current.target, target);
        const joinedArgs = unionArgs(current.args, boundArgs);
        const joinedReceiver = current.receiver instanceof Set || receiver instanceof Set ? join(current.receiver ?? empty(), receiver ?? empty()) : undefined;
        const changed = !domain.equal(current.target, joinedTarget)
          || (joinedReceiver instanceof Set && (!(current.receiver instanceof Set) || !domain.equal(current.receiver, joinedReceiver)))
          || joinedArgs.length !== current.args.length
          || joinedArgs.some((arg, index) => !domain.equal(current.args[index].value, arg.value) || current.args[index].spread !== arg.spread);
        if (changed) { current.target = joinedTarget; current.args = joinedArgs; current.receiver = joinedReceiver; bump(); }
      }
      return domain.atom('bound-function', id);
    }
    const forwardedOptions = receiverInfo.kind === 'array-method' ? {...options, callReceiver: args[0]?.value ?? empty()} : options;
    if (name === 'call') return dispatch(node, target, args[0]?.spread ? args : args.slice(1), forwardedOptions, seen);
    if (name === 'apply') {
      const packed = args[1];
      if (!packed) return dispatch(node, target, [], forwardedOptions, seen);
      if (!args[0]?.spread && packed.node && ts.isArrayLiteralExpression(packed.node) && !packed.node.elements.some(ts.isSpreadElement)) {
        const forwarded = [...packed.node.elements].map(element => ({node:element,value:ts.isOmittedExpression(element)?empty():value(element),spread:false}));
        return dispatch(node, target, forwarded, forwardedOptions, seen);
      }
      addError(node,'unmodelled-apply-arguments','Use an explicit argument list or a literal tuple for inspectable apply calls.');
      const forwarded = args[0]?.spread ? args : args.slice(1).map((arg) => ({node: arg.node ?? null, value: arg.value, spread: true}));
      return dispatch(node, target, forwarded, forwardedOptions, seen);
    }
    if (receiverInfo.kind === 'authority') {
      if (receiverInfo.id === 'document' || receiverInfo.id === 'element') {
        if (name === 'querySelectorAll' || name.startsWith('getElementsBy')) return authority.authority('element-collection');
        if (GETTERS.has(name) || name === 'closest') return authority.authority('element');
        if (name === 'getRootNode') return join(authority.authority('document'), authority.authority('element'));
      } else if (receiverInfo.id === 'element-collection') {
        if (name === 'item' || name === 'namedItem') return authority.authority('element');
        if (name === 'forEach' && args[0]) invokeLocal(args[0].value,[{node:args[0].node,value:authority.authority('element'),spread:false}],node);
        if (name === 'values') return new Set([receiverAtom]);
        if (name === 'entries') addError(node,'dom-collection-entries','DOM collection entry tuples are not modeled; iterate values directly.');
      }
    }
    return empty();
  }
  // dispatch never touches the calls map, so recursive .call/.apply/bound dispatch
  // cannot replace the outer semantic call fact recorded by invoke.
  function dispatch(node, callee, args, options, seen) {
    const fact = calls.get(node);
    if (fact) {
      fact.resolvedCallee = join(fact.resolvedCallee ?? empty(), callee);
      fact.invocations.push({callee,args,construct:Boolean(options.construct),receiver:options.receiver});
    }
    let result = empty();
    for (const atom of callee) {
      const info = domain.describe(atom);
      switch (info.kind) {
        case 'import':
          result = join(result, dynamicImport(node, args));
          break;
        case 'promise-then':
          if (args[0]) result = join(result, invokeLocal(args[0].value, [{node: args[0].node ?? null, value: domain.atom('namespace', info.id), spread: false}], node));
          break;
        case 'promise-factory': {
          const id = `promise:${nodeId(node)}`;
          const previous = promiseValues.get(id) ?? empty();
          const next = join(previous, info.id === 'resolve' ? args[0]?.value ?? empty() : empty());
          if (!domain.equal(previous, next)) { promiseValues.set(id, next); bump(); }
          result = join(result, domain.atom('async-result', id));
          break;
        }
        case 'promise-constructor':
          result = join(result, constructPromise(node, args, options));
          break;
        case 'promise-settle':
          settle(node, info.id, args);
          break;
        case 'native-error':
          if (info.id === 'constructor') {
            checkNativeErrorArguments(args, node);
            result = join(result, domain.allocate(`native-error-instance:${nodeId(node)}`));
          } else addError(node, 'native-error-call', 'The native Error prototype is not a supported callable.');
          break;
        case 'function':
          result = join(result, invokeLocal(new Set([atom]), args, node));
          break;
        case 'snippet':
          if(context.renderCalls?.has(node)) invokeLocal(new Set([atom]),args,node);
          else addError(node,'snippet-outside-render','Invoke Svelte snippets with a render tag.');
          break;
        case 'class':
          result = join(result, constructInstance(info.id, args, node));
          break;
        case 'bound-function': {
          if (seen.has(info.id)) break;
          const bound = boundFunctions.get(info.id);
          if (bound) result = join(result, dispatch(node, bound.target, [...bound.args, ...args], bound.receiver instanceof Set ? {...options, callReceiver: bound.receiver} : options, new Set([...seen, info.id])));
          break;
        }
        case 'array-method':
          result = join(result, arrayMethod(node, info.id, args, options.callReceiver));
          break;
        case 'method':
          result = join(result, controlMethod(node, atom, args, options, seen));
          break;
        case 'global': {
          if (info.id === 'Object.create') {
            const created = domain.allocate(`object-create:${nodeId(node)}`, {array:false});
            if (args[0]) domain.spread(created,args[0].value,{array:false});
            if (args[1]) addError(node,'object-property-descriptors','Property descriptors require explicit source review; use plain object construction.');
            result = join(result,created);
          }
          if (info.id === 'Object.assign') {
            const target = args[0]?.value ?? empty();
            const heaps = filterKinds(target, HEAP_KINDS);
            for (const argument of args.slice(1)) if (heaps.size) domain.spread(heaps, argument.value, {array:false});
            result = join(result,target);
          }
          if (info.id === 'Object.setPrototypeOf') {
            const target=args[0]?.value??empty();
            const heaps=filterKinds(target,HEAP_KINDS);
            if(heaps.size&&args[1])domain.spread(heaps,args[1].value,{array:false});
            result=join(result,target);
          }
          break;
        }
        case 'external': {
          const anchor = authority.anchor(atom);
          if (anchor?.result) result = join(result, authority.authority(anchor.result));
          break;
        }
        default:
          break;
      }
    }
    return result;
  }
  // ---- getters and Promise executors -----------------------------------------------
  // An object-literal getter is admitted only as an alias `get k() { return binding; }` of a local, non-rune binding.
  // Binding values are flow-insensitive, so the alias denotes exactly the data property `k: binding` and running it
  // has no other effect. Every other getter body stays refused.
  function getter(node) {
    const statements = node.body?.statements ?? [];
    let expression = statements.length === 1 && ts.isReturnStatement(statements[0]) ? statements[0].expression : null;
    while (expression && (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)
      || ts.isNonNullExpression(expression) || ts.isTypeAssertionExpression(expression) || isInstantiationExpression(expression))) expression = expression.expression;
    const binding = expression && ts.isIdentifier(expression) ? context.symbols.bindingOf(expression) : null;
    const rune = (init) => {
      let callee = init && ts.isCallExpression(init) ? init.expression : null;
      while (callee && ts.isPropertyAccessExpression(callee)) callee = callee.expression;
      return Boolean(callee && ts.isIdentifier(callee) && callee.text.startsWith('$') && !context.symbols.bindingOf(callee));
    };
    const info = context.info(node);
    if (!binding || !binding.declarations.some((declaration) => !declaration.typeOnly) || binding.initializers.some((init) => rune(init.node)) || !info?.function) {
      addError(node, 'GetAccessor', 'Only getters that directly return a local non-rune binding are supported; use a data property or method.');
      return null;
    }
    return functionReturns.get(info.function.id) ?? empty();
  }
  // `new Promise(executor)` runs a local synchronous executor once, with fresh settle functions. Resolved values reach
  // `await` through the existing async-result flow. Settlement, settle-function confinement and executor throws are
  // checked after convergence.
  const localExecutor = (atom) => {
    const d = domain.describe(atom);
    const record = d.kind === 'function' ? context.functions.get(d.id) : null;
    return Boolean(record?.body) && !record.node.asteriskToken && !record.node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
  };
  function constructPromise(node, args, options) {
    const exact = Boolean(options.construct) && args.length === 1 && !args[0].spread;
    const executor = exact ? args[0].value ?? empty() : empty();
    const previous = constructChecks.get(node);
    constructChecks.set(node, {node, exact: exact && (previous?.exact ?? true), value: join(previous?.value ?? empty(), executor)});
    // Only a local synchronous executor is run; anything else is refused after convergence.
    const local = new Set([...executor].filter(localExecutor));
    for (const atom of local) executorIds.add(domain.describe(atom).id);
    const id = `promise:${nodeId(node)}`;
    if (local.size) invokeLocal(local, ['resolve', 'reject'].map((kind) => ({node: null, value: domain.atom('promise-settle', JSON.stringify([id, kind])), spread: false})), node);
    return domain.atom('async-result', id);
  }
  function settle(node, id, args) {
    const [promise, kind] = JSON.parse(id);
    const spread = args.some((arg) => arg.spread) || args.length > 1;
    const value = spread ? empty() : args[0]?.value ?? empty();
    // One call site may settle through both functions (`(ok ? resolve : reject)(v)`); each kind is checked on its own.
    const key = `${nodeId(node)}:${kind}`;
    const check = settleChecks.get(key);
    settleChecks.set(key, {node, kind, spread: spread || Boolean(check?.spread), value: join(check?.value ?? empty(), value)});
    if (kind !== 'resolve' || spread) return;
    const previous = promiseValues.get(promise) ?? empty();
    const next = join(previous, value);
    if (!domain.equal(previous, next)) { promiseValues.set(promise, next); bump(); }
  }
  function deepAtoms(values, seen = new Set()) {
    for (const atom of values) {
      if (seen.has(atom)) continue;
      seen.add(atom);
      if (domain.describe(atom).kind === 'heap') deepAtoms(domain.read(new Set([atom]), '*', (opaque) => new Set([opaque])), seen);
    }
    return seen;
  }
  const onlyKinds = (values, kinds) => [...deepAtoms(values)].every((atom) => kinds.has(domain.describe(atom).kind));
  const holdsSettle = (values) => [...deepAtoms(values)].some((atom) => domain.describe(atom).kind === 'promise-settle');
  const RESOLVED_KINDS = new Set(['heap', 'literal', 'state']);
  const REJECTED_KINDS = new Set(['heap', 'literal']);
  // Functions that may run synchronously while an executor runs: the executor, local callees, callbacks handed to
  // uninspected or array callees, and constructed local classes. An exception there rejects the Promise.
  function executorExtent() {
    const byFunction = new Map();
    for (const call of calls.values()) {
      const owner = context.info(call.node)?.function?.id;
      if (!owner) continue;
      if (!byFunction.has(owner)) byFunction.set(owner, []);
      byFunction.get(owner).push(call);
    }
    const extent = new Set();
    const queue = [...executorIds];
    const add = (id) => { if (id && !extent.has(id)) { extent.add(id); queue.push(id); } };
    while (queue.length) {
      const id = queue.pop();
      extent.add(id);
      for (const call of byFunction.get(id) ?? []) for (const invocation of call.invocations.length ? call.invocations : [call]) {
        const callee = invocation.callee ?? empty();
        const local = callableTargets(callee);
        for (const atom of local) add(domain.describe(atom).id);
        for (const atom of callee) {
          const d = domain.describe(atom);
          if (d.kind !== 'class' || !context.classes.has(d.id)) continue;
          const classNode = context.classes.get(d.id).node;
          for (const [fnId, record] of context.functions) {
            for (let p = record.node; p; p = p.parent) if (p === classNode) { add(fnId); break; }
          }
        }
        if (!local.size) for (const arg of invocation.args ?? []) for (const atom of callbackTargets(arg.value ?? empty())) add(domain.describe(atom).id);
      }
    }
    return extent;
  }
  function checkPromises() {
    for (const {node, exact, value: executor} of constructChecks.values()) {
      if (!exact || !executor.size || ![...executor].every(localExecutor)) {
        addError(node, 'promise-operation', 'Promise executors require explicit asynchronous flow review; use one local synchronous executor with new.', true);
      }
    }
    for (const {node, kind, spread, value} of settleChecks.values()) {
      if (spread) addError(node, 'promise-settle', 'Settle a Promise with at most one explicit argument.', true);
      else if (kind === 'reject' && !onlyKinds(value, REJECTED_KINDS)) {
        addError(node, 'promise-rejection', 'Rejection values reach catch bindings, which are not modeled; reject with plain data.', true);
      } else if (kind === 'resolve') {
        const heaps = filterKinds(value, HEAP_KINDS);
        const then = heaps.size ? domain.read(heaps, 'then', (opaque) => new Set([opaque])) : empty();
        if ([...then].some((atom) => !DATA_KINDS.has(domain.describe(atom).kind))) addError(node, 'promise-thenable', 'Resolving with a then member runs it asynchronously; resolve with plain data.', true);
        else if (!onlyKinds(value, RESOLVED_KINDS)) addError(node, 'promise-resolution', 'Resolve Promise executors with plain data; authority, callables and Promises are not modeled through resolution.', true);
      }
    }
    // Settle functions may live only in bindings and parameters, be passed to inspected local functions, and be invoked.
    for (const call of calls.values()) for (const invocation of call.invocations.length ? call.invocations : [call]) {
      const callee = invocation.callee ?? empty();
      const localOnly = callee.size > 0 && callableTargets(callee).size > 0
        && [...callee].every((atom) => ['function', 'bound-function'].includes(domain.describe(atom).kind));
      if (localOnly) continue;
      if ((invocation.args ?? []).some((arg) => holdsSettle(arg.value ?? empty()))) {
        addError(call.node, 'promise-settle-escape', 'Promise settle functions must not reach uninspected callees.', true);
      }
    }
    for (const fact of assignments.values()) for (const leaf of fact.leaves ?? []) {
      if (!ts.isIdentifier(leaf.target) && holdsSettle(leaf.value)) addError(fact.node, 'promise-settle-escape', 'Promise settle functions must stay in local bindings.', true);
    }
    for (const {node, runtime} of context.nodes) {
      if (!runtime || !(ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node))) continue;
      if (holdsSettle(value(node))) addError(node, 'promise-settle-escape', 'Promise settle functions must stay in local bindings.', true);
    }
    // A template expression hands its value to Svelte, the DOM or a component, none of which is an inspected callee.
    for (const unit of context.units.keys()) {
      const root = unit.kind === 'template' ? unit.sourceFile.statements[0]?.expression : null;
      if (root && holdsSettle(value(root))) addError(root, 'promise-settle-escape', 'Promise settle functions must not reach templates.', true);
    }
    for (const [id, returned] of functionReturns) if (holdsSettle(returned)) {
      addError(context.functions.get(id)?.node ?? null, 'promise-settle-escape', 'Promise settle functions must not be returned.', true);
    }
    if (!executorIds.size) return;
    const extent = executorExtent();
    for (const {node, runtime} of context.nodes) {
      if (!runtime || !ts.isThrowStatement(node) || !extent.has(context.info(node)?.function?.id)) continue;
      if (!onlyKinds(evaluate(node.expression), REJECTED_KINDS)) {
        addError(node, 'promise-executor-throw', 'An exception thrown while a Promise executor runs rejects it; catch bindings are not modeled. Throw or reject with plain data.', true);
      }
    }
  }
  function invoke(node, callee, args, {construct = false} = {}) {
    const list = Array.isArray(args) ? args : [];
    if (node?.expression?.kind === ts.SyntaxKind.SuperKeyword && nativeErrorClasses.has(context.info(node)?.class?.id)) {
      checkNativeErrorArguments(list, node);
    }
    let receiver = null;
    let method = null;
    const target = node?.expression ?? node?.tag ?? null;
    if (target && (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target))) {
      receiver = memberReceivers.get(target) ?? evaluate(target.expression);
      method = ts.isPropertyAccessExpression(target) ? target.name.text : literalKey(target.argumentExpression);
    }
    const fact = {node, callee, resolvedCallee: empty(), invocations: [], args: list, construct: Boolean(construct), receiver, method};
    calls.set(node, fact);
    let result = dispatch(node, callee, list, {construct: Boolean(construct), receiver}, new Set());
    if (onInvoke) {
      const extra = onInvoke(fact, api);
      if (extra instanceof Set) result = join(result, extra);
    }
    return seeded(node, result);
  }

  const evaluate = createExpressionEvaluator({
    domain, identifier, functionValue, classValue, thisValue, allocate, property, invoke, assign, seeded,
    computedKey: (node, keyValue) => computedKeyChecks.set(node, keyValue),
    getter,
    unsupported: (node, construct, message) => addError(node, construct, message)
  });

  function value(node) {
    if (!node) return empty();
    let result;
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isAccessor(node)) result = functionValue(node);
    else if (ts.isClassDeclaration(node)) result = classValue(node);
    else if (ts.isExpression(node)) result = evaluate(node);
    else if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) && ts.isIdentifier(node.name)) result = bindingValue(context.symbols.bindingOf(node.name));
    else result = empty();
    return seeded(node, result);
  }

  function collectReturns(body) {
    let result = empty();
    const walk = (node) => {
      if (!node) return;
      if (ts.isReturnStatement(node)) {
        if (node.expression) result = join(result, evaluate(node.expression));
        return;
      }
      if (ts.isFunctionLike(node) && node !== body) return;
      ts.forEachChild(node, walk);
    };
    walk(body);
    return result;
  }

  // ---- declarations ------------------------------------------------------------
  const declarations = [];
  {
    const seen = new Set();
    for (const binding of context.symbols.bindings) {
      for (const record of binding.declarations) {
        if (record.typeOnly || !record.node || seen.has(record.node)) continue;
        seen.add(record.node);
        declarations.push({node: record.node, unit: record.unit, binding});
      }
    }
  }
  function seedDeclaration({node, unit, binding}) {
    if (ts.isVariableDeclaration(node)) {
      if (!node.initializer || unit?.kind === 'binding' || (node.parent && ts.isCatchClause(node.parent))) return;
      bindPattern(node.name, value(node.initializer), node);
    } else if (ts.isParameter(node)) {
      // Parameter defaults are considered only after actual inputs stabilize.
    } else if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
      seedBinding(binding, functionValue(node));
    } else if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      seedBinding(binding, classValue(node));
    } else if (ts.isEnumDeclaration(node)) {
      const heap = domain.allocate(`enum:${nodeId(node)}`, {array: false});
      for (const member of node.members) {
        if (!member.initializer) continue;
        const val = evaluate(member.initializer);
        if (val.size) domain.write(heap, propertyNameKey(member.name), val);
      }
      seedBinding(binding, heap);
    }
  }
  function containsNativeError(values, seen = new Set()) {
    for (const atom of values) {
      if (seen.has(atom)) continue;
      seen.add(atom);
      const info = domain.describe(atom);
      if (info.kind === 'native-error') return true;
      if (info.kind === 'heap' && containsNativeError(domain.read(new Set([atom]), '*', opaque => new Set([opaque])), seen)) return true;
    }
    return false;
  }
  function isAmbientObject(values) {
    return [...values].some(atom => {
      const info = domain.describe(atom);
      return info.kind === 'authority' && info.id === 'window';
    });
  }
  function writesNativeError(target) {
    if (ts.isIdentifier(target)) return target.text === 'Error' && !context.symbols.bindingOf(target);
    if (!ts.isPropertyAccessExpression(target) && !ts.isElementAccessExpression(target)) return false;
    const receiver = value(target.expression);
    if ([...receiver].some(atom => domain.describe(atom).kind === 'native-error')) return true;
    const key = ts.isPropertyAccessExpression(target) ? target.name.text : literalKey(target.argumentExpression);
    return isAmbientObject(receiver) && (key === 'Error' || key === '*');
  }
  // Native-base acceptance is a final provenance check. The ordinary solver has
  // already followed aliases, destructuring paths, parameters and helper returns.
  // Rebinding a local alias is not a write to the object the alias once denoted.
  function nativeErrorCompromised() {
    for (const assignment of assignments.values()) {
      if ((assignment.targets ?? [assignment.target]).some(writesNativeError)) return true;
    }
    for (const {node, runtime} of context.nodes) {
      if (runtime && ts.isDeleteExpression(node) && writesNativeError(node.expression)) return true;
    }
    const ambientMutators = new Set(['Object.assign', 'Object.defineProperty', 'Object.defineProperties',
      'Object.setPrototypeOf', 'Reflect.set', 'Reflect.defineProperty', 'Reflect.deleteProperty', 'Reflect.setPrototypeOf']);
    for (const call of calls.values()) for (const invocation of call.invocations) {
      const callee = [...invocation.callee].map(atom => domain.describe(atom));
      if (callee.some(info => info.kind === 'global' && ambientMutators.has(info.id))
        && isAmbientObject(invocation.args[0]?.value ?? empty())) return true;
      const inspected = callee.length > 0 && callee.every(info =>
        info.kind === 'function' && context.functions.get(info.id)?.body
        || info.kind === 'class' && context.classes.has(info.id)
        || ['array-method', 'bound-function'].includes(info.kind)
        || info.kind === 'native-error' && info.id === 'constructor'
        || info.kind === 'method' && ['call', 'apply', 'bind'].includes(JSON.parse(info.id)[1]));
      if (!inspected && invocation.args.some(argument => containsNativeError(argument.value))) return true;
    }
    return false;
  }
  function nativeErrorBase(record) {
    const clauses = record.node.heritageClauses;
    if (clauses?.length !== 1 || clauses[0].token !== ts.SyntaxKind.ExtendsKeyword
      || clauses[0].types.length !== 1) return false;
    const base = clauses[0].types[0];
    return !base.typeArguments?.length && ts.isIdentifier(base.expression) && base.expression.text === 'Error'
      && !context.symbols.bindingOf(base.expression);
  }
  function checkNativeErrorArguments(args, node) {
    if (args.length > 1 || args.some(argument => argument.spread)) {
      addError(node, 'native-error-options', 'Error options and spread arguments can carry authority; use an explicit own field instead.');
    }
  }
  function seedClass(classId, record) {
    if (record.node.heritageClauses?.length) {
      if (nativeErrorBase(record)) nativeErrorClasses.add(classId);
      else addError(record.node,'class-inheritance','Class inheritance is outside the supported value-flow subset.');
    }
    if (nativeErrorClasses.has(classId)) {
      for (const member of record.node.members) if (ts.isConstructorDeclaration(member) && member.body) {
        const visit = node => {
          if (ts.isFunctionLike(node) || ts.isClassLike(node)) return;
          if (ts.isReturnStatement(node) && node.expression) addError(node, 'native-error-constructor-return', 'An alternate Error constructor result requires explicit authority flow support.');
          ts.forEachChild(node, visit);
        };
        visit(member.body);
      }
    }
    for (const member of record.node.members) {
      if (ts.isAccessor(member)) addError(member,'class-accessor','Use explicit methods for inspectable class authority flow.');
      if (member.modifiers?.some(m=>m.kind===ts.SyntaxKind.StaticKeyword)) addError(member,'class-static-member','Static class member authority flow is not modeled.');
    }
    const instance = classInstances.get(classId);
    if (!instance) return;
    for (const member of record.node.members) {
      if (!member.name || member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword)) continue;
      if (ts.isMethodDeclaration(member) && member.body) {
        const info = context.info(member);
        if (info?.function) domain.write(instance, propertyNameKey(member.name), domain.atom('function', info.function.id));
      } else if (ts.isPropertyDeclaration(member) && member.initializer) {
        const val = evaluate(member.initializer);
        if (val.size) domain.write(instance, propertyNameKey(member.name), val);
      }
    }
  }

  const api = {domain, authority, seedBinding, seedNode, invokeLocal, callableTargets, isActiveNode, reportUnsupported: addError, property, member: readMember, bindingValue, value};

  function solve() {
    converged = false;
    // Type/framework seeding may supply a receiver or resolve a callable after
    // the initial flow solve. Recompute absence-dependent guards each solve.
    deferredErrors.length = 0;
    let pass = 0;
    while (pass < maxPasses) {
      const before = internalRevision + domain.revision;
      for(const record of context.snippets?.values()??[])seedBinding(record.binding,domain.atom('snippet',record.id));
      for (const imported of context.symbols.imports) {
        if (imported.typeOnly) continue;
        for (const target of context.origins.resolveBinding(imported.binding)) seedBinding(imported.binding, originValue(target, imported.node));
      }
      for (const [classId, record] of context.classes) seedClass(classId, record);
      for (const declaration of declarations) seedDeclaration(declaration);
      for (const {node,runtime} of context.nodes) if (runtime && (ts.isForOfStatement(node) || ts.isForInStatement(node))) {
        const item = ts.isForOfStatement(node) ? readMember(value(node.expression),'*',node) : empty();
        if (ts.isVariableDeclarationList(node.initializer)) for (const declaration of node.initializer.declarations) bindPattern(declaration.name,item,declaration);
        else assign(node.initializer,item,node);
      }
      for (const [functionId, record] of context.functions) {
        if (!record.body) continue;
        const returned = ts.isBlock(record.body) ? collectReturns(record.body) : evaluate(record.body);
        const previous = functionReturns.get(functionId) ?? empty();
        const joined = join(previous, returned);
        if (!domain.equal(previous, joined)) { functionReturns.set(functionId, joined); bump(); }
      }
      for (const record of context.nodes) {
        const node = record.node;
        if (!record.runtime || !ts.isExpression(node)) continue;
        if (node.parent && ts.isExpression(node.parent)) continue;
        if (ts.isOmittedExpression(node) || ts.isPrivateIdentifier(node)) continue;
        if (ts.isIdentifier(node) && !context.isReference(node)) continue;
        evaluate(node);
      }
      pass++;
      if (internalRevision + domain.revision === before) {
        seedParameterDefaults();
        if (internalRevision + domain.revision === before) { converged = true; break; }
      }
    }
    // Unknown data is not proof of a primitive key. It remains a manual review
    // obligation; known objects/capabilities may execute implicit conversion code
    // and still require explicit support. Check after flow has converged so late
    // aliases and parameter inputs cannot remove this refusal.
    if (converged) for (const [node, keyValue] of computedKeyChecks) {
      if ([...keyValue].some(atom => !['literal','state'].includes(domain.describe(atom).kind))) {
        addError(node, 'ComputedPropertyName', 'Object or capability key conversion cannot be safely modeled.', true);
      }
    }
    if (converged) for (const check of arrayReceiverChecks.values()) {
      const containers = filterKinds(check.value, CONTAINER_KINDS);
      if (!containers.size || [...check.value].some(atom => !CONTAINER_KINDS.has(domain.describe(atom).kind) && !tentativeMethod(domain.describe(atom)))) {
        addError(check.node, 'array-method-receiver', 'Array invocation controls require an inspectable data receiver.', true);
      }
    }
    if (converged) checkPromises();
    if (converged && nativeErrorClasses.size && nativeErrorCompromised()) {
      for (const id of nativeErrorClasses) addError(context.classes.get(id).node, 'class-inheritance',
        'The native Error base or prototype may be replaced, mutated or exposed; inherited authority cannot be established.', true);
    }
    if (!converged) {
      const mod = context.modules[0];
      const span = mod && typeof mod.span === 'function' ? mod.span(0, 0) : ZERO_SPAN;
      const message = `Flow analysis failed to converge within ${maxPasses} passes.`;
      const key = `${mod?.path ?? ''}:${span.start.offset}:solve:${message}`;
      if (!errorKeys.has(key)) {
        errorKeys.add(key);
        errors.push({code: 'non-convergence', construct: 'solve', path: mod?.path ?? '', span, message});
      }
    }
    return {complete: context.complete && errors.length === 0 && deferredErrors.length === 0 && converged};
  }

  solve();

  const allErrors = () => {
    const combined = [...context.errors, ...errors, ...deferredErrors];
    const seen = new Set();
    const unique = [];
    for (const error of combined) {
      const key = `${error.path}:${error.span?.start?.offset ?? 0}:${error.construct}:${error.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(error);
    }
    unique.sort((a, b) => (a.path || '').localeCompare(b.path || '') || (a.span?.start?.offset ?? 0) - (b.span?.start?.offset ?? 0) || (a.construct || '').localeCompare(b.construct || ''));
    return unique;
  };

  return {
    domain, authority, value, bindingValue, seedBinding, seedNode, invokeLocal, callableTargets, isActiveNode, reportUnsupported: addError, property, member: readMember, calls, assignments,
    get errors() { return allErrors(); },
    get revision() { return internalRevision + domain.revision; },
    solve,
    get limitations() { return [...computedKeyChecks.keys()].map(node => ({
      code: 'opaque-property-key-coercion', path: context.info(node).module.path, span: context.span(node),
      message: 'Dynamic key conversion may invoke user code. Independently review the key source and any coercion; wildcard value propagation does not prove key purity.'
    })); },
    get complete() { return context.complete && allErrors().length === 0 && converged; }
  };
}
