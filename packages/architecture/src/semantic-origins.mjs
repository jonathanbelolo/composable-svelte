// Resolves public import identities through the approved graph. Never reads packages.
import ts from 'typescript';

export function buildOrigins({modules, symbols, graph}) {
  if (!Array.isArray(modules) || !symbols || !graph) throw new TypeError('buildOrigins requires modules, symbols and graph.');
  const modulePaths = new Set();
  for (const module of modules) {
    if (!module || typeof module.path !== 'string' || modulePaths.has(module.path)) throw new TypeError(`Duplicate or invalid semantic module path: ${module?.path}`);
    modulePaths.add(module.path);
  }
  if (Array.isArray(symbols.bindings)) {
    const ids = new Map();
    for (const value of symbols.bindings) {
      if (typeof value?.id !== 'string' || (ids.has(value.id) && ids.get(value.id) !== value)) throw new TypeError(`Duplicate or invalid binding id: ${value?.id}`);
      ids.set(value.id, value);
    }
  }
  const errors = [];
  const owners = new Map();
  const records = new Map();
  const imports = new Map(symbols.imports.map((item) => [item.binding, item]));
  const graphByPath = new Map(graph.modules.map((item) => [item.path, item]));
  const errorKeys = new Set();
  function fail(module, unit, node, construct, message) {
    const start = Math.max(unit.start, node.getStart(unit.sourceFile) + unit.base);
    const end = Math.min(unit.end, node.end + unit.base);
    const key = JSON.stringify([module.path, start, construct, message]);
    if (errorKeys.has(key)) return;
    errorKeys.add(key);
    errors.push({code: 'unsupported-construct', construct, path: module.path, span: module.span(start, end), message});
  }
  function binding(scope, name) {
    for (let current = scope; current; current = current.parent) {
      if (current.bindings.has(name)) return current.bindings.get(name);
    }
    return null;
  }
  function exportedSnippet(record, item) {
    if (!record.component || item.unit.kind !== 'module') return null;
    const markers = record.module.markers.filter((marker) =>
      marker.kind === 'snippet-declaration' && marker.name === item.localName &&
      marker.declarationScope?.parent === item.unit.scope
    );
    if (markers.length !== 1) return null;
    return binding(markers[0].declarationScope, item.localName);
  }
  function target(module, specifier) {
    return graphByPath.get(module.path)?.edges.find((edge) => edge.specifier === specifier)?.target ?? null;
  }
  function leafNames(name) {
    if (ts.isIdentifier(name)) return [name.text];
    if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      return name.elements.flatMap((item) => ts.isOmittedExpression(item) ? [] : leafNames(item.name));
    }
    return [];
  }
  for (const module of modules) {
    const named = new Map();
    const stars = [];
    records.set(module.path, {module, named, stars, component: module.kind === 'svelte'});
    for (const unit of module.units) {
      owners.set(unit, module);
      // Svelte instance exports are component props, not module exports.
      if (unit.kind !== 'module') continue;
      const add = (name, item) => {
        if (!named.has(name)) named.set(name, []);
        named.get(name).push(item);
      };
      for (const node of unit.sourceFile.statements) {
        if (ts.isExportDeclaration(node)) {
          const specifier = node.moduleSpecifier?.text;
          const common = {unit, node, specifier};
          if (!node.exportClause) {
            const to = target(module, specifier);
            if (to?.type !== 'module') fail(module, unit, node, 'star-package-reexport', 'Star re-exports require an inspected local module.');
            else stars.push({...common, target: to.path});
          } else if (ts.isNamespaceExport(node.exportClause)) {
            add(node.exportClause.name.text, {...common, namespace: true});
          } else {
            for (const item of node.exportClause.elements) add(item.name.text, {...common, localName: (item.propertyName ?? item.name).text});
          }
        } else if (ts.isExportAssignment(node)) {
          if (node.isExportEquals) fail(module, unit, node, 'export-equals', 'CommonJS export assignment is not supported.');
          else add('default', {unit, node: node.expression, expression: true});
        } else if (node.modifiers?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword)) {
          const isDefault = node.modifiers.some((item) => item.kind === ts.SyntaxKind.DefaultKeyword);
          const names = ts.isVariableStatement(node) ? node.declarationList.declarations.flatMap((item) => leafNames(item.name)) : node.name ? leafNames(node.name) : [];
          if (isDefault) {
            if (names.length) add('default', {unit, node, localName: names[0]});
            else if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) add('default', {unit, node, expression: true});
            else fail(module, unit, node, 'unmodelled-export', 'This anonymous default export has no modeled value.');
          } else for (const name of names) add(name, {unit, node, localName: name});
        }
      }
    }
  }
  function key(item) {
    if (item.kind === 'binding') return item.binding;
    if (item.kind === 'expression') return `expression:${owners.get(item.unit).path}:${item.unit.base + item.node.pos}`;
    return JSON.stringify(item);
  }
  function unique(items) {
    const objects = new Set(), scalars = new Set(), out = [];
    for (const item of items) {
      const value = key(item), seen = typeof value === 'object' && value !== null ? objects : scalars;
      if (!seen.has(value)) {seen.add(value); out.push(item);}
    }
    return out;
  }
  function resolveTarget(module, specifier, name, seen) {
    const to = target(module, specifier);
    if (!to) return [];
    if (to.type === 'module') {
      if (!records.has(to.path)) return [];
      return name === '*' ? [{kind: 'namespace', path: to.path}] : resolveExportInternal(to.path, name, seen);
    }
    if (to.type === 'package' || to.type === 'builtin') return [{kind: 'external', specifier: to.specifier, name}];
    return []; // Assets contain no executable authorities; graph records this boundary.
  }
  function resolveBindingInternal(value, seen) {
    if (!value) return [];
    if (seen.has(value)) return [];
    seen.add(value);
    const imported = imports.get(value);
    if (!imported) return [{kind: 'binding', binding: value}];
    const module = owners.get(imported.unit);
    if (!module) throw new TypeError('Import unit is missing from semantic modules.');
    return resolveTarget(module, imported.specifier, imported.imported, seen);
  }
  function resolveBinding(value) { return resolveBindingInternal(value, new Set()); }
  function resolveExportInternal(path, name, seen) {
    const mark = `export:${path}:${name}`;
    if (seen.has(mark)) return [];
    seen.add(mark);
    const record = records.get(path);
    if (!record) return [];
    const found = record.named.get(name);
    if (found) {
      const values = unique(found.flatMap((item) => {
        if (item.specifier !== undefined) return resolveTarget(record.module, item.specifier, item.namespace ? '*' : item.localName, seen);
        if (item.expression) return [{kind: 'expression', unit: item.unit, node: item.node}];
        const local = binding(item.unit.scope, item.localName) ?? exportedSnippet(record, item);
        if (!local) fail(record.module, item.unit, item.node, 'unresolved-export-origin', `Cannot establish local export origin for ${item.localName}.`);
        return resolveBindingInternal(local, seen);
      }));
      if (values.length > 1) fail(record.module, found[0].unit, found[0].node, 'ambiguous-export', `Export ${name} has multiple definitions.`);
      return values;
    }
    if (name === 'default') return record.component ? [{kind: 'component', path}] : [];
    const values = unique(record.stars.flatMap((item) => resolveExportInternal(item.target, name, seen)));
    if (values.length > 1) {
      const item = record.stars[0];
      fail(record.module, item.unit, item.node, 'ambiguous-star-export', `Star re-exports expose ambiguous symbol ${name}.`);
    }
    return values;
  }
  const namesMemo = new Map();
  function exportNamesInternal(path, seen) {
    if (seen.has(path)) return [];
    seen.add(path);
    const record = records.get(path);
    if (!record) return [];
    const names = new Set(record.named.keys());
    if (record.component) names.add('default');
    for (const item of record.stars) for (const name of exportNamesInternal(item.target, seen)) if (name !== 'default') names.add(name);
    return [...names].sort();
  }
  function exportNames(path) {
    if (!namesMemo.has(path)) namesMemo.set(path, Object.freeze(exportNamesInternal(path, new Set())));
    return namesMemo.get(path);
  }
  const resolutionMemo = new Map();
  function resolveExport(path, name) {
    const memoKey = JSON.stringify([path, name]);
    if (!resolutionMemo.has(memoKey)) resolutionMemo.set(memoKey, Object.freeze(resolveExportInternal(path, name, new Set())));
    return resolutionMemo.get(memoKey);
  }
  for (const record of records.values()) for (const entries of record.named.values()) for (const item of entries) {
    if (item.namespace && item.specifier !== undefined) {
      const to = target(record.module, item.specifier);
      if (to?.type === 'module' && !records.has(to.path)) fail(record.module, item.unit, item.node, 'unresolved-module-origin', `Namespace export target is not an inspected semantic module: ${to.path}.`);
    }
  }
  // Resolve every enumerable export before errors are finalized. Package stars stay
  // fail-closed above and never become speculative export candidates.
  for (const path of [...records.keys()].sort()) for (const name of exportNames(path)) resolveExport(path, name);
  // Eagerly resolve imported values so missing/ambiguous origins cannot hide until a rule asks.
  for (const item of symbols.imports) {
    const module = owners.get(item.unit);
    if (!module) throw new TypeError('Import unit is missing from semantic modules.');
    if (!resolveBinding(item.binding).length) {
      const to = target(module, item.specifier);
      if (to?.type !== 'asset') fail(module, item.unit, item.node, 'unresolved-import-origin', `Cannot establish import origin for ${item.imported} from ${item.specifier}.`);
    }
  }
  errors.sort((a, b) => a.path.localeCompare(b.path) || a.span.start.offset - b.span.start.offset || a.construct.localeCompare(b.construct));
  const finalErrors = Object.freeze(errors.map(Object.freeze));
  function resolveAll(path) { return new Map(exportNames(path).map((name) => [name, resolveExport(path, name)])); }
  return {errors: finalErrors, resolveBinding, resolveExport, resolveTarget, exportNames, resolveAll};
}
