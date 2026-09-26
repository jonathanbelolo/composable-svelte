// Semantic parser frontend for Composable Svelte (development-only).
// Decomposes approved graph modules into typed TypeScript AST units, lexical scopes, and syntactic markers.
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import ts from 'typescript';
import {parse as parseSvelte} from 'svelte/compiler';

const NEWLINE = String.fromCharCode(10);
const TEMPLATE_NODES = new Set([
  'Fragment', 'Text', 'Comment', 'RegularElement', 'Component', 'TitleElement', 'SlotElement', 'SvelteBody', 'SvelteBoundary',
  'SvelteComponent', 'SvelteElement', 'SvelteFragment', 'SvelteHead', 'SvelteOptions', 'SvelteSelf', 'SvelteWindow',
  'ExpressionTag', 'HtmlTag', 'ConstTag', 'DebugTag', 'RenderTag', 'AttachTag', 'IfBlock', 'EachBlock', 'AwaitBlock', 'KeyBlock',
  'SnippetBlock', 'Attribute', 'SpreadAttribute', 'AnimateDirective', 'BindDirective', 'ClassDirective', 'LetDirective', 'OnDirective',
  'StyleDirective', 'TransitionDirective', 'UseDirective'
]);
const JS_EXPRESSIONS = new Set([
  'Identifier', 'Literal', 'TemplateLiteral', 'BinaryExpression', 'UnaryExpression', 'LogicalExpression',
  'MemberExpression', 'CallExpression', 'NewExpression', 'UpdateExpression', 'ConditionalExpression',
  'ArrayExpression', 'ObjectExpression', 'ArrowFunctionExpression', 'FunctionExpression', 'SequenceExpression',
  'AssignmentExpression', 'ChainExpression', 'TaggedTemplateExpression', 'ThisExpression', 'MetaProperty',
  'ParenthesizedExpression', 'AwaitExpression', 'TSAsExpression', 'TSTypeAssertion', 'TSNonNullExpression',
  'TSInstantiationExpression', 'ImportExpression'
]);

const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

function sortErrors(errors) {
  const offset = (item) => (item.span ? item.span.start.offset : -1);
  return [...errors].sort(
    (left, right) =>
      compareText(left.path, right.path) ||
      offset(left) - offset(right) ||
      compareText(left.code, right.code) ||
      compareText(left.message, right.message)
  );
}

function createLocator(text) {
  const lineStarts = [0];
  for (let index = text.indexOf(NEWLINE); index !== -1; index = text.indexOf(NEWLINE, index + 1)) lineStarts.push(index + 1);
  const locate = (offset) => {
    let line = lineStarts.length - 1;
    while (lineStarts[line] > offset) line -= 1;
    return {offset, line: line + 1, column: offset - lineStarts[line] + 1};
  };
  return (start, end) => ({start: locate(start), end: locate(end)});
}

function svelteScriptKind(attributes) {
  for (const attribute of attributes) {
    if (attribute.name !== 'lang' || attribute.value === true) continue;
    const value = [].concat(attribute.value).map((part) => part.data ?? '').join('');
    if (value === 'ts' || value === 'typescript') return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.JS;
}

function extractScript(script, text, span, errors, path) {
  if (!script) return null;
  const attributes = script.attributes ?? [];
  const open = text.indexOf('>', attributes.length > 0 ? attributes[attributes.length - 1].end : script.start);
  const close = text.lastIndexOf('</script', script.end);
  if (open === -1 || close <= open) {
    errors.push({code: 'parse-error', path, span: span(script.start, script.end), message: 'Svelte script span is unavailable'});
    return null;
  }
  return {
    start: open + 1,
    end: close,
    text: text.slice(open + 1, close),
    scriptKind: svelteScriptKind(attributes)
  };
}

function createUnit(kind, unitText, base, scope, start, end, scriptKind, errors, path, span) {
  const isTs = scriptKind === ts.ScriptKind.TS;
  const fileName = isTs ? (kind === 'view' ? 'view.ts' : 'unit.ts') : (kind === 'view' ? 'view.js' : 'unit.js');
  const sourceFile = ts.createSourceFile(fileName, unitText, ts.ScriptTarget.Latest, true, scriptKind);
  if (Array.isArray(sourceFile.parseDiagnostics)) {
    for (const diag of sourceFile.parseDiagnostics) {
      const diagStart = Math.max(start, Math.min(end, base + (diag.start ?? 0)));
      const diagLength = diag.length ?? 0;
      const diagEnd = Math.max(diagStart, Math.min(end, diagStart + diagLength));
      errors.push({
        code: 'parse-error',
        path,
        span: span(diagStart, diagEnd),
        message: ts.flattenDiagnosticMessageText(diag.messageText, ' ')
      });
    }
  }
  return {
    kind,
    sourceFile,
    base,
    scope,
    start,
    end,
    nodeSpan(node) {
      const s = Math.max(start, Math.min(end, base + node.getStart(sourceFile)));
      const e = Math.max(start, Math.min(end, base + node.getEnd()));
      return span(s, e);
    }
  };
}

function createScope(parent, context) {
  const scope = {id: context.nextScopeId++, parent: parent ?? null, bindings: new Map()};
  context.scopes.push(scope);
  return scope;
}

function addTemplateExpr(node, scope, context) {
  if (!node || typeof node !== 'object') return;
  if (context.expressionNodes.has(node)) return;
  context.expressionNodes.add(node);
  if (typeof node.start !== 'number' || typeof node.end !== 'number') {
    context.errors.push({
      code: 'unsupported-construct',
      construct: node.type ?? 'unknown',
      path: context.path,
      span: context.span(0, 0),
      message: `template expression missing source positions: ${node.type ?? 'unknown'}`
    });
    return;
  }
  const slice = context.text.slice(node.start, node.end);
  const wrapped = `(${slice})`;
  const unit = createUnit('template', wrapped, node.start - 1, scope, node.start, node.end, context.scriptKind, context.errors, context.path, context.span);
  context.units.push(unit);
  return unit;
}

function addSyntheticBinding(start, end, scope, context) {
  if (typeof start !== 'number' || typeof end !== 'number' || end <= start) return;
  const slice = context.text.slice(start, end);
  const wrapped = `let ${slice};`;
  const unit = createUnit('binding', wrapped, start - 4, scope, start, end, context.scriptKind, context.errors, context.path, context.span);
  context.units.push(unit);
  return unit;
}

function addBindingUnit(patternNode, scope, context) {
  if (!patternNode || typeof patternNode !== 'object') return;
  if (typeof patternNode.start !== 'number' || typeof patternNode.end !== 'number') {
    context.errors.push({
      code: 'unsupported-construct',
      construct: patternNode.type ?? 'unknown',
      path: context.path,
      span: context.span(0, 0),
      message: `binding pattern missing source positions: ${patternNode.type ?? 'unknown'}`
    });
    return;
  }
  return addSyntheticBinding(patternNode.start, patternNode.end, scope, context);
}

function addNamedBinding(name, start, end, scope, context) {
  if (typeof name !== 'string' || typeof start !== 'number' || typeof end !== 'number' || end <= start) {
    const safeStart = typeof start === 'number' && start >= 0 ? start : 0;
    const safeEnd = typeof end === 'number' && end >= safeStart ? end : safeStart;
    context.errors.push({code: 'unsupported-construct', construct: 'EachBlock.index', path: context.path, span: context.span(safeStart, safeEnd), message: 'each index binding has no trustworthy source range'});
    return null;
  }
  const source = context.text.slice(start, end);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, source);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.Identifier && scanner.getTokenText() === name) {
      const bindingStart = start + scanner.getTokenPos();
      const bindingEnd = start + scanner.getTextPos();
      addSyntheticBinding(bindingStart, bindingEnd, scope, context);
      return {start: bindingStart, end: bindingEnd};
    }
  }
  context.errors.push({code: 'unsupported-construct', construct: 'EachBlock.index', path: context.path, span: context.span(start, end), message: `each index binding source is unavailable: ${name}`});
  return null;
}

function handleElementOrComponent(node, currentScope, context) {
  const isComp = node.type === 'Component' || node.type === 'SvelteComponent';
  if (node.type === 'RegularElement') {
    context.markers.push({kind: 'native-element', name: node.name, node,
      span: context.span(node.start, node.end), scope: currentScope});
  }
  if (['SvelteWindow', 'SvelteDocument', 'SvelteBody'].includes(node.type)) {
    context.markers.push({kind: 'event-element', name: node.name, node,
      span: context.span(node.start, node.end), scope: currentScope});
  }
  if (isComp) {
    context.markers.push({
      kind: 'component',
      name: node.name ?? (typeof node.tag === 'string' ? node.tag : 'SvelteComponent'),
      node,
      span: context.span(node.start, node.end),
      scope: currentScope
    });
  }
  if (node.expression) addTemplateExpr(node.expression, currentScope, context);
  if (node.tag && typeof node.tag === 'object') addTemplateExpr(node.tag, currentScope, context);

  const attributes = node.attributes ?? [];
  const letDirectives = attributes.filter((a) => a.type === 'LetDirective');
  let childrenScope = currentScope;
  if (letDirectives.length > 0) {
    childrenScope = createScope(currentScope, context);
    for (const letDir of letDirectives) {
      if (letDir.expression) {
        addBindingUnit(letDir.expression, childrenScope, context);
      } else if (letDir.name) {
        const start = letDir.start + 'let:'.length;
        const end = start + letDir.name.length;
        addSyntheticBinding(start, end, childrenScope, context);
      }
    }
  }

  for (const attr of attributes) {
    walkTemplate(attr, currentScope, context);
  }
  if (node.fragment) {
    walkTemplate(node.fragment, childrenScope, context);
  }
}

function walkTemplate(node, currentScope, context) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walkTemplate(child, currentScope, context);
    return;
  }
  if (typeof node.type !== 'string') return;

  switch (node.type) {
    case 'Fragment':
      if (Array.isArray(node.nodes)) {
        for (const child of node.nodes) walkTemplate(child, currentScope, context);
      }
      break;
    case 'Text':
    case 'Comment':
      break;
    case 'ExpressionTag':
    case 'HtmlTag':
      if (node.expression) addTemplateExpr(node.expression, currentScope, context);
      break;
    case 'ConstTag':
      context.markers.push({kind: 'const-tag', node, span: context.span(node.start, node.end), scope: currentScope});
      if (node.declaration?.declarations) {
        for (const decl of node.declaration.declarations) {
          if (decl.init) addTemplateExpr(decl.init, currentScope, context);
          if (decl.id) addBindingUnit(decl.id, currentScope, context);
        }
      }
      break;
    case 'DebugTag':
      if (Array.isArray(node.identifiers)) {
        for (const id of node.identifiers) addTemplateExpr(id, currentScope, context);
      }
      break;
    case 'RenderTag':
      context.markers.push({kind: 'render-tag', node, span: context.span(node.start, node.end), scope: currentScope,
        expressionUnit: node.expression ? addTemplateExpr(node.expression, currentScope, context) : null});
      if (Array.isArray(node.arguments)) {
        for (const arg of node.arguments) addTemplateExpr(arg, currentScope, context);
      }
      break;
    case 'AttachTag':
      context.markers.push({kind: 'attach-tag', node, span: context.span(node.start, node.end), scope: currentScope});
      if (node.expression) addTemplateExpr(node.expression, currentScope, context);
      break;
    case 'SpreadAttribute':
      if (node.expression) addTemplateExpr(node.expression, currentScope, context);
      break;
    case 'Attribute':
      context.markers.push({kind: 'attribute', name: node.name, node, span: context.span(node.start, node.end), scope: currentScope});
      if (Array.isArray(node.value)) {
        for (const v of node.value) walkTemplate(v, currentScope, context);
      } else if (node.value && typeof node.value === 'object') {
        walkTemplate(node.value, currentScope, context);
      }
      break;
    case 'BindDirective':
      context.markers.push({
        kind: 'bind-directive',
        name: node.name,
        isThis: node.name === 'this',
        node,
        span: context.span(node.start, node.end),
        scope: currentScope
      });
      if (node.expression) addTemplateExpr(node.expression, currentScope, context);
      break;
    case 'UseDirective': {
      const start = node.start + 4, end = start + node.name.length;
      const actionUnit = context.text.slice(start,end) === node.name
        ? addTemplateExpr({type:'Identifier',start,end},currentScope,context) : null;
      if (!actionUnit) context.errors.push({code:'unsupported-construct',construct:'UseDirective.action',path:context.path,
        span:context.span(node.start,node.end),message:'Action callback has no trustworthy source range.'});
      context.markers.push({kind: 'use-directive', name: node.name, node, actionUnit, span: context.span(node.start, node.end), scope: currentScope});
      if (node.expression) addTemplateExpr(node.expression, currentScope, context);
      break;
    }
    case 'OnDirective':
      context.markers.push({kind: 'event-directive', name: node.name, node, span: context.span(node.start, node.end), scope: currentScope});
      if (node.expression) addTemplateExpr(node.expression, currentScope, context);
      break;
    case 'ClassDirective':
    case 'StyleDirective':
    case 'TransitionDirective':
    case 'AnimateDirective':
      context.markers.push({kind: 'directive', directiveKind: node.type, name: node.name, node, span: context.span(node.start, node.end), scope: currentScope});
      if (node.expression) addTemplateExpr(node.expression, currentScope, context);
      if (Array.isArray(node.value)) {
        for (const v of node.value) walkTemplate(v, currentScope, context);
      } else if (node.value && typeof node.value === 'object') {
        walkTemplate(node.value, currentScope, context);
      }
      break;
    case 'LetDirective':
      context.markers.push({kind: 'let-directive', name: node.name, node, span: context.span(node.start, node.end), scope: currentScope});
      break;
    case 'RegularElement':
    case 'Component':
    case 'SvelteComponent':
    case 'SvelteElement':
    case 'SvelteSelf':
    case 'SvelteFragment':
    case 'SvelteBoundary':
    case 'TitleElement':
    case 'SlotElement':
    case 'SvelteBody':
    case 'SvelteDocument':
    case 'SvelteHead':
    case 'SvelteWindow':
      handleElementOrComponent(node, currentScope, context);
      break;
    case 'SvelteOptions':
      context.markers.push({kind: 'svelte-options', node, span: context.span(node.start, node.end), scope: currentScope});
      if (Array.isArray(node.attributes)) {
        for (const attr of node.attributes) walkTemplate(attr, currentScope, context);
      }
      break;
    case 'IfBlock': {
      if (node.test) addTemplateExpr(node.test, currentScope, context);
      const ifScope = createScope(currentScope, context);
      if (node.consequent) walkTemplate(node.consequent, ifScope, context);
      if (node.alternate) {
        if (node.alternate.type === 'IfBlock') {
          walkTemplate(node.alternate, currentScope, context);
        } else {
          const elseScope = createScope(currentScope, context);
          walkTemplate(node.alternate, elseScope, context);
        }
      }
      break;
    }
    case 'EachBlock': {
      if (node.expression) addTemplateExpr(node.expression, currentScope, context);
      const eachScope = createScope(currentScope, context);
      const eachMarker = {
        kind: 'each-block', node, span: context.span(node.start, node.end), scope: currentScope,
        expression: node.expression ?? null, context: node.context ?? null, index: node.index ?? null, key: node.key ?? null,
        indexSpan: typeof node.index === 'object' ? context.span(node.index.start, node.index.end) : null,
        bodyScope: eachScope, fallbackScope: null
      };
      context.markers.push(eachMarker);
      if (node.context) addBindingUnit(node.context, eachScope, context);
      if (node.index) {
        if (typeof node.index === 'object') {
          addBindingUnit(node.index, eachScope, context);
        } else if (typeof node.index === 'string') {
          const headerEnd = node.key?.start ?? context.text.indexOf('}', node.context?.end);
          const indexOffsets = addNamedBinding(node.index, node.context?.end, headerEnd, eachScope, context);
          if (indexOffsets) eachMarker.indexSpan = context.span(indexOffsets.start, indexOffsets.end);
        }
      }
      if (node.key) addTemplateExpr(node.key, eachScope, context);
      if (node.body) walkTemplate(node.body, eachScope, context);
      if (node.fallback) {
        const fallbackScope = createScope(currentScope, context);
        eachMarker.fallbackScope = fallbackScope;
        walkTemplate(node.fallback, fallbackScope, context);
      }
      break;
    }
    case 'AwaitBlock': {
      if (node.expression) addTemplateExpr(node.expression, currentScope, context);
      const awaitMarker = {
        kind: 'await-block', node, span: context.span(node.start, node.end), scope: currentScope,
        expression: node.expression ?? null, value: node.value ?? null, error: node.error ?? null,
        pendingScope: null, thenScope: null, catchScope: null
      };
      context.markers.push(awaitMarker);
      if (node.pending) {
        const pendingScope = createScope(currentScope, context);
        awaitMarker.pendingScope = pendingScope;
        walkTemplate(node.pending, pendingScope, context);
      }
      if (node.then) {
        const thenScope = createScope(currentScope, context);
        awaitMarker.thenScope = thenScope;
        if (node.value) addBindingUnit(node.value, thenScope, context);
        walkTemplate(node.then, thenScope, context);
      }
      if (node.catch) {
        const catchScope = createScope(currentScope, context);
        awaitMarker.catchScope = catchScope;
        if (node.error) addBindingUnit(node.error, catchScope, context);
        walkTemplate(node.catch, catchScope, context);
      }
      break;
    }
    case 'KeyBlock': {
      if (node.expression) addTemplateExpr(node.expression, currentScope, context);
      const keyScope = createScope(currentScope, context);
      if (node.fragment) walkTemplate(node.fragment, keyScope, context);
      break;
    }
    case 'SnippetBlock': {
      const snippetMarker = {
        kind: 'snippet-declaration',
        name: node.expression?.name ?? '',
        node,
        span: context.span(node.start, node.end),
        scope: null,
        declarationScope: currentScope,
        parameters: node.parameters ?? [],
        parameterUnits: []
      };
      context.markers.push(snippetMarker);
      if (node.expression) {
        addSyntheticBinding(node.expression.start, node.expression.end, currentScope, context);
      }
      const snippetScope = createScope(currentScope, context);
      snippetMarker.scope = snippetScope;
      if (Array.isArray(node.parameters)) {
        for (const param of node.parameters) {
          snippetMarker.parameterUnits.push(addBindingUnit(param, snippetScope, context));
        }
      }
      if (node.body) walkTemplate(node.body, snippetScope, context);
      break;
    }
    default:
      if (!TEMPLATE_NODES.has(node.type)) {
        if (JS_EXPRESSIONS.has(node.type)) {
          addTemplateExpr(node, currentScope, context);
        } else {
          context.errors.push({
            code: 'unsupported-construct',
            construct: node.type,
            path: context.path,
            span: context.span(node.start ?? 0, node.end ?? 0),
            message: `unsupported template construct: ${node.type}`
          });
        }
      }
      break;
  }
}

function parsePlainScript(file, mod, errors) {
  let text;
  try {
    text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(readFileSync(file));
  } catch {
    errors.push({code: 'parse-error', path: mod.path, span: null, message: 'file could not be read as UTF-8'});
    return null;
  }
  const span = createLocator(text);
  const scopes = [];
  const units = [];
  const markers = [];
  const moduleScope = {id: 0, parent: null, bindings: new Map()};
  scopes.push(moduleScope);
  const scriptKind = mod.kind === 'ts' ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const unit = createUnit('module', text, 0, moduleScope, 0, text.length, scriptKind, errors, mod.path, span);
  units.push(unit);
  return {path: mod.path, text, kind: mod.kind, units, scopes, markers, span};
}

function parseSvelteModule(file, mod, errors) {
  let text;
  try {
    text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(readFileSync(file));
  } catch {
    errors.push({code: 'parse-error', path: mod.path, span: null, message: 'file could not be read as UTF-8'});
    return null;
  }
  const span = createLocator(text);
  let ast;
  try {
    ast = parseSvelte(text, {modern: true});
  } catch (error) {
    const [start, end] = Array.isArray(error?.position) ? error.position : [0, 0];
    errors.push({code: 'parse-error', path: mod.path, span: span(start, end), message: `Svelte parse failed: ${error?.code ?? 'unknown'}`});
    return null;
  }
  const scopes = [];
  const units = [];
  const markers = [];
  let nextScopeId = 0;
  const moduleScope = {id: nextScopeId++, parent: null, bindings: new Map()};
  scopes.push(moduleScope);
  const instanceScope = {id: nextScopeId++, parent: moduleScope, bindings: new Map()};
  scopes.push(instanceScope);

  const modScript = extractScript(ast.module, text, span, errors, mod.path);
  const instScript = extractScript(ast.instance, text, span, errors, mod.path);
  const isTs = (modScript?.scriptKind === ts.ScriptKind.TS) || (instScript?.scriptKind === ts.ScriptKind.TS);
  const templateScriptKind = isTs ? ts.ScriptKind.TS : ts.ScriptKind.JS;

  if (modScript) {
    units.push(createUnit('module', modScript.text, modScript.start, moduleScope, modScript.start, modScript.end, modScript.scriptKind, errors, mod.path, span));
  }
  if (instScript) {
    units.push(createUnit('view', instScript.text, instScript.start, instanceScope, instScript.start, instScript.end, instScript.scriptKind, errors, mod.path, span));
  }

  const walkContext = {
    text,
    span,
    units,
    scopes,
    markers,
    errors,
    path: mod.path,
    scriptKind: templateScriptKind,
    expressionNodes: new WeakSet(),
    nextScopeId
  };

  if (ast.options) {
    markers.push({kind: 'svelte-options', node: ast.options, span: span(ast.options.start, ast.options.end), scope: moduleScope});
    for (const attribute of ast.options.attributes ?? []) walkTemplate(attribute, moduleScope, walkContext);
  }
  if (ast.fragment) {
    walkTemplate(ast.fragment, instanceScope, walkContext);
  }

  return {path: mod.path, text, kind: 'svelte', units, scopes, markers, span};
}

export function parseSemanticModules({projectRoot, graph}) {
  const errors = [];
  if (!projectRoot || typeof projectRoot !== 'string') {
    errors.push({code: 'incomplete-graph', path: '', span: null, message: 'valid projectRoot is required'});
    return {modules: [], errors};
  }
  if (!graph || typeof graph !== 'object' || graph.complete !== true || !Array.isArray(graph.modules) || !Array.isArray(graph.errors) || graph.errors.length > 0) {
    errors.push({code: 'incomplete-graph', path: '', span: null, message: 'graph is incomplete or invalid'});
    return {modules: [], errors};
  }
  const root = resolve(projectRoot);
  const modules = [];
  for (const mod of graph.modules) {
    const file = join(root, mod.path);
    let result;
    if (mod.kind === 'svelte') {
      result = parseSvelteModule(file, mod, errors);
    } else if (mod.kind === 'ts' || mod.kind === 'js') {
      result = parsePlainScript(file, mod, errors);
    } else {
      errors.push({code: 'unsupported-construct', construct: mod.kind, path: mod.path, span: null, message: `unsupported module kind: ${mod.kind}`});
      continue;
    }
    if (result) modules.push(result);
  }
  modules.sort((a, b) => compareText(a.path, b.path));
  return {modules, errors: sortErrors(errors)};
}
