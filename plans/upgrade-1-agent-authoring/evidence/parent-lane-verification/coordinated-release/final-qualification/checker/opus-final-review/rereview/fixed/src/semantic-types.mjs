// Type-annotation seeds for the consumer dataflow. Declared types classify which
// bindings and expressions MAY carry framework or browser authority so later
// detectors can reason about them. This is potential-authority classification
// only: it never certifies runtime capability identity, never executes code and
// never produces an architectural qualification verdict.
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {lookupAnchor} from './anchors.mjs';

const BUILTIN_ELEMENT = /^(HTML[A-Za-z0-9]*Element|SVG[A-Za-z0-9]*Element|Element)$/;
const BUILTINS = new Map([
  ['Window', 'window'],
  ['Document', 'document'],
  ['History', 'history'],
  ['Location', 'location'],
  ['Navigation', 'navigation'],
  ['Navigator', 'navigator']
]);
// Global array constructors are exactly `T[]`; every other global utility that
// wraps an authority-bearing type is reported instead of silently modeled.
const GLOBAL_ARRAYS = new Set(['Array', 'ReadonlyArray']);
const UNSUPPORTED = 'unsupported-authority-type';
const GUIDANCE = 'Annotate with the authority type directly, or through a local type alias or interface the checker can expand.';
const SIGNATURE_INLINE_LIMIT = 160;
const TYPED_EXPRESSION_KINDS = new Set([ts.SyntaxKind.AsExpression, ts.SyntaxKind.TypeAssertionExpression, ts.SyntaxKind.SatisfiesExpression]
  .filter((kind) => typeof kind === 'number'));

const isNode = (value) => Boolean(value) && typeof value === 'object'
  && typeof value.kind === 'number' && typeof value.pos === 'number' && typeof value.end === 'number';

function classifyDeclaration(node) {
  if (!isNode(node)) return null;
  if (ts.isTypeAliasDeclaration(node)) return 'alias';
  if (ts.isInterfaceDeclaration(node)) return 'interface';
  if (ts.isClassLike(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node) || ts.isTypeParameterDeclaration(node)
    || ts.isImportEqualsDeclaration(node)) return 'shadow';
  if (ts.isImportSpecifier(node) || ts.isImportClause(node) || ts.isNamespaceImport(node)) return 'import';
  if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node) || ts.isPropertyDeclaration(node)
    || ts.isFunctionLike(node)) return 'value';
  return null;
}

function declarationOfNode(node) {
  if (!isNode(node)) return null;
  if (classifyDeclaration(node)) return node;
  if (ts.isIdentifier(node) && isNode(node.parent) && node.parent.name === node && classifyDeclaration(node.parent)) return node.parent;
  return null;
}

function typeStatementDeclarations(statement, name) {
  if ((ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isClassDeclaration(statement)
    || ts.isEnumDeclaration(statement) || ts.isModuleDeclaration(statement))
    && statement.name && ts.isIdentifier(statement.name) && statement.name.text === name) {
    return [statement];
  }
  if (ts.isImportDeclaration(statement) && statement.importClause) {
    const clause = statement.importClause;
    const results = [];
    if (clause.name && clause.name.text === name) results.push(clause);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings) && bindings.name.text === name) results.push(bindings);
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) if (element.name.text === name) results.push(element);
    }
    return results;
  }
  if (ts.isImportEqualsDeclaration(statement) && statement.name.text === name) return [statement];
  return [];
}

function collectInferNames(typeNode, names = new Set()) {
  if (!isNode(typeNode) || ts.isConditionalTypeNode(typeNode)) return names;
  if (ts.isInferTypeNode(typeNode) && typeNode.typeParameter && ts.isIdentifier(typeNode.typeParameter.name)) {
    names.add(typeNode.typeParameter.name.text);
  }
  ts.forEachChild(typeNode, (child) => { collectInferNames(child, names); });
  return names;
}

function findInferOwner(node, name) {
  let child = node;
  for (let parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (ts.isConditionalTypeNode(parent) && parent.trueType === child) {
      const inferNames = collectInferNames(parent.extendsType);
      if (inferNames.has(name)) return parent;
    }
  }
  return null;
}

function typeParameterOwner(node, name) {
  for (let current = node.parent; current; current = current.parent) {
    const params = current.typeParameters;
    if (Array.isArray(params) && params.some((param) => ts.isTypeParameterDeclaration(param) && param.name.text === name)) return current;
    if ((ts.isMappedTypeNode(current) || ts.isInferTypeNode(current)) && current.typeParameter && current.typeParameter.name.text === name) return current;
  }
  return null;
}

function heritageTypes(decl) {
  const result = [];
  for (const clause of decl.heritageClauses ?? []) if (clause.token === ts.SyntaxKind.ExtendsKeyword) result.push(...clause.types);
  return result;
}

function propertyKey(name) {
  if (!isNode(name)) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  return null;
}

function literalKey(typeNode) {
  let current = typeNode;
  while (isNode(current) && ts.isParenthesizedTypeNode(current)) current = current.type;
  if (!isNode(current) || !ts.isLiteralTypeNode(current)) return null;
  return propertyKey(current.literal);
}

function compareOrder(a, b) {
  for (let index = 0; index < a.length; index++) {
    if (a[index] === b[index]) continue;
    if (typeof a[index] === 'number' && typeof b[index] === 'number') return a[index] - b[index];
    return String(a[index]) < String(b[index]) ? -1 : 1;
  }
  return 0;
}

export function createTypeSeeds(context, flow, {onReducer = () => {}} = {}) {
  if (!context || !flow || !flow.domain || !flow.authority) {
    throw new TypeError('createTypeSeeds requires a semantic context and a flow exposing domain and authority values.');
  }
  const {domain, authority} = flow;
  const notify = typeof onReducer === 'function' ? onReducer : () => {};
  const EMPTY_ENV = new Map();
  const diagnostics = new Map();
  const reported = new Map();
  const expanding = new Set();
  const cutDecls = new Set();
  const inspectingRecursiveArguments = new Set();
  const querying = new Set();
  const reducerAtom = [...authority.authority('reducer')][0];

  const safeBindingOf = (identifier) => {
    try { return context.symbols.bindingOf(identifier) ?? null; } catch { return null; }
  };
  const safeOrigins = (binding) => {
    try {
      const origins = context.origins.resolveBinding(binding);
      if (Array.isArray(origins)) return origins;
      return origins ? [...origins] : [];
    } catch { return []; }
  };

  function recordOf(node) {
    try { return context.info(node) ?? null; } catch { return null; }
  }
  function sourceFileOf(node) {
    try { return typeof node.getSourceFile === 'function' ? node.getSourceFile() ?? null : null; } catch { return null; }
  }
  function positionOf(node) {
    const record = recordOf(node);
    try { return record ? record.unit.base + node.getStart(record.unit.sourceFile) : node.pos; } catch { return node.pos; }
  }
  function pathOf(node) {
    const record = recordOf(node);
    if (record && record.module && record.module.path) return record.module.path;
    const file = sourceFileOf(node);
    return file ? file.fileName : '?';
  }
  function identity(node) {
    const record = recordOf(node);
    const base = record?.unit?.base ?? 0;
    const start = positionOf(node);
    const end = typeof node.end === 'number' ? base + node.end : node.pos;
    const path = pathOf(node);
    return `${path}:${start}:${end}:${ts.SyntaxKind[node.kind]}`;
  }
  function spanOf(node) {
    try { return context.span(node); } catch { return null; }
  }
  function text(node) {
    try { return node.getText(); } catch { return ts.SyntaxKind[node.kind]; }
  }
  function report(code, node, message) {
    const path = pathOf(node);
    const span = spanOf(node);
    const key = JSON.stringify([code, path, span, message]);
    if (diagnostics.has(key)) return;
    diagnostics.set(key, {error: {code, path, span, message}, order: [path, positionOf(node), code, message]});
  }
  function unsupported(node, detail) {
    report(UNSUPPORTED, node, `Type '${text(node)}' ${detail}; the checker cannot model this form and will not silently erase authority. ${GUIDANCE}`);
  }
  function listErrors() {
    return [...diagnostics.values()].sort((a, b) => compareOrder(a.order, b.order)).map((entry) => ({...entry.error}));
  }

  function envSignature(env) {
    if (!env || env.size === 0) return '';
    const entries = [...env.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, value]) => [name, [...value].sort()]);
    const raw = JSON.stringify(entries);
    return raw.length <= SIGNATURE_INLINE_LIMIT ? raw : `sha256:${createHash('sha256').update(raw).digest('hex')}`;
  }
  function heapFor(kind, node, env, array) {
    const signature = envSignature(env);
    return domain.allocate(`type:${kind}:${identity(node)}${signature ? `|${signature}` : ''}`, {array});
  }
  function without(value, remove) {
    const result = domain.empty();
    for (const atom of value) if (!remove.has(atom)) result.add(atom);
    return result;
  }
  function currentValue(node) {
    const value = flow.value(node);
    return value instanceof Set ? value : domain.empty();
  }

  function collectDeclarations(source, out) {
    if (!source || typeof source !== 'object') return;
    const push = (candidate) => {
      const decl = declarationOfNode(candidate);
      if (decl && !out.includes(decl)) out.push(decl);
    };
    if (isNode(source)) { push(source); return; }
    for (const item of Object.values(source)) {
      if (isNode(item)) push(item);
      else if (Array.isArray(item)) { for (const entry of item) { if (isNode(entry)) push(entry); else if (entry && isNode(entry.node)) push(entry.node); } }
      else if (item && typeof item === 'object' && isNode(item.node)) push(item.node);
    }
  }

  function classifyCandidates(candidates, external, nameNode, name, seen = new Set()) {
    const aliases = [];
    const interfaces = [];
    const shadows = [];
    const values = [];
    let foundAnchor = null;
    let hasExternal = external;

    for (const decl of candidates) {
      const kind = classifyDeclaration(decl);
      if (kind === 'alias') {
        aliases.push(decl);
      } else if (kind === 'interface') {
        interfaces.push(decl);
      } else if (kind === 'shadow') {
        shadows.push(decl);
      } else if (kind === 'value') {
        values.push(decl);
      } else if (kind === 'import') {
        const nameId = decl.name;
        if (nameId && ts.isIdentifier(nameId)) {
          const importBinding = safeBindingOf(nameId);
          if (importBinding && !seen.has(importBinding)) {
            seen.add(importBinding);
            const origins = safeOrigins(importBinding);
            if (origins.length > 0) {
              const res = classifyTargets(origins, nameNode, name, seen);
              if (res) {
                if (res.kind === 'anchor') foundAnchor = res.anchor;
                else if (res.kind === 'alias') aliases.push(res.decl);
                else if (res.kind === 'interface') {
                  if (res.decls) interfaces.push(...res.decls);
                  else if (res.decl) interfaces.push(res.decl);
                  if (res.classDecls) shadows.push(...res.classDecls);
                } else if (res.kind === 'shadow') shadows.push(decl);
                else if (res.kind === 'external') hasExternal = true;
                else if (res.kind === 'value') values.push(decl);
              } else {
                shadows.push(decl);
              }
            } else {
              shadows.push(decl);
            }
          } else {
            shadows.push(decl);
          }
        } else {
          shadows.push(decl);
        }
      }
    }

    if (foundAnchor) return {kind: 'anchor', anchor: foundAnchor};
    if (interfaces.length > 0) {
      const hasConflictingShadow = shadows.some((d) => ts.isEnumDeclaration(d) || ts.isModuleDeclaration(d));
      if (hasConflictingShadow) {
        if (nameNode) unsupported(nameNode, 'merges an interface with an unsupported declaration');
        return {kind: 'unsupported'};
      }
      return {kind: 'interface', decls: interfaces, classDecls: shadows.filter(ts.isClassLike)};
    }
    if (aliases.length > 0) return {kind: 'alias', decl: aliases[0]};
    if (hasExternal) return {kind: 'external'};
    if (shadows.length > 0) return {kind: 'shadow'};
    if (values.length > 0) return {kind: 'value'};
    return null;
  }

  function classifyTargets(targets, nameNode, name, seen = new Set()) {
    const candidates = [];
    let external = false;
    for (const target of targets) {
      if (!target) continue;
      if (target.kind === 'external') {
        const anchor = lookupAnchor(target.specifier, target.name);
        if (anchor) return {kind: 'anchor', anchor};
        external = true;
      } else if (target.kind === 'binding') {
        collectDeclarations(target.binding, candidates);
      } else {
        collectDeclarations(target, candidates);
      }
    }
    return classifyCandidates(candidates, external, nameNode, name, seen);
  }

  function lexicalTypeDeclaration(node, name) {
    for (let current = node.parent; current; current = current.parent) {
      if (!Array.isArray(current.statements)) continue;
      const found = [];
      for (const statement of current.statements) {
        const decls = typeStatementDeclarations(statement, name);
        found.push(...decls);
      }
      if (found.length > 0) {
        const classified = classifyCandidates(found, false, node, name);
        if (classified) return classified;
      }
    }
    return null;
  }

  function resolveTypeName(nameNode, name) {
    const binding = safeBindingOf(nameNode);
    if (!binding) return lexicalTypeDeclaration(nameNode, name);
    const declarations = [];
    collectDeclarations(binding, declarations);
    // The shared symbol table records infer declarations in the enclosing type
    // scope. TypeScript grants them only the conditional true branch.
    if (declarations.length > 0 && declarations.every(decl => ts.isTypeParameterDeclaration(decl)
      && ts.isInferTypeNode(decl.parent) && !findInferOwner(nameNode, name))) {
      return lexicalTypeDeclaration(nameNode, name);
    }
    const origins = safeOrigins(binding);
    const fromOrigins = origins.length > 0 ? classifyTargets(origins, nameNode, name) : null;
    if (fromOrigins && fromOrigins.kind !== 'value') return fromOrigins;

    const candidates = [];
    collectDeclarations(binding, candidates);
    const fromCandidates = candidates.length > 0 ? classifyCandidates(candidates, false, nameNode, name) : null;
    if (fromCandidates && fromCandidates.kind !== 'value') return fromCandidates;

    const lexical = lexicalTypeDeclaration(nameNode, name);
    if (lexical && lexical.kind !== 'value') return lexical;

    // A binding the checker cannot inspect is a local shadow; a value-only
    // binding named like a global type leaves the type namespace untouched.
    return (fromOrigins?.kind === 'value' || fromCandidates?.kind === 'value' || lexical?.kind === 'value') ? null : {kind: 'shadow'};
  }

  function namespaceMember(binding, names) {
    const candidates = [];
    collectDeclarations(binding, candidates);
    return namespacePath(candidates, Array.isArray(names) ? names : [names]);
  }
  function namespacePath(candidates, names) {
    let members = candidates;
    for (const name of names) {
      const selected = [];
      for (const decl of members) {
        if (!ts.isModuleDeclaration(decl) || !decl.body) continue;
        const statements = ts.isModuleDeclaration(decl.body) ? [decl.body] : decl.body.statements ?? [];
        for (const statement of statements) selected.push(...typeStatementDeclarations(statement, name));
      }
      members = selected;
    }
    return members.length ? classifyCandidates(members, false, members[0], names.at(-1)) : null;
  }

  function evaluate(typeNode, env) {
    if (!isNode(typeNode)) return domain.empty();
    if (ts.isParenthesizedTypeNode(typeNode) || ts.isNamedTupleMember(typeNode) || ts.isOptionalTypeNode(typeNode) || ts.isRestTypeNode(typeNode)) {
      return evaluate(typeNode.type, env);
    }
    if (ts.isUnionTypeNode(typeNode) || ts.isIntersectionTypeNode(typeNode)) {
      let result = domain.empty();
      for (const member of typeNode.types) result = domain.join(result, evaluate(member, env));
      return result;
    }
    if (ts.isTypeOperatorNode(typeNode)) {
      // `readonly` keeps the value; `keyof` and `unique` yield key or symbol data.
      return typeNode.operator === ts.SyntaxKind.ReadonlyKeyword ? evaluate(typeNode.type, env) : domain.empty();
    }
    if (ts.isArrayTypeNode(typeNode)) return arrayValue(typeNode, evaluate(typeNode.elementType, env), env);
    if (ts.isTupleTypeNode(typeNode)) return tupleValue(typeNode, env);
    if (ts.isTypeLiteralNode(typeNode)) return objectValue(typeNode, typeNode.members, [], env);
    if (ts.isTypeReferenceNode(typeNode)) return entityValue(typeNode, typeNode.typeName, typeNode.typeArguments ?? [], env);
    if (ts.isExpressionWithTypeArguments(typeNode)) return entityValue(typeNode, typeNode.expression, typeNode.typeArguments ?? [], env);
    if (ts.isIndexedAccessTypeNode(typeNode)) return indexedValue(typeNode, env);
    if (ts.isConditionalTypeNode(typeNode)) {
      // Join possible branch authorities. Scoped infer names are handled below;
      // authority-bearing inference is explicitly refused rather than erased.
      return domain.join(evaluate(typeNode.trueType, env), evaluate(typeNode.falseType, env));
    }
    if (ts.isMappedTypeNode(typeNode)) return mappedValue(typeNode, env);
    if (ts.isTypeQueryNode(typeNode)) return queryValue(typeNode);
    if (ts.isImportTypeNode(typeNode)) return importValue(typeNode, env);
    // Keywords, literals, function/constructor types, predicates, templates,
    // `this` and `infer` positions carry no handle authority themselves.
    return domain.empty();
  }

  function arrayValue(node, element, env) {
    if (element.size === 0) return domain.empty();
    const heap = heapFor('array', node, env, true);
    domain.write(heap, '*', element);
    return heap;
  }

  function tupleValue(node, env) {
    const entries = node.elements.map((element) => {
      const rest = ts.isRestTypeNode(element) || (ts.isNamedTupleMember(element) && Boolean(element.dotDotDotToken));
      const value = evaluate(element, env);
      return {rest, value: rest ? domain.read(value, '*') : value};
    });
    if (!entries.some((entry) => entry.value.size > 0)) return domain.empty();
    const heap = heapFor('tuple', node, env, true);
    let positional = true;
    entries.forEach((entry, index) => {
      if (entry.rest) positional = false;
      if (entry.value.size === 0) return;
      if (positional) domain.write(heap, String(index), entry.value);
      else domain.write(heap, '*', entry.value);
    });
    return heap;
  }

  function objectValue(node, members, heritage, env) {
    let result = domain.empty();
    // `extends` behaves like an intersection: bases are joined, not spread.
    for (const base of heritage) result = domain.join(result, evaluate(base, env));
    const props = [];
    for (const member of members) {
      let key = null;
      if (ts.isPropertySignature(member)) key = propertyKey(member.name);
      else if (ts.isIndexSignatureDeclaration(member)) key = '*';
      if (key === null || !member.type) continue;
      const value = evaluate(member.type, env);
      if (value.size > 0) props.push([key, value]);
    }
    if (props.length > 0) {
      const heap = heapFor('object', node, env, false);
      for (const [key, value] of props) domain.write(heap, key, value);
      result = domain.join(result, heap);
    }
    return result;
  }

  function mappedValue(node, env) {
    const template = evaluate(node.type, env);
    if (template.size === 0) return domain.empty();
    const heap = heapFor('mapped', node, env, false);
    domain.write(heap, '*', template);
    return heap;
  }

  function indexedValue(node, env) {
    const object = evaluate(node.objectType, env);
    if (object.size === 0) return domain.empty();
    const key = literalKey(node.indexType);
    if (key === null) {
      unsupported(node, 'indexes an authority-bearing type with a non-literal key');
      return domain.empty();
    }
    return authority.member(object, key);
  }

  function queryValue(node) {
    const name = node.exprName;
    if (!isNode(name) || !ts.isIdentifier(name)) return domain.empty();
    const binding = safeBindingOf(name);
    if (!binding) return domain.empty();
    const candidates = [];
    for (const origin of safeOrigins(binding)) if (!origin || origin.kind !== 'external') collectDeclarations(origin, candidates);
    collectDeclarations(binding, candidates);
    for (const decl of candidates) {
      if (!(ts.isVariableDeclaration(decl) || ts.isParameter(decl) || ts.isPropertyDeclaration(decl)) || !decl.type) continue;
      if (querying.has(decl)) return domain.empty();
      querying.add(decl);
      try { return evaluate(decl.type, EMPTY_ENV); } finally { querying.delete(decl); }
    }
    return domain.empty();
  }

  function importValue(node, env) {
    const argument = node.argument;
    const specifier = isNode(argument) && ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal) ? argument.literal.text : null;
    const qualifier = node.qualifier;
    const right = isNode(qualifier) ? (ts.isIdentifier(qualifier) ? qualifier.text : qualifier.right.text) : null;
    if (specifier !== null && right !== null && lookupAnchor(specifier, right)) {
      unsupported(node, `imports the authority type '${right}' inline`);
      return domain.empty();
    }
    return unmodeled(node, node.typeArguments ?? [], env);
  }

  function entityValue(node, nameNode, args, env) {
    if (!isNode(nameNode)) return unmodeled(node, args, env);
    if (ts.isIdentifier(nameNode)) return simpleNameValue(node, nameNode, args, env);
    const names = [];
    let left = nameNode;
    while (ts.isQualifiedName(left) || ts.isPropertyAccessExpression(left)) {
      names.unshift(ts.isQualifiedName(left) ? left.right.text : left.name.text);
      left = ts.isQualifiedName(left) ? left.left : left.expression;
    }
    if (ts.isIdentifier(left) && names.length) return qualifiedValue(node, left, names, args, env);
    return unmodeled(node, args, env);
  }

  function simpleNameValue(node, nameNode, args, env) {
    const name = nameNode.text;
    const inferOwner = findInferOwner(nameNode, name);
    if (inferOwner) {
      if (evaluate(inferOwner.checkType, env).size > 0) {
        unsupported(nameNode, 'infers from an authority-bearing type');
      }
      return domain.empty();
    }
    const owner = typeParameterOwner(nameNode, name);
    if (owner) {
      // Only alias/interface parameters are instantiated here; parameters of
      // functions, classes, mapped and infer positions shadow to nothing.
      const substitutable = ts.isTypeAliasDeclaration(owner) || ts.isInterfaceDeclaration(owner);
      return substitutable && env.has(name) ? domain.join(env.get(name)) : domain.empty();
    }
    if (env.has(name)) return domain.join(env.get(name));
    const resolved = resolveTypeName(nameNode, name);
    if (!resolved) return globalValue(node, name, args, env);
    if (resolved.kind === 'unsupported') return domain.empty();
    if (resolved.kind === 'interface' && !resolved.classDecls?.length) {
      const sourceFile = sourceFileOf(nameNode);
      const isExternal = sourceFile && (typeof ts.isExternalModule === 'function' ? ts.isExternalModule(sourceFile) : Boolean(sourceFile.externalModuleIndicator));
      const declarations = resolved.decls ?? [resolved.decl];
      const globalScriptDeclarations = declarations.every(decl => ts.isSourceFile(decl.parent) && recordOf(decl)?.module?.kind !== 'svelte');
      if (sourceFile && !isExternal && globalScriptDeclarations && (BUILTINS.has(name) || BUILTIN_ELEMENT.test(name))) {
        return domain.join(globalValue(node, name, args, env), expandInterface(resolved.decls ?? resolved.decl, args, env));
      }
    }
    return resolvedValue(node, resolved, args, env);
  }

  function qualifiedValue(node, left, right, args, env) {
    const names = Array.isArray(right) ? right : [right];
    const first = names[0];
    let binding = safeBindingOf(left);
    if (binding && classifyTargets(safeOrigins(binding), left, left.text)?.kind === 'value') {
      // Namespace qualification also uses type space: a nearer local value must
      // not hide an outer imported namespace, but a real type declaration does.
      for (let current = left.parent; current; current = current.parent) {
        if (!Array.isArray(current.statements)) continue;
        const declarations = current.statements.flatMap(statement => typeStatementDeclarations(statement, left.text));
        if (!declarations.length) continue;
        binding = declarations.map(decl => safeBindingOf(decl.name)).find(Boolean) ?? binding;
        break;
      }
    }
    if (binding) {
      for (const origin of safeOrigins(binding)) {
        if (!origin) continue;
        if (origin.kind === 'external' && origin.name === '*') {
          const anchor = names.length === 1 ? lookupAnchor(origin.specifier, first) : null;
          if (anchor) return anchorValue(node, anchor, args, env);
        } else if (origin.kind === 'namespace') {
          const targets = context.origins.resolveExport(origin.path, first);
          if (targets.length > 0) {
            const declarations = [];
            for (const target of targets) collectDeclarations(target.kind === 'binding' ? target.binding : target, declarations);
            const resolved = names.length === 1 ? classifyTargets(targets, node, first) : namespacePath(declarations, names.slice(1));
            if (resolved && resolved.kind !== 'value') return resolvedValue(node, resolved, args, env);
          }
        } else if (origin.kind === 'binding') {
          const member = namespaceMember(origin.binding, names);
          if (member) return resolvedValue(node, member, args, env);
        }
      }
      const member = namespaceMember(binding, names);
      if (member) return resolvedValue(node, member, args, env);
    }
    return unmodeled(node, args, env);
  }

  function resolvedValue(node, resolved, args, env) {
    if (resolved.kind === 'anchor') return anchorValue(node, resolved.anchor, args, env);
    if (resolved.kind === 'alias') return expandAlias(resolved.decl, args, env);
    if (resolved.kind === 'interface') {
      const value = expandInterface(resolved.decls ?? resolved.decl, args, env);
      if (resolved.classDecls?.length) {
        let unsupportedSurface = value.size > 0;
        for (const decl of resolved.classDecls) {
          const inner = instantiate(decl, args, env);
          if (decl.heritageClauses?.length) unsupportedSurface = true;
          for (const member of decl.members) {
            // Class/interface merging is valid TS. This type-only projection
            // accepts explicit data fields, but does not infer class behavior.
            if (!ts.isPropertyDeclaration(member)) { unsupportedSurface = true; continue; }
            if (member.type && evaluate(member.type, inner).size > 0) unsupportedSurface = true;
            const initializer = member.initializer;
            const scalar = initializer && (ts.isStringLiteralLike(initializer) || ts.isNumericLiteral(initializer)
              || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(initializer.kind));
            if (initializer && !scalar || !member.type && !initializer) unsupportedSurface = true;
          }
        }
        if (unsupportedSurface) unsupported(node, 'merges an interface with an authority-bearing or unsupported class surface');
      }
      return value;
    }
    return unmodeled(node, args, env);
  }

  function anchorValue(node, anchor, args, env) {
    if (anchor.kind === 'authority-type') return authority.authority(anchor.authority);
    if (anchor.kind === 'reducer-type') return authority.authority('reducer');
    if (anchor.kind === 'feature-props-type') {
      const heap = heapFor('feature-props', node, EMPTY_ENV, false);
      domain.write(heap, 'store', authority.authority('view'));
      domain.write(heap, 'views', authority.authority('views'));
      return heap;
    }
    return unmodeled(node, args, env);
  }

  function globalValue(node, name, args, env) {
    if (BUILTINS.has(name)) return authority.authority(BUILTINS.get(name));
    if (BUILTIN_ELEMENT.test(name)) return authority.authority('element');
    if (GLOBAL_ARRAYS.has(name)) {
      const element = args.length > 0 ? evaluate(args[0], env) : domain.empty();
      return arrayValue(node, element, env);
    }
    return unmodeled(node, args, env);
  }

  // Ordinary unknown data types stay empty; only constructs that would erase
  // authority carried by their type arguments are reported.
  function unmodeled(node, args, env) {
    let bearing = false;
    for (const arg of args) if (evaluate(arg, env).size > 0) bearing = true;
    if (bearing) unsupported(node, 'applies an unmodeled type construct to an authority-bearing type');
    return domain.empty();
  }

  // Type arguments are evaluated eagerly in the caller environment so nested
  // aliases retain caller substitutions and shadowing cannot leak values.
  function instantiate(decl, args, env) {
    const inner = new Map();
    const params = decl.typeParameters ?? [];
    params.forEach((param, index) => {
      const name = param.name.text;
      if (index < args.length) inner.set(name, evaluate(args[index], env));
      else if (param.default) inner.set(name, evaluate(param.default, new Map(inner)));
      else inner.set(name, domain.empty());
    });
    return inner;
  }

  function inspectRecursiveArguments(decl, args, env) {
    // Guard argument syntax rather than the declaration: a recursive default
    // may itself instantiate this declaration with a new authority argument.
    // Guarding the declaration would suppress that inner argument inspection.
    const inner = new Map();
    for (const [index, param] of (decl.typeParameters ?? []).entries()) {
      const argument = args[index] ?? param.default;
      let value = domain.empty();
      if (argument && !inspectingRecursiveArguments.has(argument)) {
        inspectingRecursiveArguments.add(argument);
        try { value = evaluate(argument, index < args.length ? env : new Map(inner)); }
        finally { inspectingRecursiveArguments.delete(argument); }
      }
      inner.set(param.name.text, value);
      if (value.size > 0) unsupported(decl, 'recurs with authority-bearing type arguments');
    }
  }

  function expandAlias(decl, args, env) {
    if (expanding.has(decl)) {
      inspectRecursiveArguments(decl, args, env);
      let inCycle = false;
      for (const d of expanding) {
        if (d === decl) inCycle = true;
        if (inCycle) cutDecls.add(d);
      }
      return domain.empty();
    }
    const inner = instantiate(decl, args, env);
    expanding.add(decl);
    try {
      const result = evaluate(decl.type, inner);
      if (cutDecls.has(decl)) {
        cutDecls.delete(decl);
        if (result.size > 0) unsupported(decl, 'is a recursive authority-bearing type');
      }
      return result;
    } finally {
      expanding.delete(decl);
      cutDecls.delete(decl);
    }
  }

  function expandInterface(decls, args, env) {
    const declList = Array.isArray(decls) ? decls : [decls];
    for (const d of declList) {
      if (expanding.has(d)) {
        inspectRecursiveArguments(declList[0], args, env);
        let inCycle = false;
        for (const exp of expanding) {
          if (exp === d) inCycle = true;
          if (inCycle) cutDecls.add(exp);
        }
        return domain.empty();
      }
    }
    const primary = declList[0];
    const inner = instantiate(primary, args, env);
    for (const d of declList) expanding.add(d);
    try {
      const allMembers = declList.flatMap((d) => d.members ?? []);
      const allHeritage = declList.flatMap((d) => heritageTypes(d));
      const result = objectValue(primary, allMembers, allHeritage, inner);
      for (const d of declList) {
        if (cutDecls.has(d)) {
          cutDecls.delete(d);
          if (result.size > 0) unsupported(d, 'is a recursive authority-bearing type');
        }
      }
      return result;
    } finally {
      for (const d of declList) {
        expanding.delete(d);
        cutDecls.delete(d);
      }
    }
  }

  function restValue(element, value, taken, array) {
    const heaps = [...value].filter((atom) => domain.describe(atom).kind === 'heap');
    if (heaps.length === 0) return domain.empty();
    const heap = domain.allocate(`type:rest:${identity(element)}`, {array});
    for (const atom of heaps) domain.spread(heap, new Set([atom]), {array, shadowed: array ? [] : taken});
    return heap;
  }

  function seedPattern(pattern, value) {
    if (!isNode(pattern) || value.size === 0) return;
    if (ts.isIdentifier(pattern)) {
      const binding = safeBindingOf(pattern);
      if (binding) flow.seedBinding(binding, value);
      return;
    }
    if (ts.isObjectBindingPattern(pattern)) {
      const taken = [];
      for (const element of pattern.elements) {
        if (element.dotDotDotToken) {
          seedPattern(element.name, restValue(element, value, [...taken], false));
          continue;
        }
        const key = element.propertyName ? propertyKey(element.propertyName) : (ts.isIdentifier(element.name) ? element.name.text : null);
        if (key === null) continue;
        taken.push(key);
        seedPattern(element.name, authority.member(value, key));
      }
      return;
    }
    if (ts.isArrayBindingPattern(pattern)) {
      pattern.elements.forEach((element, index) => {
        if (!ts.isBindingElement(element)) return;
        if (element.dotDotDotToken) {
          seedPattern(element.name, restValue(element, value, [], true));
          return;
        }
        seedPattern(element.name, authority.member(value, String(index)));
      });
    }
  }

  const isReducerTyped = (value) => value.has(reducerAtom);
  const isTypedExpression = (node) => TYPED_EXPRESSION_KINDS.has(node.kind) && isNode(node.type) && isNode(node.expression);

  // Callback facts are reported once per node and again only when the actual
  // value gains atoms, so late facts surface without duplicating earlier ones.
  function reportReducer(node, value) {
    const previous = reported.get(node);
    let fresh = !previous;
    if (previous) for (const atom of value) if (!previous.has(atom)) { fresh = true; break; }
    if (!fresh) return;
    const seen = new Set(previous ?? []);
    for (const atom of value) seen.add(atom);
    reported.set(node, seen);
    notify(node, value);
  }

  function seedDeclaration(name, initializer, typed) {
    seedPattern(name, typed);
    if (!isNode(initializer)) return;
    // Report before seeding so the actual initializer value is observed.
    if (isReducerTyped(typed)) reportReducer(initializer, without(currentValue(initializer), typed));
    if (ts.isCallExpression(initializer)) flow.seedNode(initializer, typed);
  }

  function apply() {
    for (const record of context.nodes) {
      const node = record.node;
      if (ts.isVariableDeclaration(node)) {
        if (!node.type) continue;
        const typed = evaluate(node.type, EMPTY_ENV);
        if (typed.size === 0) continue;
        seedDeclaration(node.name, node.initializer, typed);
      } else if (ts.isParameter(node)) {
        if (!node.type || record.runtime === false) continue;
        const typed = evaluate(node.type, EMPTY_ENV);
        if (typed.size === 0) continue;
        seedPattern(node.name, typed);
        if (isReducerTyped(typed)) reportReducer(node, without(currentValue(node), typed));
      } else if (ts.isPropertyDeclaration(node)) {
        if (!node.type || !ts.isIdentifier(node.name)) continue;
        const typed = evaluate(node.type, EMPTY_ENV);
        if (typed.size === 0) continue;
        if (isNode(node.initializer)) {
          if (isReducerTyped(typed)) reportReducer(node.initializer, without(currentValue(node.initializer), typed));
          if (ts.isCallExpression(node.initializer)) flow.seedNode(node.initializer, typed);
        }
      } else if (isTypedExpression(node)) {
        const typed = evaluate(node.type, EMPTY_ENV);
        if (typed.size === 0) continue;
        const underlying = currentValue(node.expression);
        if (isReducerTyped(typed)) reportReducer(node, underlying);
        flow.seedNode(node, domain.join(underlying, typed));
      }
    }
  }

  return {
    typeValue(node) {
      return isNode(node) ? domain.join(evaluate(node, EMPTY_ENV)) : domain.empty();
    },
    apply,
    get errors() { return listErrors(); }
  };
}
