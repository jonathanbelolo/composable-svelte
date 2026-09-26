import ts from 'typescript';

export function derivedRune(node, context) {
  if (!node || !ts.isCallExpression(node)) return null;
  if (node.questionDotToken) return null;

  // Exactly one argument, not a spread element
  if (!Array.isArray(node.arguments) || node.arguments.length !== 1) return null;
  if (ts.isSpreadElement(node.arguments[0])) return null;

  let form = null;
  let id = null;

  if (ts.isIdentifier(node.expression)) {
    if (node.expression.text === '$derived') {
      form = 'value';
      id = node.expression;
    }
  } else if (ts.isPropertyAccessExpression(node.expression)) {
    if (
      !node.expression.questionDotToken &&
      node.expression.name.text === 'by' &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === '$derived'
    ) {
      form = 'by';
      id = node.expression.expression;
    }
  }

  if (!form || !id) return null;

  // The identifier must be lexically free
  if (context.symbols.bindingOf(id)) return null;

  // The module must be a Svelte compiler context (.svelte, .svelte.ts, or .svelte.js)
  const info = context.info(node);
  const mod = info?.module;
  if (!mod) return null;

  const isSvelte =
    mod.kind === 'svelte' ||
    (typeof mod.path === 'string' && (
      mod.path.endsWith('.svelte') ||
      mod.path.endsWith('.svelte.ts') ||
      mod.path.endsWith('.svelte.js')
    ));

  if (!isSvelte) return null;

  return {form};
}
