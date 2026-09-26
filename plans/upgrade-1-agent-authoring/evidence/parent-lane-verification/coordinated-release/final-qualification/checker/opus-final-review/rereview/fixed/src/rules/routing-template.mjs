import {readFileSync} from 'node:fs';
import {isAbsolute, relative, resolve} from 'node:path';
import {parse as parseSvelte} from 'svelte/compiler';

const NEWLINE = String.fromCharCode(10);
const RULE = 'routing/no-manual-browser-authority';
const DETECTOR = 'traversal-listener';
const REPLACEMENT = 'defineApplication routing decisions + dispatch intent';
const DOCS = 'application-routing.md#decisions-and-ordering';
const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const toPosix = (path) => path.split('\\').join('/');

function createLocator(text) {
  const lineStarts = [0];
  for (let index = text.indexOf(NEWLINE); index !== -1; index = text.indexOf(NEWLINE, index + 1)) {
    lineStarts.push(index + 1);
  }
  const locate = (offset) => {
    let line = lineStarts.length - 1;
    while (lineStarts[line] > offset && line > 0) line -= 1;
    return {offset, line: line + 1, column: offset - lineStarts[line] + 1};
  };
  return (start, end) => ({start: locate(start), end: locate(end)});
}
function sortFindings(findings) {
  return [...findings].sort((left, right) => {
    const pathCmp = compareText(left.path, right.path);
    if (pathCmp !== 0) return pathCmp;
    const leftStart = left.span?.start?.offset ?? -1;
    const rightStart = right.span?.start?.offset ?? -1;
    if (leftStart !== rightStart) return leftStart - rightStart;
    const detCmp = compareText(left.detector, right.detector);
    if (detCmp !== 0) return detCmp;
    const leftEnd = left.span?.end?.offset ?? -1;
    const rightEnd = right.span?.end?.offset ?? -1;
    if (leftEnd !== rightEnd) return leftEnd - rightEnd;
    return compareText(left.message ?? '', right.message ?? '');
  });
}

function sortErrors(errors) {
  return [...errors].sort((left, right) => {
    const pathCmp = compareText(left.path ?? '', right.path ?? '');
    if (pathCmp !== 0) return pathCmp;
    const leftStart = left.span?.start?.offset ?? -1;
    const rightStart = right.span?.start?.offset ?? -1;
    if (leftStart !== rightStart) return leftStart - rightStart;
    const codeCmp = compareText(left.code ?? '', right.code ?? '');
    if (codeCmp !== 0) return codeCmp;
    return compareText(left.message ?? '', right.message ?? '');
  });
}

export function evaluateRoutingTemplate({projectRoot, graph}) {
  const findings = [];
  const errors = [];
  const root = resolve(projectRoot);

  if (Array.isArray(graph?.errors)) {
    for (const error of graph.errors) {
      const relPath = error.path ? toPosix(isAbsolute(error.path) ? relative(root, error.path) : error.path) : '';
      errors.push({
        code: error.code ?? 'graph-error',
        path: relPath,
        span: error.span ?? null,
        message: error.message ?? 'unknown graph error'
      });
    }
  }
  if (!Array.isArray(graph?.modules) || (graph.complete !== true && errors.length === 0)) {
    errors.push({code: 'incomplete-graph', path: '', span: null, message: 'routing template analysis requires a complete parsed module graph'});
  }
  const modules = Array.isArray(graph?.modules) ? graph.modules : [];
  for (const module of modules) {
    const modulePath = toPosix(isAbsolute(module.path) ? relative(root, module.path) : module.path);
    if (module.kind !== 'svelte' && !modulePath.endsWith('.svelte')) continue;
    const filePath = resolve(root, modulePath);
    let text;
    try {
      text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(readFileSync(filePath));
    } catch {
      errors.push({code: 'read-error', path: modulePath, span: null, message: 'Svelte source is not readable as UTF-8'});
      continue;
    }
    let ast;
    try {
      ast = parseSvelte(text, {modern: true});
    } catch (err) {
      const locator = createLocator(text);
      const [start, end] = Array.isArray(err?.position) ? err.position : [0, 0];
      errors.push({code: 'parse-error', path: modulePath, span: locator(start, end), message: `Svelte parse failed: ${err?.code ?? 'unknown'}`});
      continue;
    }
    if (!ast.fragment) {
      errors.push({code: 'unsupported-construct', path: modulePath, span: null, message: 'Svelte parser returned no modern template fragment'});
      continue;
    }
    const locator = createLocator(text);
    const seen = new WeakSet();
    const walk = (node) => {
      if (!node || typeof node !== 'object' || seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (node.type === 'SvelteWindow') {
        for (const attr of node.attributes ?? []) {
          const isModern = attr.type === 'Attribute' && (attr.name === 'onpopstate' || attr.name === 'onhashchange');
          const isLegacy = attr.type === 'OnDirective' && (attr.name === 'popstate' || attr.name === 'hashchange');
          if (isModern || isLegacy) {
            if (typeof attr.start === 'number' && typeof attr.end === 'number') {
              findings.push({
                rule: RULE,
                detector: DETECTOR,
                path: modulePath,
                span: locator(attr.start, attr.end),
                message: `Manual browser navigation listener "${attr.name}" is not permitted`,
                replacement: REPLACEMENT,
                docs: DOCS
              });
            } else {
              errors.push({code: 'unsupported-construct', path: modulePath, span: null, message: 'Svelte routing listener has no source span'});
            }
          }
        }
      }
      for (const [key, value] of Object.entries(node)) {
        if (key !== 'parent' && key !== 'metadata') {
          walk(value);
        }
      }
    };
    walk(ast.fragment);
  }
  const seenErrors = new Set();
  const uniqueErrors = [];
  for (const err of errors) {
    const key = `${err.code}:${err.path}:${err.span?.start?.offset ?? -1}:${err.message}`;
    if (!seenErrors.has(key)) {
      seenErrors.add(key);
      uniqueErrors.push(err);
    }
  }
  return {
    findings: sortFindings(findings),
    errors: sortErrors(uniqueErrors)
  };
}
