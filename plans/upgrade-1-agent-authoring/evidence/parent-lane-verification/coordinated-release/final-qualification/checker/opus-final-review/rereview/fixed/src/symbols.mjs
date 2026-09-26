// Lexical collection only. Value provenance and execution zones are separate passes.
import ts from 'typescript';
import {isInstantiationExpression} from './expression-values.mjs';

export function buildSymbols({modules}) {
  // This collector augments fresh parser scopes exactly once. Reusing an already
  // collected graph must fail, rather than returning a silently partial binding list.
  if (!Array.isArray(modules) || modules.some((module) => module.scopes.some((scope) => scope.bindings.size > 0))) {
    throw new TypeError('buildSymbols requires freshly parsed, unbound module scopes.');
  }
  const scopes = new WeakMap();
  const declarationBindings = new WeakMap();
  const bindings = [];
  const functions = [];
  const imports = [];
  const exports = [];
  const errors = [];
  const unitsByNode = new WeakMap();
  const candidates = [];
  let serial = 0;
  function error(module, unit, node, construct, message) {
    errors.push({code: 'unsupported-construct', construct, path: module.path,
      span: unit.nodeSpan ? unit.nodeSpan(node) : module.span(Math.max(unit.start, unit.base + node.getStart(unit.sourceFile)), Math.min(unit.end, unit.base + node.end)), message});
  }
  function nested(module, parent, kind) {
    const scope = {id: `semantic:${serial++}`, parent, kind, bindings: new Map()};
    module.scopes.push(scope);
    return scope;
  }
  function lookup(scope, name) {
    for (let current = scope; current; current = current.parent) if (current.bindings.has(name)) return current.bindings.get(name);
    return null;
  }
  function scopeOf(node) {return scopes.get(node) ?? null;}
  function bindingOf(node) {
    if (!node || !ts.isIdentifier(node)) return null;
    return declarationBindings.get(node) ?? lookup(scopeOf(node), node.text);
  }
  function varScope(scope) {
    let result = scope;
    while (result.parent && !['function', 'module', 'instance', 'ambient-namespace'].includes(result.kind)) result = result.parent;
    return result;
  }
  function declare(module, unit, name, scope, declaration, options = {}) {
    if (!ts.isIdentifier(name)) {
      error(module, unit, name, 'unmodelled-binding', 'A lexical binding requires an identifier or supported destructuring pattern.');
      return null;
    }
    let value = scope.bindings.get(name.text);
    if (!value) {
      value = {id: `${module.path}:binding:${bindings.length}`, name: name.text, scope, declarations: [], initializers: [], assignments: []};
      scope.bindings.set(name.text, value);
      bindings.push(value);
    }
    const record = {node: declaration, name, unit, path: options.path ?? [], rest: Boolean(options.rest), defaults: options.defaults ?? [], typeOnly: Boolean(options.typeOnly)};
    value.declarations.push(record);
    if (options.source) value.initializers.push({...record, node: options.source});
    declarationBindings.set(name, value);
    scopes.set(name, scope);
    return value;
  }
  function propertyKey(name) {
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
    if (ts.isComputedPropertyName(name) && (ts.isStringLiteralLike(name.expression) || ts.isNumericLiteral(name.expression))) return name.expression.text;
    return '*';
  }
  function pattern(module, unit, name, scope, declaration, options = {}) {
    if (ts.isIdentifier(name)) {declare(module, unit, name, scope, declaration, options); return;}
    if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      name.elements.forEach((element, index) => {
        if (ts.isOmittedExpression(element)) return;
        const key = ts.isArrayBindingPattern(name) ? String(index) : element.propertyName ? propertyKey(element.propertyName) : ts.isIdentifier(element.name) ? element.name.text : '*';
        const defaults = [...(options.defaults ?? []), ...(element.initializer ? [{node: element.initializer, unit, depth: (options.path ?? []).length + 1}] : [])];
        pattern(module, unit, element.name, scope, declaration, {...options, path: [...(options.path ?? []), key], rest: options.rest || Boolean(element.dotDotDotToken), defaults});
      });
      return;
    }
    error(module, unit, name, 'unmodelled-binding', `Unsupported declaration pattern: ${ts.SyntaxKind[name.kind]}`);
  }
  function walk(module, unit, node, parentScope) {
    let scope = parentScope;
    unitsByNode.set(node, unit);
    const inAmbientNamespace = parentScope.kind === 'ambient-namespace';
    const isAmbientNamespace = ts.isModuleDeclaration(node) && !ts.isStringLiteral(node.name) && (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword) || inAmbientNamespace);
    if (ts.isFunctionDeclaration(node) && node.name) declare(module, unit, node.name, parentScope, node, {source: node, typeOnly: inAmbientNamespace});
    if (ts.isClassDeclaration(node) && node.name) declare(module, unit, node.name, parentScope, node, {source: node, typeOnly: inAmbientNamespace});
    const isFunction = ts.isFunctionLike(node) && (Boolean(node.body) || ts.isFunctionDeclaration(node));
    if (isFunction) {
      scope = nested(module, parentScope, 'function');
      if (ts.isFunctionExpression(node) && node.name) declare(module, unit, node.name, scope, node, {source: node});
      for (const parameter of node.parameters) pattern(module, unit, parameter.name, scope, parameter, {source: parameter.initializer, rest: Boolean(parameter.dotDotDotToken)});
      functions.push({node, unit, scope, parameters: [...node.parameters], body: node.body ?? null});
    } else if (ts.isClassLike(node)) {
      scope = nested(module, parentScope, 'class');
      if (ts.isClassExpression(node) && node.name) declare(module, unit, node.name, scope, node, {source: node});
    } else if (ts.isCatchClause(node)) {
      scope = nested(module, parentScope, 'catch');
      if (node.variableDeclaration) pattern(module, unit, node.variableDeclaration.name, scope, node.variableDeclaration);
    } else if (isAmbientNamespace) {
      declare(module, unit, node.name, parentScope, node, {typeOnly: true});
      scope = nested(module, parentScope, 'ambient-namespace');
    } else if (ts.isBlock(node) || ts.isCaseBlock(node) || ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      scope = nested(module, parentScope, 'block');
    } else if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
      declare(module, unit, node.name, parentScope, node, {typeOnly: true});
      scope = nested(module, parentScope, 'type');
    } else if (ts.isEnumDeclaration(node)) {
      declare(module, unit, node.name, parentScope, node, {source: node});
      scope = nested(module, parentScope, 'enum');
    }
    scopes.set(node, scope);
    if (ts.isVariableDeclaration(node) && !ts.isCatchClause(node.parent)) {
      const list = node.parent;
      const isVar = ts.isVariableDeclarationList(list) && !(list.flags & ts.NodeFlags.BlockScoped);
      pattern(module, unit, node.name, isVar ? varScope(scope) : scope, node, {source: unit.kind === 'binding' ? undefined : node.initializer, typeOnly: inAmbientNamespace});
    }
    if (ts.isTypeParameterDeclaration(node)) declare(module, unit, node.name, scope, node, {typeOnly: true});
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const add = (name, imported, typeOnly) => {
        const binding = declare(module, unit, name, scope, node, {typeOnly});
        imports.push({binding, specifier: node.moduleSpecifier.text, imported, typeOnly, unit, node});
      };
      if (clause?.name) add(clause.name, 'default', clause.isTypeOnly);
      if (clause?.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) add(clause.namedBindings.name, '*', clause.isTypeOnly);
        else for (const item of clause.namedBindings.elements) add(item.name, (item.propertyName ?? item.name).text, clause.isTypeOnly || item.isTypeOnly);
      }
    }
    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node) || node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) exports.push({node, unit, scope});
    if (ts.isModuleDeclaration(node) && !ts.isStringLiteral(node.name) && !isAmbientNamespace) {
      error(module, unit, node, 'ts-namespace-value', 'Runtime TypeScript namespaces are not modeled.');
    }
    if (ts.isWithStatement(node)) error(module, unit, node, 'with-statement', 'with changes lexical lookup dynamically.');
    if (ts.isImportEqualsDeclaration(node)) error(module, unit, node, 'import-equals', 'Import-equals bindings are not modeled.');
    if (ts.isIdentifier(node) || ts.isBinaryExpression(node) || ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) candidates.push({node, unit, module});
    ts.forEachChild(node, (child) => walk(module, unit, child, scope));
  }
  for (const module of [...modules].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    for (const scope of module.scopes) scope.kind ??= scope.parent ? 'template' : 'module';
    for (const unit of module.units) if (unit.kind === 'view') unit.scope.kind = 'instance';
    // Declarations are all collected before any identifier is resolved, including
    // template snippets referenced before their textual declaration.
    for (const unit of module.units) walk(module, unit, unit.sourceFile, unit.scope);
  }
  function recordAssignment(target, record) {
    if (ts.isIdentifier(target)) {
      const value = bindingOf(target);
      if (value) value.assignments.push(record);
    } else if (ts.isParenthesizedExpression(target)) recordAssignment(target.expression, record);
    else if (ts.isArrayLiteralExpression(target)) for (const item of target.elements) recordAssignment(ts.isSpreadElement(item) ? item.expression : item, record);
    else if (ts.isObjectLiteralExpression(target)) for (const item of target.properties) {
      if (ts.isShorthandPropertyAssignment(item)) recordAssignment(item.name, record);
      else if (ts.isPropertyAssignment(item)) recordAssignment(item.initializer, record);
      else if (ts.isSpreadAssignment(item)) recordAssignment(item.expression, record);
    }
    else if (ts.isBinaryExpression(target) && target.operatorToken.kind === ts.SyntaxKind.EqualsToken) recordAssignment(target.left, record);
  }
  for (const {node, unit, module} of candidates) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) recordAssignment(node.left, {node, unit, value: node.right});
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) recordAssignment(node.operand, {node, unit, value: null});
    if (ts.isIdentifier(node) && node.text === 'arguments' && !declarationBindings.has(node) && !bindingOf(node)) {
      const parent = node.parent;
      const propertyName = (ts.isBindingElement(parent) && parent.propertyName === node) || ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || (ts.isPropertyAccessExpression(parent) && parent.name === node) || ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isEnumMember(parent)) && parent.name === node);
      const label = ((ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) && parent.label === node);
      let inType = false;
      for (let parent = node.parent; parent; parent = parent.parent) {
        if ((ts.isTypeNode(parent) && !isInstantiationExpression(parent)) || ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent)) {inType = true; break;}
      }
      if (!propertyName && !label && !inType) error(module, unit, node, 'arguments-object', 'Use explicit parameters instead of the implicit arguments object.');
    }
  }
  errors.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.span.start.offset - b.span.start.offset || a.construct.localeCompare(b.construct));
  return {errors, scopeOf, bindingOf, bindings, functions, imports, exports, unitOf: (node) => unitsByNode.get(node) ?? null};
}
