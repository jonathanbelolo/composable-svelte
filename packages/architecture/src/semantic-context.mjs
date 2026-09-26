// Common source/symbol identity for dataflow, zones and diagnostics. This is not
// an evaluator and never produces an architectural qualification verdict.
import ts from 'typescript';
import {parseSemanticModules} from './semantic-parse.mjs';
import {buildSymbols} from './symbols.mjs';
import {buildOrigins} from './semantic-origins.mjs';
import {isInstantiationExpression} from './expression-values.mjs';

export function buildSemanticContext({projectRoot, graph}) {
  const parsed = parseSemanticModules({projectRoot, graph});
  const errors = [...parsed.errors];
  if (errors.length) return {complete: false, errors, modules: parsed.modules};
  const symbols = buildSymbols({modules: parsed.modules});
  const origins = buildOrigins({modules: parsed.modules, symbols, graph});
  errors.push(...symbols.errors, ...origins.errors);
  const info = new WeakMap();
  const units = new Map();
  const functions = new Map();
  const classes = new Map();
  const nodes = [];
  const snippets = new Map(), snippetScopes = new Map(), renderCalls = new Set();
  for(const module of parsed.modules) for(const marker of module.markers) {
    if(marker.kind==='snippet-declaration') {
      const record={id:`snippet:${module.path}:${marker.node.start}`,module,marker,scope:marker.scope,
        binding:resolveName(marker.declarationScope,marker.name),
        parameters:marker.parameterUnits.map(unit=>unit?.sourceFile.statements[0]?.declarationList?.declarations[0]).filter(Boolean)};
      snippets.set(record.id,record);snippetScopes.set(marker.scope,record);
    }
    if(marker.kind==='render-tag') {
      let expression=marker.expressionUnit?.sourceFile.statements[0]?.expression;
      while(expression&&ts.isParenthesizedExpression(expression))expression=expression.expression;
      if(expression&&ts.isCallExpression(expression))renderCalls.add(expression);
      else errors.push({code:'unsupported-construct',construct:'render-expression',path:module.path,span:marker.span,message:'Render expression is not an inspectable call.'});
    }
  }
  function snippetFor(unit) {for(let scope=unit.scope;scope;scope=scope.parent)if(snippetScopes.has(scope))return snippetScopes.get(scope);return null;}
  const functionNodes = new Map(symbols.functions.map((record) => [record.node, record]));
  const id = (module, unit, node) => `${module.path}:${unit.base + node.getStart(unit.sourceFile)}:${ts.SyntaxKind[node.kind]}`;
  for (const module of parsed.modules) for (const unit of module.units) {
    units.set(unit, module);
    const walk = (node, parentFunction, parentClass, parentRuntime) => {
      const functionRecord = functionNodes.get(node);
      let fn = parentFunction;
      let cls = parentClass;
      if (ts.isClassLike(node)) {
        cls = {id: id(module, unit, node), node, unit, module, parentFunction};
        classes.set(cls.id, cls);
      }
      if (functionRecord) {
        fn = {...functionRecord, id: id(module, unit, node), module, parent: parentFunction, class: cls};
        functions.set(fn.id, fn);
      }
      // An instantiation expression (`f<T>`) is a TypeNode kind to TypeScript but evaluates its expression at runtime;
      // only its type arguments are type-only.
      const typeOnly = (ts.isTypeNode(node) && !isInstantiationExpression(node)) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
        || ts.isImportDeclaration(node) || ts.isExportDeclaration(node);
      const runtime = parentRuntime && !typeOnly && unit.kind !== 'binding';
      // Template binding patterns (snippet parameters, {#each} items, {@const} and {:then}/{:catch} patterns) are declarations
      // only: a default initializer there is never evaluated, so it is refused rather than silently skipped.
      if (unit.kind === 'binding' && (ts.isVariableDeclaration(node) || ts.isBindingElement(node)) && node.initializer) {
        errors.push({code: 'unsupported-construct', construct: 'template-binding-default', path: module.path, span: unit.nodeSpan(node),
          message: 'Defaults in snippet parameters and in {#each}, {@const} and {#await} destructuring are not analyzed; pass the value explicitly or apply the default in script.'});
      }
      // A computed key in such a pattern is a runtime expression that is likewise never evaluated.
      if (unit.kind === 'binding' && ts.isComputedPropertyName(node) && node.parent && ts.isBindingElement(node.parent) && node.parent.propertyName === node) {
        errors.push({code: 'unsupported-construct', construct: 'template-binding-computed-key', path: module.path, span: unit.nodeSpan(node),
          message: 'Computed keys in snippet parameters and in {#each}, {@const} and {#await} destructuring are not analyzed; use a literal key or destructure in script.'});
      }
      const record = {node, unit, module, function: fn, class: cls, snippet:snippetFor(unit), runtime, id: id(module, unit, node)};
      info.set(node, record);
      nodes.push(record);
      ts.forEachChild(node, (child) => walk(child, fn, cls, runtime));
    };
    walk(unit.sourceFile, null, null, true);
  }
  function span(node) {
    const item = info.get(node);
    if (!item) throw new TypeError('Node is outside the semantic context.');
    return item.unit.nodeSpan(node);
  }
  function resolveName(scope, name) {
    for (let current = scope; current; current = current.parent) if (current.bindings.has(name)) return current.bindings.get(name);
    return null;
  }
  function isReference(node) {
    const item = info.get(node);
    if (!item?.runtime || !ts.isIdentifier(node)) return false;
    const parent = node.parent;
    if (!parent) return false;
    if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
    if (ts.isLabeledStatement(parent) && parent.label === node) return false;
    if (ts.isBreakOrContinueStatement(parent)) return false;
    if (ts.isBindingElement(parent) && (parent.name === node || parent.propertyName === node)) return false;
    if (parent.name === node && (ts.isVariableDeclaration(parent) || ts.isParameter(parent)
      || ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent)
      || ts.isClassDeclaration(parent) || ts.isClassExpression(parent)
      || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)
      || ts.isMethodDeclaration(parent) || ts.isGetAccessorDeclaration(parent)
      || ts.isSetAccessorDeclaration(parent) || ts.isEnumMember(parent))) return false;
    return true;
  }
  // Origin lookup can discover ambiguity lazily through namespace members.
  const currentErrors = () => [...new Set([...errors, ...origins.errors])];
  return {get complete() {return currentErrors().length === 0;}, get errors() {return currentErrors();}, modules: parsed.modules, symbols, origins, units, nodes, functions, classes, snippets, renderCalls, snippetFor,
    info: (node) => info.get(node) ?? null, span, resolveName, isReference};
}
