// Bounded template-seeding pass for Composable Svelte.
// Seeds potential authority and source facts for the five existing detector families.
import ts from 'typescript';

const ZERO_SPAN = Object.freeze({start: {line: 1, column: 0, offset: 0}, end: {line: 1, column: 0, offset: 0}});

export function createTemplateSeeds(context, flow) {
  const wiringSitesMap = new Map();
  const callbackSitesMap = new Map();
  const lifecycleSitesMap = new Map();
  const errorsMap = new Map();
  const definitions = new Map();
  const storedCallSites = new Map();

  const unwrap = (node) => {
    let curr = node;
    while (curr && (ts.isParenthesizedExpression(curr) || ts.isAsExpression(curr) || ts.isNonNullExpression(curr) || ts.isSatisfiesExpression(curr))) curr = curr.expression;
    return curr;
  };

  const nodeId = (node) => context.info(node)?.id ?? (node ? `pos:${node.pos}` : 'unknown');

  function recordSite(map, node, value) {
    if (!node || !value || value.size === 0) return;
    const existing = map.get(node);
    if (!existing) map.set(node, {node, value: new Set(value)});
    else existing.value = flow.domain.join(existing.value, value);
  }

  function addError(node, construct, message, fallback = null) {
    const info = node ? context.info(node) : null;
    const mod = info?.module ?? (fallback?.path ? context.modules.find((m) => m.path === fallback.path) : null) ?? context.modules[0] ?? null;
    const span = info ? context.span(node) : (fallback?.span ?? (mod && typeof mod.span === 'function' ? mod.span(0, 0) : ZERO_SPAN));
    const path = mod?.path ?? '';
    const key = `${path}:${span.start.offset}:${construct}:${message}`;
    if (errorsMap.has(key)) return;
    errorsMap.set(key, Object.freeze({code: 'unsupported-construct', construct, path, span, message}));
  }

  function extractSvelteExpr(value) {
    if (!value) return null;
    if (Array.isArray(value)) {
      const tag = value.find((v) => v.type === 'ExpressionTag');
      return tag?.expression ?? null;
    }
    if (value.type === 'ExpressionTag') return value.expression;
    if (typeof value === 'object' && value.expression) return value.expression;
    return value;
  }

  function resolveExpression(module, svelteNode) {
    if (!svelteNode || typeof svelteNode.start !== 'number' || typeof svelteNode.end !== 'number') return null;
    const units = module.units.filter((u) => u.kind === 'template'
      && u.start === svelteNode.start && u.end === svelteNode.end);
    if (units.length === 1) return unwrap(units[0].sourceFile.statements[0]?.expression);
    return null;
  }

  function resolveComponent(module, marker) {
    if (marker.node.type === 'SvelteComponent') {
      const attrs = marker.node.attributes ?? [];
      if (attrs.some((a) => ['options', 'definition', 'view', 'store'].includes(a.name))) {
        addError(null, 'unsupported-dynamic-component', 'Dynamic svelte:component is not supported for framework boundaries.', {path: module.path, span: marker.span});
      }
      return {value: flow.domain.empty(), anchor: null, localModule: null};
    }
    const parts = marker.name.split('.');
    const rootBinding = context.resolveName(marker.scope, parts[0]);
    if (!rootBinding) return {value: flow.domain.empty(), anchor: null, localModule: null};
    let currentVal = flow.bindingValue(rootBinding);
    for (let i = 1; i < parts.length; i++) {
      currentVal = flow.property(currentVal, parts[i], marker.node, {computed: false});
    }
    let anchor = null;
    let localModule = null;
    const alternatives = new Set();
    for (const atom of currentVal) {
      const a = flow.authority.anchor(atom);
      const info = flow.domain.describe(atom);
      if (a) {
        alternatives.add(`anchor:${a.kind}`);
        anchor = a;
      } else if (info.kind === 'component') {
        alternatives.add(`component:${info.id}`);
        const mod = context.modules.find((m) => m.path === info.id);
        if (mod && mod.kind === 'svelte') localModule = mod;
      } else alternatives.add(`${info.kind}:${info.id}`);
    }
    if (alternatives.size > 1 && (anchor || localModule)) {
      addError(null, 'unsupported-component-union', 'Component alternatives require separate statically resolved tags.', {path: module.path, span: marker.span});
      anchor = null;
      localModule = null;
    }
    return {value: currentVal, anchor, localModule};
  }

  function seedComponentProps(childMod, propsHeap) {
    const instanceUnit = childMod.units.find((u) => u.kind === 'view');
    if (!instanceUnit) return;
    const walk = (node) => {
      if (ts.isCallExpression(node)) {
        const callee = unwrap(node.expression);
        if (ts.isIdentifier(callee) && callee.text === '$props' && !context.symbols.bindingOf(callee)) {
          flow.seedNode(node, propsHeap);
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(instanceUnit.sourceFile);
    for (const stmt of instanceUnit.sourceFile.statements) {
      if (ts.isVariableStatement(stmt) && (stmt.declarationList.flags & ts.NodeFlags.Let) && stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const decl of stmt.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const b = context.symbols.bindingOf(decl.name);
            if (b) {
              const propVal = flow.domain.read(propsHeap, decl.name.text);
              if (propVal.size > 0) flow.seedBinding(b, propVal);
            }
          }
        }
      }
    }
  }

  function objectBindingMutated(binding) {
    const heaps = new Set([...flow.bindingValue(binding)].filter((atom) => flow.domain.describe(atom).kind === 'heap'));
    for (const assignment of flow.assignments.values()) for (const target of assignment.targets ?? [assignment.target]) {
      let root = unwrap(target);
      while (root && (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root))) root = unwrap(root.expression);
      if (!root || !ts.isIdentifier(root)) continue;
      const other = context.symbols.bindingOf(root);
      if (other === binding) return true;
      if (root !== unwrap(target) && [...flow.bindingValue(other)].some((atom) => heaps.has(atom))) return true;
    }
    return false;
  }

  // Keep object alternatives separate until all ordered writes have been applied.
  // A later static property replaces an earlier spread property in the same branch.
  function objectAlternatives(node, seen = new Set()) {
    node = unwrap(node);
    if (!node || seen.has(node)) return null;
    const path = new Set(seen).add(node);
    if (ts.isIdentifier(node)) {
      const binding = context.symbols.bindingOf(node);
      const declarations = binding?.declarations ?? [];
      if (declarations.length !== 1 || objectBindingMutated(binding)) return null;
      return objectAlternatives(declarations[0].node.initializer, path);
    }
    if (ts.isConditionalExpression(node)) {
      const yes = objectAlternatives(node.whenTrue, path);
      const no = objectAlternatives(node.whenFalse, path);
      return yes && no && yes.length + no.length <= 64 ? [...yes, ...no] : null;
    }
    if (!ts.isObjectLiteralExpression(node)) return null;
    let alternatives = [new Map()];
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spread = objectAlternatives(property.expression, path);
        if (!spread || alternatives.length * spread.length > 64) return null;
        alternatives = alternatives.flatMap((before) => spread.map((after) => new Map([...before, ...after])));
        continue;
      }
      if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property) && !ts.isMethodDeclaration(property)) return null;
      const key = ts.isComputedPropertyName(property.name) ? property.name.expression : property.name;
      if (!ts.isIdentifier(key) && !ts.isStringLiteralLike(key) && !ts.isNumericLiteral(key)) return null;
      if (ts.isComputedPropertyName(property.name) && ts.isIdentifier(key)) return null;
      const value = ts.isPropertyAssignment(property) ? property.initializer
        : ts.isShorthandPropertyAssignment(property) ? property.name : property;
      for (const alternative of alternatives) alternative.set(key.text, value);
    }
    return alternatives;
  }

  function objectEntries(node) {
    const alternatives = objectAlternatives(node);
    if (!alternatives) {
      addError(node, 'unsupported-object-shape', 'This declaration or prop spread requires inspectable static property names and object alternatives.');
      return [];
    }
    return alternatives.flatMap((alternative) => [...alternative]);
  }

  // Resolve a component/native attribute list in source order. Values are projected
  // from the real flow heap, so aliases and property writes retain existing taint.
  function attributeAlternatives(module, marker) {
    let alternatives = [new Map()];
    for (const attr of marker.node.attributes ?? []) {
      if (attr.type === 'Attribute') {
        let node = null, value;
        if (attr.value === true) value = flow.domain.atom('literal', JSON.stringify(true));
        else if (Array.isArray(attr.value) && attr.value.every((part) => part.type === 'Text')) {
          value = flow.domain.atom('literal', JSON.stringify(attr.value.map((part) => part.data).join('')));
        } else if (Array.isArray(attr.value) && (attr.value.length > 1 || attr.value.some((part) => part.type === 'Text'))) {
          // Interpolated attribute text is a string, never the embedded callable or authority.
          value = flow.domain.empty();
        } else {
          node = resolveExpression(module, extractSvelteExpr(attr.value));
          if (!node) {
            addError(null, 'unsupported-mapping', 'Attribute has no trustworthy source mapping.', {path: module.path, span: marker.span});
            continue;
          }
          value = flow.value(node);
        }
        for (const alternative of alternatives) alternative.set(attr.name, {node, value});
      } else if (attr.type === 'SpreadAttribute') {
        const node = resolveExpression(module, attr.expression);
        const shapes = node && objectAlternatives(node);
        if (!shapes || alternatives.length * shapes.length > 64) {
          addError(node, 'unsupported-prop-spread', 'Prop spread requires bounded inspectable object alternatives with static keys.', {path: module.path, span: marker.span});
          return [];
        }
        const receiver = flow.value(node);
        alternatives = alternatives.flatMap((before) => shapes.map((shape) => {
          const result = new Map(before);
          for (const key of shape.keys()) result.set(key, {node, value: flow.property(receiver, key, node, {computed: false})});
          return result;
        }));
      }
    }
    return alternatives;
  }

  function processDefineViews(callNode, args) {
    let record = definitions.get(callNode);
    if (!record) {
      record = {defHeap: flow.domain.allocate(`view-definitions:${nodeId(callNode)}`),
        handlesHeap: flow.domain.allocate(`view-handles:${nodeId(callNode)}`), handleMap: new Map(), busy: false};
      definitions.set(callNode, record);
    }
    if (record.busy) return record;
    record.busy = true;
    try {
      for (const [slotName, declaration] of objectEntries(args[1]?.node)) {
        const handleKey = `view-handle:${nodeId(callNode)}:${slotName}`;
        let entry = record.handleMap.get(handleKey);
        if (!entry) {
          entry = {handleAtom: flow.domain.atom('feature-handle', handleKey), snippets: new Set()};
          record.handleMap.set(handleKey, entry);
        }
        flow.domain.write(record.handlesHeap, slotName, entry.handleAtom);
        function visitRenderer(node, path, seen = new Set()) {
          if (seen.has(node)) return;
          seen.add(node);
          const fields = objectEntries(node);
          let nested = flow.domain.empty();
          for (const [name, valueNode] of fields) if (name === 'children') {
            const value = flow.value(valueNode);
            for (const def of definitions.values()) for (const atom of def.defHeap) {
              if (value.has(atom)) nested = flow.domain.join(nested, def.handlesHeap);
            }
          }
          const props = flow.domain.allocate(`view-context:${handleKey}:${path}`);
          flow.domain.write(props, 'store', flow.authority.authority('view'));
          flow.domain.write(props, 'views', flow.domain.join(flow.authority.authority('views'), nested));
          for (const [name, valueNode] of fields) {
            if (name === 'cases') {
              for (const [caseName, caseNode] of objectEntries(valueNode)) visitRenderer(caseNode, `${path}/${caseName}`, new Set(seen));
            } else if (name === 'content') {
              const snippets = new Set([...flow.value(valueNode)].filter((atom) => flow.domain.describe(atom).kind === 'snippet'));
              for (const atom of snippets) entry.snippets.add(atom);
              flow.invokeLocal(snippets, [{node: valueNode, value: props, spread: false}], valueNode);
            } else if (name === 'render') {
              for (const atom of flow.value(valueNode)) {
                const info = flow.domain.describe(atom);
                if (info.kind !== 'component') continue;
                const child = context.modules.find((m) => m.path === info.id && m.kind === 'svelte');
                if (child) seedComponentProps(child, props);
              }
            }
          }
        }
        visitRenderer(declaration, 'slot');
      }
      flow.seedNode(callNode, record.defHeap);
    } finally { record.busy = false; }
    return record;
  }

  function findSnippet(module, child) {
    return [...context.snippets.values()].find((s) => s.module === module && s.marker.node === child);
  }

  function handleFrameworkChildren(module, marker, argValue) {
    const ownerNode = marker.node;
    const attributes = ownerNode.attributes ?? [];
    const explicit = attributes.find((a) => a.type === 'Attribute' && a.name === 'children');
    if (explicit) {
      const childrenTsNode = resolveExpression(module, extractSvelteExpr(explicit.value));
      if (childrenTsNode) {
        const snippetVal = flow.value(childrenTsNode);
        if (argValue && argValue.size > 0) {
          flow.invokeLocal(snippetVal, [{node: childrenTsNode, value: argValue, spread: false}], childrenTsNode);
        }
        recordSite(callbackSitesMap, childrenTsNode, snippetVal);
      } else {
        addError(null, 'unsupported-mapping', 'children attribute has no trustworthy TypeScript mapping.', {path: module.path, span: marker.span});
      }
      return;
    }
    const fragmentNodes = ownerNode.fragment?.nodes ?? [];
    for (const child of fragmentNodes) {
      if (child.type === 'SnippetBlock' && child.expression?.name === 'children') {
        const snippetRecord = findSnippet(module, child);
        if (snippetRecord) {
          const snippetAtom = flow.domain.atom('snippet', snippetRecord.id);
          if (argValue && argValue.size > 0) {
            flow.invokeLocal(snippetAtom, [{node: null, value: argValue, spread: false}], null);
          }
          const declNode = snippetRecord.binding?.declarations[0]?.node;
          if (declNode) recordSite(callbackSitesMap, declNode, snippetAtom);
        }
      } else if (child.type === 'SnippetBlock') {
        // Differently named direct snippet receives no implicit authority
      }
    }
  }

  function processRoot(module, marker) {
    const attributes = marker.node.attributes ?? [];
    const optionsAttr = attributes.find((a) => a.type === 'Attribute' && a.name === 'options');
    if (optionsAttr) {
      const optionsTsNode = resolveExpression(module, extractSvelteExpr(optionsAttr.value));
      if (optionsTsNode) {
        const optionsVal = flow.value(optionsTsNode);
        const depVal = flow.member(optionsVal, 'dependencies');
        if (depVal.size > 0) {
          let depNode = null;
          const unwrapOpt = unwrap(optionsTsNode);
          if (ts.isObjectLiteralExpression(unwrapOpt)) {
            for (const p of unwrapOpt.properties) {
              if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name.text === 'dependencies') {
                depNode = ts.isPropertyAssignment(p) ? p.initializer : p.name;
                break;
              }
            }
          }
          recordSite(wiringSitesMap, depNode ?? optionsTsNode, depVal);
        }
      } else {
        addError(null, 'unsupported-mapping', 'Root options attribute has no trustworthy TypeScript mapping.', {path: module.path, span: marker.span});
      }
    }
    handleFrameworkChildren(module, marker, flow.authority.authority('app'));
  }

  function processFeatureViews(module, marker) {
    const attributes = marker.node.attributes ?? [];
    const defAttr = attributes.find((a) => a.type === 'Attribute' && a.name === 'definition');
    let viewsParam = flow.authority.authority('views');
    if (defAttr) {
      const defTsNode = resolveExpression(module, extractSvelteExpr(defAttr.value));
      if (defTsNode) {
        const definition = flow.value(defTsNode);
        for (const def of definitions.values()) if ([...def.defHeap].some((atom) => definition.has(atom))) {
          viewsParam = flow.domain.join(viewsParam, def.handlesHeap);
        }
      }
      else addError(null, 'unsupported-mapping', 'FeatureViews definition attribute has no trustworthy TypeScript mapping.', {path: module.path, span: marker.span});
    }
    handleFrameworkChildren(module, marker, viewsParam);
  }

  function processFeatureOutlet(module, marker) {
    const viewAttr = (marker.node.attributes ?? []).find((a) => a.type === 'Attribute' && a.name === 'view');
    if (!viewAttr) {
      addError(marker.node, 'feature-outlet-missing-view', 'FeatureOutlet requires a view attribute.');
      return;
    }
    const viewTsNode = resolveExpression(module, extractSvelteExpr(viewAttr.value));
    if (!viewTsNode) {
      addError(null, 'unsupported-mapping', 'FeatureOutlet view attribute has no trustworthy TypeScript mapping.', {path: module.path, span: marker.span});
      return;
    }
    const viewVal = flow.value(viewTsNode);
    let correlated = false;
    for (const atom of viewVal) {
      const info = flow.domain.describe(atom);
      if (info.kind === 'feature-handle') {
        for (const def of definitions.values()) {
          const entry = def.handleMap.get(info.id);
          if (entry) {
            correlated = true;
            for (const snip of entry.snippets) recordSite(callbackSitesMap, viewTsNode, new Set([snip]));
          }
        }
      }
    }
    if (!correlated) addError(viewTsNode, 'uncorrelated-view-handle', 'FeatureOutlet view handle cannot be correlated to a view declaration.');
  }

  function processLocal(module, marker, childModule) {
    const ownerNode = marker.node;
    const attributes = ownerNode.attributes ?? [];
    const fragmentNodes = ownerNode.fragment?.nodes ?? [];
    const hasChildrenSnippet = fragmentNodes.some((n) => n.type === 'SnippetBlock' && n.expression?.name === 'children')
      || attributes.some((a) => a.type === 'Attribute' && a.name === 'children');
    const hasExecutable = fragmentNodes.some((n) => n.type !== 'SnippetBlock' && n.type !== 'Comment' && !(n.type === 'Text' && !n.data.trim()));
    if (hasExecutable && !hasChildrenSnippet) {
      addError(null, 'implicit-children-fragment', 'Implicit children fragment is not supported by the snippet model; use an explicit children snippet.', {path: module.path, span: marker.span});
      return;
    }
    const propsHeap = flow.domain.allocate(`component-props:${module.path}:${ownerNode.start}`, {array: false});
    for (const alternative of attributeAlternatives(module, marker)) {
      for (const [name, {value}] of alternative) if (value.size) flow.domain.write(propsHeap, name, value);
    }
    for (const child of fragmentNodes) {
      if (child.type === 'SnippetBlock') {
        const snipName = child.expression?.name ?? 'children';
        const record = findSnippet(module, child);
        if (record) flow.domain.write(propsHeap, snipName, flow.domain.atom('snippet', record.id));
      }
    }
    seedComponentProps(childModule, propsHeap);
  }

  function processNative(module, marker) {
    if (marker.node.type === 'SvelteElement') {
      addError(marker.node, 'unsupported-dynamic-element', 'Dynamic svelte:element is not supported for DOM authority binding.');
      return;
    }
    for (const attr of marker.node.attributes ?? []) {
      if (attr.type === 'BindDirective' && attr.name === 'this') {
        if (!attr.expression) {
          addError(null, 'unmodelled-bind-target', 'bind:this missing target expression.', {path: module.path, span: marker.span});
          continue;
        }
        const targetTs = resolveExpression(module, attr.expression);
        if (!targetTs) {
          addError(null, 'unsupported-mapping', 'bind:this target has no trustworthy TypeScript mapping.', {path: module.path, span: marker.span});
          continue;
        }
        const elem = flow.authority.authority('element');
        if (ts.isIdentifier(targetTs)) {
          const b = context.symbols.bindingOf(targetTs);
          if (b) flow.seedBinding(b, elem);
          else addError(targetTs, 'unmodelled-bind-target', `Identifier ${targetTs.text} has no binding.`);
        } else if (ts.isPropertyAccessExpression(targetTs) || ts.isElementAccessExpression(targetTs)) {
          const receiver = flow.value(targetTs.expression);
          const heaps = [...receiver].filter((a) => flow.domain.describe(a).kind === 'heap');
          let key = '*';
          if (ts.isPropertyAccessExpression(targetTs)) key = targetTs.name.text;
          else if (targetTs.argumentExpression && (ts.isStringLiteralLike(targetTs.argumentExpression) || ts.isNumericLiteral(targetTs.argumentExpression))) key = targetTs.argumentExpression.text;
          if (heaps.length > 0 && key !== '*') flow.domain.write(new Set(heaps), key, elem);
          else if (key !== '*') addError(targetTs, 'unmodelled-bind-target', 'bind:this receiver has no inspectable property location.');
          else if (key === '*') addError(targetTs, 'unmodelled-bind-target', 'Dynamic computed property target for bind:this cannot be modeled.');
        } else {
          addError(targetTs, 'unmodelled-bind-target', `Unsupported bind:this assignment target: ${ts.SyntaxKind[targetTs.kind]}.`);
        }
      } else if (attr.type === 'UseDirective') {
        const actionMarker = module.markers.find((m) => m.kind === 'use-directive' && m.node === attr);
        const actionTs = unwrap(actionMarker?.actionUnit?.sourceFile.statements[0]?.expression);
        if (!actionTs) {
          addError(null, 'use-directive-correlation', 'Action callback has no trustworthy source mapping.', {path: module.path, span: marker.span});
          continue;
        }
        const args = [{node: actionTs, value: flow.authority.authority('element'), spread: false}];
        if (attr.expression) {
          const paramTs = resolveExpression(module, attr.expression);
          if (!paramTs) {
            addError(null, 'unsupported-mapping', 'Use directive parameter has no trustworthy source mapping.', {path: module.path, span: marker.span});
            continue;
          }
          args.push({node: paramTs, value: flow.value(paramTs), spread: false});
        }
        const action = flow.value(actionTs);
        flow.invokeLocal(action, args, actionTs);
        recordSite(callbackSitesMap, actionTs, action);
      } else if (attr.type === 'AttachTag') {
        const attachTs = resolveExpression(module, attr.expression);
        if (attachTs) {
          const value = flow.value(attachTs);
          flow.invokeLocal(value, [{node: attachTs, value: flow.authority.authority('element'), spread: false}], attachTs);
          recordSite(callbackSitesMap, attachTs, value);
        } else addError(null, 'unsupported-mapping', 'Attachment has no trustworthy source mapping.', {path: module.path, span: marker.span});

      }
    }
    processEvents(module, marker);
  }

  function processEvents(module, marker) {
    for (const attr of marker.node.attributes ?? []) if (attr.type === 'OnDirective') {
      const node = resolveExpression(module, attr.expression);
      if (node) recordSite(callbackSitesMap, node, flow.value(node));
    }
    for (const alternative of attributeAlternatives(module, marker)) {
      for (const [name, {node, value}] of alternative) if (/^on[a-z]/.test(name) && node) recordSite(callbackSitesMap, node, value);
    }
  }

  // Public imperative component entry points store props; the component's own
  // script/template uses establish execution. Do not treat arbitrary props as
  // dependency wiring, or exempt a lookalike/opaque callable alternative.
  function processMount(call) {
    const callee = call.resolvedCallee ?? call.callee;
    const isMount = (atom) => {
      const origin = flow.authority.externalParts(atom);
      return origin?.specifier === 'svelte' && ['mount', 'hydrate'].includes(origin.imported) && origin.path.length === 0;
    };
    if (![...callee].some(isMount)) return;
    const refuse = (message) => addError(call.node, 'unsupported-imperative-component', message);
    if (![...callee].every(isMount) || call.construct || call.args.length !== 2
      || call.args.some((arg) => arg.spread) || call.invocations?.length !== 1) {
      refuse('Mount/hydrate requires a direct public callable and two inspectable arguments.');
      return;
    }
    const components = [...call.args[0].value].map((atom) => flow.domain.describe(atom));
    const child = components.length === 1 && components[0].kind === 'component'
      ? context.modules.find((module) => module.path === components[0].id && module.kind === 'svelte') : null;
    if (!child) {
      refuse('Mount/hydrate requires one statically resolved local Svelte component.');
      return;
    }
    const shapes = objectAlternatives(call.args[1].node);
    const allowed = new Set(['target', 'anchor', 'props', 'intro', 'recover']);
    if (!shapes?.length || shapes.some((shape) => !shape.has('target') || [...shape.keys()].some((key) => !allowed.has(key)))) {
      refuse('Mount/hydrate options require an inspectable target and props shape; context, events and unknown options require explicit review.');
      return;
    }
    const props = flow.member(call.args[1].value, 'props');
    if ((shapes.some((shape) => shape.has('props')) && props.size === 0)
      || [...props].some((atom) => flow.domain.describe(atom).kind !== 'heap' || flow.domain.isArray(new Set([atom])))) {
      refuse('Mount/hydrate props require inspectable object values.');
      return;
    }
    seedComponentProps(child, props);
    storedCallSites.set(call.node, {node: call.node, value: props});
  }

  function apply() {
    storedCallSites.clear();
    for (const [key, error] of errorsMap) if (['uncorrelated-view-handle', 'unmodelled-bind-target', 'unsupported-imperative-component'].includes(error.construct)) errorsMap.delete(key);
    for (const call of flow.calls.values()) {
      if (flow.isActiveNode(call.node)) processMount(call);
      for (const atom of call.callee) {
        if (flow.authority.anchor(atom)?.kind === 'view-definitions') processDefineViews(call.node, call.args);
      }
    }
    for (const module of context.modules) {
      if (module.kind !== 'svelte') continue;
      for (const marker of module.markers) {
        if ((marker.kind === 'event-directive' || (marker.kind === 'attribute' && /^on[a-z]/.test(marker.name)))
          && !module.markers.some((owner) => ['native-element', 'event-element', 'component'].includes(owner.kind)
            && owner.node.attributes?.includes(marker.node))) {
          addError(null, 'unsupported-special-element-event', 'Event callback requires a statically identified native element or component.', {path: module.path, span: marker.span});
        }
        if (['bind-directive', 'use-directive', 'attach-tag'].includes(marker.kind)
          && (marker.kind !== 'bind-directive' || marker.isThis)
          && !module.markers.some((owner) => ['native-element', 'component'].includes(owner.kind)
            && owner.node.attributes?.includes(marker.node))) {
          addError(null, 'unsupported-dynamic-element', 'Directive requires a statically identified native element or component.', {path: module.path, span: marker.span});
        }
        if (marker.kind === 'native-element') processNative(module, marker);
        else if (marker.kind === 'event-element') processEvents(module, marker);
        else if (marker.kind === 'component') {
          const comp = resolveComponent(module, marker);
          if (['root-component', 'host-component', 'feature-views-component', 'feature-outlet-component'].includes(comp.anchor?.kind)
            && marker.node.attributes?.some((a) => a.type === 'SpreadAttribute')) {
            addError(null, 'unsupported-framework-prop-spread', 'Framework boundary props require explicit attributes for trustworthy correlation.', {path: module.path, span: marker.span});
          }
          if (comp.anchor?.kind === 'root-component') processRoot(module, marker);
          else if (comp.anchor?.kind === 'host-component') handleFrameworkChildren(module, marker, null);
          else if (comp.anchor?.kind === 'feature-views-component') processFeatureViews(module, marker);
          else if (comp.anchor?.kind === 'feature-outlet-component') processFeatureOutlet(module, marker);
          else if (comp.localModule) processLocal(module, marker, comp.localModule);
        }
      }
    }
  }

  function onInvoke(call, api) {
    const list = call.invocations?.length ? call.invocations : [call];
    let res = api.domain.empty();
    for (const inv of list) {
      for (const atom of inv.callee) {
        if (api.authority.anchor(atom)?.kind === 'view-definitions') {
          res = api.domain.join(res, processDefineViews(call.node, inv.args).defHeap);
        }
      }
    }
    return res;
  }

  const sortedErrors = () => {
    const list = [...errorsMap.values()];
    list.sort((a, b) => (a.path || '').localeCompare(b.path || '') || (a.span?.start?.offset ?? 0) - (b.span?.start?.offset ?? 0) || (a.construct || '').localeCompare(b.construct || ''));
    return Object.freeze(list);
  };

  return {
    apply,
    onInvoke,
    get errors() { return sortedErrors(); },
    get storedCallSites() { return [...storedCallSites.values()]; },
    get wiringSites() { return [...wiringSitesMap.values()]; },
    get lifecycleSites() { return [...lifecycleSitesMap.values()]; },
    get callbackSites() { return [...callbackSitesMap.values()]; }
  };
}
