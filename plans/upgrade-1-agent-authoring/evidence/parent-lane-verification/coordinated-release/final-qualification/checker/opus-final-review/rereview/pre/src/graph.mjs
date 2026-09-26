// Consumer-architecture graph substrate (development-only).
// Parses the local module graph reachable from exact roots and fails closed on anything it cannot follow.
import {createHash} from 'node:crypto';
import {existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync} from 'node:fs';
import {isBuiltin} from 'node:module';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import ts from 'typescript';
import {VERSION as SVELTE_VERSION, parse as parseSvelte} from 'svelte/compiler';
import {isRegistrySpec} from './version.mjs';

export const MODULE_LIMIT = 5000;
export const PARSER_VERSIONS = Object.freeze({typescript: ts.version, svelte: SVELTE_VERSION});

const NEWLINE = String.fromCharCode(10);
const BACKSLASH = String.fromCharCode(92);
const PROBES = ['.ts', '.js', '.svelte.ts', '.svelte.js', '.d.ts', '/index.ts', '/index.js'];
const UNSUPPORTED_CODE = ['.tsx', '.jsx', '.cjs', '.cts', '.mjs', '.mts'];
const ASSETS = ['.css', '.json', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf'];
const LEAF_QUERIES = ['raw', 'url', 'inline', 'worker', 'sharedworker'];
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
// package.json declarations that can replace or patch what a declared name installs.
const OVERRIDE_FIELDS = [['overrides'], ['resolutions'], ['pnpm', 'overrides'], ['pnpm', 'patchedDependencies'], ['patchedDependencies']];
const RESERVED_DIRECTIVE = /composable-architecture-(ignore|disable)/;
// Svelte template nodes. Any other typed node met in a fragment is an embedded JavaScript expression.
const TEMPLATE_NODES = new Set([
  'Fragment', 'Text', 'Comment', 'RegularElement', 'Component', 'TitleElement', 'SlotElement', 'SvelteBody', 'SvelteBoundary',
  'SvelteComponent', 'SvelteDocument', 'SvelteElement', 'SvelteFragment', 'SvelteHead', 'SvelteOptions', 'SvelteSelf', 'SvelteWindow',
  'ExpressionTag', 'HtmlTag', 'ConstTag', 'DebugTag', 'RenderTag', 'AttachTag', 'IfBlock', 'EachBlock', 'AwaitBlock', 'KeyBlock',
  'SnippetBlock', 'Attribute', 'SpreadAttribute', 'AnimateDirective', 'BindDirective', 'ClassDirective', 'LetDirective', 'OnDirective',
  'StyleDirective', 'TransitionDirective', 'UseDirective'
]);

const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const toPosix = (path) => path.split(sep).join('/');
const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

function isInside(child, parent) {
  const path = relative(parent, child);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

// Node and bundlers resolve empty, dot, dot-dot and percent-encoded segments out of the package directory.
function hasUnsafeSubpath(specifier, name) {
  if (specifier === name) return false;
  return specifier.includes('%') || specifier.slice(name.length + 1).split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

// Selector keys of override and patch declarations, including nested npm overrides. A declaration that cannot be read is kept as '*'.
function collectOverrideKeys(value, keys) {
  if (value === undefined) return;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    keys.push('*');
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    keys.push(key);
    if (nested !== null && typeof nested === 'object') collectOverrideKeys(nested, keys);
  }
}

// Conservative on purpose: any selector containing '*' targets every package; otherwise exact, prefix, suffix and segment shapes target the name.
function overrideTargets(key, name) {
  if (key === '*') return true;
  if (key.includes('*')) return true;
  return key.split('>').some((part) => {
    const selector = part.trim();
    return selector === name || selector.startsWith(`${name}@`) || selector.endsWith(`/${name}`) || selector.includes(`/${name}@`);
  });
}
const finding = (code, path, span, specifier, message) => ({code, path, span, specifier, message});

function sortFindings(findings) {
  const offset = (item) => (item.span ? item.span.start.offset : -1);
  return [...findings].sort((left, right) => compareText(left.path, right.path) || offset(left) - offset(right) || compareText(left.code, right.code) || compareText(left.message, right.message));
}

function kindOf(path) {
  if (path.endsWith('.svelte')) return 'svelte';
  if (UNSUPPORTED_CODE.some((extension) => path.endsWith(extension))) return 'unsupported';
  if (path.endsWith('.ts')) return 'ts';
  if (path.endsWith('.js')) return 'js';
  return ASSETS.some((extension) => path.endsWith(extension)) ? 'asset' : 'unsupported';
}

// Spans are UTF-16 offsets into the original file with 1-based line and column.
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

// Collects edges and fail-closed findings from one script text. `base` maps node offsets back
// into the original file, so Svelte script bodies keep their original spans.
function scanScript(text, scriptKind, base, span, out) {
  const source = ts.createSourceFile(scriptKind === ts.ScriptKind.TS ? 'module.ts' : 'module.js', text, ts.ScriptTarget.Latest, true, scriptKind);
  if (!Array.isArray(source.parseDiagnostics)) throw new Error('TypeScript parse diagnostics are unavailable; refusing to analyze');
  for (const diagnostic of source.parseDiagnostics) {
    const start = base + (diagnostic.start ?? 0);
    out.errors.push({code: 'parse-error', span: span(start, start + (diagnostic.length ?? 0)), message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')});
  }
  if (source.parseDiagnostics.length > 0) return 0;
  const nodeSpan = (node) => span(base + node.getStart(source), base + node.getEnd());
  const edge = (kind, literal, typeOnly) => out.edges.push({kind, specifier: literal.text, typeOnly, span: nodeSpan(literal)});
  const unsupported = (node, message) => out.errors.push({code: 'unsupported-syntax', span: nodeSpan(node), message});
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      edge('import', node.moduleSpecifier, Boolean(node.importClause?.isTypeOnly));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      edge('re-export', node.moduleSpecifier, node.isTypeOnly);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      unsupported(node, 'import-equals require is not supported');
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteralLike(argument)) edge('dynamic-import', argument, false);
      else out.errors.push({code: 'nonliteral-dynamic-import', span: nodeSpan(argument ?? node), message: 'dynamic import specifier must be a string literal'});
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      unsupported(node, 'require calls are not supported');
    } else if (ts.isPropertyAccessExpression(node) && ts.isMetaProperty(node.expression) && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword && node.name.text === 'glob') {
      unsupported(node, 'import.meta.glob is not supported');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return source.statements.length;
}

function svelteScriptKind(attributes) {
  for (const attribute of attributes) {
    if (attribute.name !== 'lang' || attribute.value === true) continue;
    const value = [].concat(attribute.value).map((part) => part.data ?? '').join('');
    if (value === 'ts' || value === 'typescript') return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.JS;
}

// Script bodies are re-parsed by TypeScript at their original offsets; template expressions keep the offsets of the Svelte parser.
function scanSvelte(text, span, out) {
  let ast;
  try {
    ast = parseSvelte(text, {modern: true});
  } catch (error) {
    const [start, end] = Array.isArray(error?.position) ? error.position : [0, 0];
    out.errors.push({code: 'parse-error', span: span(start, end), message: `Svelte parse failed: ${error?.code ?? 'unknown'}`});
    return 0;
  }
  let statements = 0;
  for (const [kind, script] of [['module-script', ast.module], ['instance-script', ast.instance]]) {
    if (!script) continue;
    const attributes = script.attributes ?? [];
    const open = text.indexOf('>', attributes.length > 0 ? attributes[attributes.length - 1].end : script.start);
    const close = text.lastIndexOf('</script', script.end);
    if (open === -1 || close <= open) throw new Error('Svelte script span is unavailable; refusing to analyze');
    out.segments.push({kind, ...span(open + 1, close)});
    statements += scanScript(text.slice(open + 1, close), svelteScriptKind(attributes), open + 1, span, out);
  }
  const seen = new WeakSet();
  const walk = (node, inExpression) => {
    if (node === null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) walk(child, inExpression);
      return;
    }
    let inside = inExpression;
    if (!inside && typeof node.type === 'string' && !TEMPLATE_NODES.has(node.type)) {
      if (typeof node.start !== 'number' || typeof node.end !== 'number') {
        out.errors.push({code: 'unsupported-syntax', span: span(0, 0), message: `template expression without source positions: ${node.type}`});
        return;
      }
      out.segments.push({kind: 'template-expression', ...span(node.start, node.end)});
      inside = true;
    }
    if (inside && node.type === 'ImportExpression') {
      const source = node.source ?? node;
      const literal = source.type === 'Literal' ? source.value : source.type === 'TemplateLiteral' && source.expressions.length === 0 ? source.quasis[0].value.cooked : undefined;
      if (typeof literal === 'string') out.edges.push({kind: 'dynamic-import', specifier: literal, typeOnly: false, span: span(source.start, source.end)});
      else out.errors.push({code: 'nonliteral-dynamic-import', span: span(source.start, source.end), message: 'dynamic import specifier must be a string literal'});
    }
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'parent' && key !== 'metadata') walk(value, inside);
    }
  };
  walk(ast.fragment, false);
  const markup = (ast.fragment?.nodes ?? []).some((node) => node.type !== 'Text' || String(node.data ?? '').trim() !== '');
  return statements + (markup ? 1 : 0);
}

function parseModule(file, kind) {
  const out = {edges: [], errors: [], segments: [], statements: 0};
  let text;
  try {
    text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(readFileSync(file));
  } catch {
    out.errors.push({code: 'parse-error', span: createLocator('')(0, 0), message: 'file is not readable as UTF-8'});
    return out;
  }
  const span = createLocator(text);
  const directive = RESERVED_DIRECTIVE.exec(text);
  if (directive) out.errors.push({code: 'reserved-directive', span: span(directive.index, directive.index + directive[0].length), message: 'inline architecture suppressions are not accepted'});
  out.statements = kind === 'svelte' ? scanSvelte(text, span, out) : scanScript(text, kind === 'ts' ? ts.ScriptKind.TS : ts.ScriptKind.JS, 0, span, out);
  out.edges.sort((left, right) => left.span.start.offset - right.span.start.offset);
  out.segments.sort((left, right) => left.start.offset - right.start.offset);
  return out;
}

// Existence is checked with exact on-disk case so case-insensitive filesystems behave like Linux.
function exactFile(context, file) {
  try {
    if (!statSync(file).isFile()) return false;
  } catch {
    return false;
  }
  let current = context.root;
  for (const segment of relative(context.root, file).split(sep)) {
    if (segment === '..') {
      current = dirname(current);
      continue;
    }
    if (!context.listings.has(current)) context.listings.set(current, readdirSync(current));
    if (!context.listings.get(current).includes(segment)) return false;
    current = join(current, segment);
  }
  return true;
}

// Local targets must stay inside the project and outside node_modules, lexically and after symlink resolution.
function escapesProject(context, file) {
  const lexical = toPosix(relative(context.root, file)).split('/');
  const real = toPosix(relative(context.realRoot, realpathSync(file))).split('/');
  return [lexical, real].some((segments) => segments[0] === '..' || segments.includes('node_modules'));
}

function probe(context, base) {
  if (exactFile(context, base)) return [base];
  const candidates = base.endsWith('.js') ? [`${base.slice(0, -3)}.ts`] : [];
  for (const suffix of PROBES) candidates.push(base + suffix);
  return candidates.filter((candidate) => exactFile(context, candidate));
}

function matchPaths(specifier, paths) {
  let best;
  for (const pattern of Object.keys(paths)) {
    const star = pattern.indexOf('*');
    if (star === -1) {
      if (pattern === specifier) return {pattern, captured: ''};
      continue;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    const fits = specifier.length >= prefix.length + suffix.length && specifier.startsWith(prefix) && specifier.endsWith(suffix);
    if (fits && (!best || prefix.length > best.prefixLength)) best = {pattern, captured: specifier.slice(prefix.length, specifier.length - suffix.length), prefixLength: prefix.length};
  }
  return best;
}

function isExported(exportsField, subpath) {
  if (exportsField === undefined) return true;
  if (exportsField === null || typeof exportsField !== 'object' || Array.isArray(exportsField)) return subpath === '.';
  const keys = Object.keys(exportsField);
  if (!keys.some((key) => key.startsWith('.'))) return subpath === '.';
  return keys.some((key) => {
    if (exportsField[key] === null) return false;
    const star = key.indexOf('*');
    if (star === -1) return key === subpath;
    return subpath.length >= key.length && subpath.startsWith(key.slice(0, star)) && subpath.endsWith(key.slice(star + 1));
  });
}

// Packages are opaque leaves that are never read or traversed. Opacity is authorized only by an external approval plus matching
// declaration, install location, manifest identity and export facts; a declaration plus a successful resolution never suffices.
// Installed contents and effective install provenance are not checked here: they are delegated to outer materialization.
function packageProblem(context, specifier) {
  const parts = specifier.split('/');
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  if (hasUnsafeSubpath(specifier, name)) return `package subpath contains an empty, dot, dot-dot or percent-encoded segment: ${specifier}`;
  const approval = context.opaquePackages.get(name);
  if (!approval) return `package lacks external opaque-package approval: ${name}`;
  const declarations = context.declared.get(name);
  if (!declarations) return `package is not declared in the project package.json: ${name}`;
  const fields = declarations.map((declaration) => declaration.field).join(', ');
  if (declarations.some((declaration) => typeof declaration.spec !== 'string')) return `package dependency specification is not a string: ${name} (${fields})`;
  if (declarations.some((declaration) => declaration.spec !== declarations[0].spec)) return `package dependency declarations are not identical: ${name} (${fields})`;
  const overrideKey = context.overrideKeys.find((key) => overrideTargets(key, name));
  if (overrideKey !== undefined) return `package is targeted by an override, resolution or patch declaration: ${name} (${overrideKey})`;
  const declaredSpec = declarations[0].spec;
  const pkgDir = join(context.root, 'node_modules', name);
  if (!context.manifests.has(name)) {
    try {
      context.manifests.set(name, JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')));
    } catch {
      context.manifests.set(name, null);
    }
  }
  const manifest = context.manifests.get(name);
  if (manifest === null || typeof manifest !== 'object') return `package is not installed under the project node_modules: ${name}`;
  if (manifest.name !== approval.name || manifest.version !== approval.version) {
    return `installed package name or version does not match external approval: ${name} (${manifest.name}@${manifest.version} !== ${approval.name}@${approval.version})`;
  }
  let realPkgDir, isSymlink = false;
  try {
    isSymlink = lstatSync(pkgDir).isSymbolicLink();
    realPkgDir = realpathSync(pkgDir);
  } catch {
    return `package directory could not be resolved: ${name}`;
  }
  let realNm;
  try {
    realNm = realpathSync(join(context.root, 'node_modules'));
  } catch {
    return `project node_modules directory could not be resolved: ${name}`;
  }
  if (realNm !== join(context.realRoot, 'node_modules')) return `project node_modules directory is not the real project node_modules: ${name}`;
  if (approval.provenance === 'registry') {
    if (!isRegistrySpec(declaredSpec)) return `package dependency specification is not registry-shaped: ${name} (${declaredSpec})`;
  } else if (approval.provenance === 'pinned-tarball') {
    if (!declaredSpec.startsWith('file:')) return `tarball package dependency specification must be a file: reference: ${name} (${declaredSpec})`;
    const rawPath = declaredSpec.slice('file:'.length);
    const archivePath = resolve(context.root, rawPath);
    let st;
    try { st = statSync(archivePath); } catch { return `tarball artifact does not exist: ${name} (${rawPath})`; }
    if (!st.isFile()) return `tarball artifact is not a regular file: ${name} (${rawPath})`;
    let archiveBytes;
    try { archiveBytes = readFileSync(archivePath); } catch { return `tarball artifact could not be read: ${name} (${rawPath})`; }
    const archiveSha = sha256Hex(archiveBytes);
    if (archiveSha !== approval.sha256) return `tarball artifact sha256 does not match approval: ${name} (${archiveSha} !== ${approval.sha256})`;
  } else {
    return `package has unsupported provenance approval: ${name} (${approval.provenance})`;
  }
  // Both provenances: an ordinary directory under the real node_modules, or a pnpm leaf symlink into its .pnpm store.
  if (!isInside(realPkgDir, realNm)) return `package installation resolves outside node_modules: ${name}`;
  if (isSymlink && !isInside(realPkgDir, join(realNm, '.pnpm'))) return `symlinked package target is not inside node_modules/.pnpm: ${name}`;
  const subpath = specifier === name ? '.' : `.${specifier.slice(name.length)}`;
  return isExported(manifest.exports, subpath) ? undefined : `package does not export ${subpath}: ${name}`;
}

function resolveEdge(context, importer, edge) {
  const mark = edge.specifier.indexOf('?');
  const bare = mark === -1 ? edge.specifier : edge.specifier.slice(0, mark);
  const query = mark === -1 ? undefined : edge.specifier.slice(mark + 1);
  const unsupported = (message) => ({error: 'unsupported-specifier', message});
  if (query !== undefined && !LEAF_QUERIES.includes(query)) return unsupported(`unknown import query: ?${query}`);
  let bases;
  if (bare === '.' || bare === '..' || bare.startsWith('./') || bare.startsWith('../')) {
    bases = [resolve(dirname(importer.file), bare)];
  } else {
    const alias = matchPaths(bare, context.tsconfig.paths);
    if (alias) bases = context.tsconfig.paths[alias.pattern].map((target) => resolve(context.tsconfig.base, target.replace('*', () => alias.captured)));
    else if (bare === '' || bare.startsWith('/') || bare.startsWith('#') || bare.includes(BACKSLASH)) return unsupported('only relative, alias, package and builtin specifiers are supported');
    else if (isBuiltin(bare)) return {target: {type: 'builtin', specifier: bare}};
    else if (bare.includes(':')) return unsupported('only relative, alias, package and builtin specifiers are supported');
    else if (context.tsconfig.hasBaseUrl && probe(context, resolve(context.tsconfig.base, bare)).length > 0) bases = [resolve(context.tsconfig.base, bare)];
  }
  if (bases === undefined) {
    const problem = edge.typeOnly ? undefined : packageProblem(context, bare);
    if (problem) return {error: 'unresolved-package-import', message: problem};
    return {target: {type: 'package', specifier: bare, typeOnly: edge.typeOnly}};
  }
  const found = [...new Set(bases.flatMap((base) => probe(context, base)))];
  if (found.length === 0) return {error: 'unresolved-local-import', message: 'local import does not resolve to an existing file'};
  if (found.length > 1) return {error: 'ambiguous-resolution', message: `local import resolves to more than one file: ${found.map((file) => toPosix(relative(context.root, file))).join(', ')}`};
  if (escapesProject(context, found[0])) return {error: 'resolution-escapes-project', message: 'local import must stay inside the project and outside node_modules'};
  const path = toPosix(relative(context.root, found[0]));
  const kind = query === undefined ? kindOf(path) : 'asset';
  if (kind === 'unsupported') return {error: 'unsupported-extension', message: `reachable file has an unsupported extension: ${path}`};
  if (kind === 'asset') return {target: {type: 'asset', path, query: query ?? null}};
  return {target: {type: 'module', path}, file: found[0], kind};
}

function readDeclared(root, errors) {
  const declared = new Map();
  const overrideKeys = [];
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    for (const field of DEPENDENCY_FIELDS) {
      // Every declaration is kept: package managers disagree on which dependency field wins.
      for (const [name, spec] of Object.entries(manifest[field] ?? {})) declared.set(name, [...(declared.get(name) ?? []), {field, spec}]);
    }
    for (const path of OVERRIDE_FIELDS) collectOverrideKeys(path.reduce((value, key) => value?.[key], manifest), overrideKeys);
  } catch {
    errors.push(finding('project-manifest-unreadable', 'package.json', null, null, 'project package.json could not be read'));
  }
  return {declared, overrideKeys};
}

// Only baseUrl and paths are honored. Any configuration problem fails closed.
function loadTsconfig(root, tsconfig, errors) {
  const file = join(root, tsconfig);
  const read = ts.readConfigFile(file, ts.sys.readFile);
  const parsed = read.error ? undefined : ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(file), undefined, file);
  const problems = parsed ? parsed.errors.filter((diagnostic) => diagnostic.code !== 18003) : [read.error];
  if (problems.length > 0) {
    errors.push(finding('tsconfig-invalid', tsconfig, null, null, `policy tsconfig could not be read or parsed (TS${problems[0].code})`));
    return {base: root, paths: {}, hasBaseUrl: false};
  }
  const {baseUrl, paths, pathsBasePath} = parsed.options;
  return {base: baseUrl ?? pathsBasePath ?? dirname(file), paths: paths ?? {}, hasBaseUrl: baseUrl !== undefined};
}

export function buildGraph({projectRoot, roots, tsconfig, opaquePackages = []}) {
  const root = resolve(projectRoot);
  const errors = [];
  const context = {root, realRoot: realpathSync(root), listings: new Map(), manifests: new Map()};
  Object.assign(context, readDeclared(root, errors));
  context.tsconfig = loadTsconfig(root, tsconfig, errors);
  context.opaquePackages = new Map();
  for (const pkg of opaquePackages) if (pkg && typeof pkg.name === 'string') context.opaquePackages.set(pkg.name, pkg);
  const modules = new Map();
  const queue = [];
  const rootPaths = new Set();
  let limitReported = false;
  const enqueue = (path, file, kind) => {
    if (modules.has(path)) return;
    if (modules.size >= MODULE_LIMIT) {
      if (!limitReported) errors.push(finding('analysis-limit', path, null, null, `reachable graph exceeds ${MODULE_LIMIT} modules`));
      limitReported = true;
      return;
    }
    modules.set(path, {path, kind, file, segments: [], edges: []});
    queue.push(path);
  };
  if (roots.length === 0) errors.push(finding('empty-roots', '', null, null, 'at least one exact root file is required'));
  for (const rootPath of roots) {
    const file = join(root, rootPath);
    const kind = kindOf(rootPath);
    if (!exactFile(context, file)) errors.push(finding('missing-root', rootPath, null, null, 'root is not an existing regular file'));
    else if (escapesProject(context, file)) errors.push(finding('resolution-escapes-project', rootPath, null, null, 'root must stay inside the project and outside node_modules'));
    else if (kind === 'unsupported' || kind === 'asset') errors.push(finding('unsupported-extension', rootPath, null, null, 'root must be a supported code file'));
    else {
      rootPaths.add(rootPath);
      enqueue(rootPath, file, kind);
    }
  }
  for (let index = 0; index < queue.length; index += 1) {
    const current = modules.get(queue[index]);
    const parsed = parseModule(current.file, current.kind);
    current.segments = parsed.segments;
    for (const error of parsed.errors) errors.push(finding(error.code, current.path, error.span, null, error.message));
    if (rootPaths.has(current.path) && parsed.errors.length === 0 && parsed.statements === 0) errors.push(finding('empty-root-module', current.path, null, null, 'root module contains no statements'));
    for (const edge of parsed.edges) {
      const resolution = resolveEdge(context, current, edge);
      if (resolution.error) {
        errors.push(finding(resolution.error, current.path, edge.span, edge.specifier, resolution.message));
        continue;
      }
      current.edges.push({kind: edge.kind, specifier: edge.specifier, typeOnly: edge.typeOnly, span: edge.span, target: resolution.target});
      if (resolution.target.type === 'module') enqueue(resolution.target.path, resolution.file, resolution.kind);
    }
  }
  const list = [...modules.values()].sort((left, right) => compareText(left.path, right.path)).map(({path, kind, segments, edges}) => ({path, kind, segments, edges}));
  const targets = list.flatMap((item) => item.edges.map((edge) => edge.target));
  const distinct = (type, key) => [...new Set(targets.filter((target) => target.type === type).map((target) => target[key]))].sort(compareText);
  const findings = sortFindings(errors);
  return {
    roots: [...roots],
    modules: list,
    assets: distinct('asset', 'path'),
    packageSpecifiers: distinct('package', 'specifier'),
    builtins: distinct('builtin', 'specifier'),
    errors: findings,
    complete: findings.length === 0 && list.length > 0 && list.length >= roots.length
  };
}
