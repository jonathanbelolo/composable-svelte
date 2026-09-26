import ts from 'typescript';

// `f<T>` in expression position. Heritage clauses reuse the same node kind but are type positions, not values.
export function isInstantiationExpression(node) {
  return Boolean(node) && ts.isExpressionWithTypeArguments(node) && !ts.isHeritageClause(node.parent)
    && (node.typeArguments?.length ?? 0) > 0;
}

export function createExpressionEvaluator(services) {
  const {
    domain,
    identifier,
    functionValue,
    classValue,
    thisValue,
    allocate,
    property,
    invoke,
    assign,
    unsupported
  } = services;

  function evaluate(node) {
    if (!node) return domain.empty();
    const result = evaluateNode(node);
    return services.seeded ? services.seeded(node, result) : result;
  }

  function evaluateNode(node) {

    switch (node.kind) {
      case ts.SyntaxKind.ImportKeyword:
        return domain.atom('import', 'import');

      case ts.SyntaxKind.Identifier:
        return identifier(node);

      case ts.SyntaxKind.StringLiteral:
        return domain.atom('literal', JSON.stringify(node.text));

      case ts.SyntaxKind.NumericLiteral:
        return domain.atom('literal', JSON.stringify(Number(node.text)));

      case ts.SyntaxKind.TrueKeyword:
        return domain.atom('literal', JSON.stringify(true));

      case ts.SyntaxKind.FalseKeyword:
        return domain.atom('literal', JSON.stringify(false));

      case ts.SyntaxKind.NullKeyword:
        return domain.atom('literal', JSON.stringify(null));

      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        return domain.atom('literal', JSON.stringify(node.text));

      case ts.SyntaxKind.BigIntLiteral:
      case ts.SyntaxKind.RegularExpressionLiteral:
      case ts.SyntaxKind.UndefinedKeyword:
        return domain.empty();

      case ts.SyntaxKind.ParenthesizedExpression:
      case ts.SyntaxKind.AsExpression:
      case ts.SyntaxKind.TypeAssertionExpression:
      case ts.SyntaxKind.NonNullExpression:
      case ts.SyntaxKind.AwaitExpression:
        return evaluate(node.expression);

      // A TS instantiation expression (`reducer<Row>`) erases to its expression, like `!` or `as`.
      case ts.SyntaxKind.ExpressionWithTypeArguments:
        if (isInstantiationExpression(node)) return evaluate(node.expression);
        unsupported(node, 'ExpressionWithTypeArguments', 'Unsupported expression syntax: ExpressionWithTypeArguments');
        return domain.empty();

      case ts.SyntaxKind.ThisKeyword:
      case ts.SyntaxKind.SuperKeyword:
        return thisValue(node);

      case ts.SyntaxKind.ArrowFunction:
      case ts.SyntaxKind.FunctionExpression:
        return functionValue(node);

      case ts.SyntaxKind.ClassExpression:
        return classValue(node);

      case ts.SyntaxKind.PropertyAccessExpression: {
        const receiver = evaluate(node.expression);
        const key = node.name.text;
        return property(receiver, key, node, { computed: false });
      }

      case ts.SyntaxKind.ElementAccessExpression: {
        const receiver = evaluate(node.expression);
        const arg = node.argumentExpression;
        if (
          ts.isStringLiteral(arg) ||
          ts.isNumericLiteral(arg) ||
          ts.isNoSubstitutionTemplateLiteral(arg)
        ) {
          return property(receiver, arg.text, node, { computed: false });
        }
        evaluate(arg);
        return property(receiver, '*', node, { computed: true });
      }

      case ts.SyntaxKind.CallExpression: {
        const callee = evaluate(node.expression);
        const args = (node.arguments || []).map((arg) => {
          if (ts.isSpreadElement(arg)) {
            return { node: arg.expression, value: evaluate(arg.expression), spread: true };
          }
          return { node: arg, value: evaluate(arg), spread: false };
        });
        return invoke(node, callee, args, { construct: false });
      }

      case ts.SyntaxKind.NewExpression: {
        const callee = evaluate(node.expression);
        const args = (node.arguments || []).map((arg) => {
          if (ts.isSpreadElement(arg)) {
            return { node: arg.expression, value: evaluate(arg.expression), spread: true };
          }
          return { node: arg, value: evaluate(arg), spread: false };
        });
        return invoke(node, callee, args, { construct: true });
      }

      // Tagged templates modeled using invoke with empty first template-array value + evaluated substitutions.
      case ts.SyntaxKind.TaggedTemplateExpression: {
        const callee = evaluate(node.tag);
        const args = [{ node: node.template, value: domain.empty(), spread: false }];
        if (ts.isTemplateExpression(node.template)) {
          for (const span of node.template.templateSpans) {
            args.push({ node: span.expression, value: evaluate(span.expression), spread: false });
          }
        }
        return invoke(node, callee, args, { construct: false });
      }

      case ts.SyntaxKind.TemplateExpression: {
        for (const span of node.templateSpans) {
          evaluate(span.expression);
        }
        return domain.empty();
      }

      case ts.SyntaxKind.ConditionalExpression: {
        evaluate(node.condition);
        const whenTrue = evaluate(node.whenTrue);
        const whenFalse = evaluate(node.whenFalse);
        return domain.join(whenTrue, whenFalse);
      }

      case ts.SyntaxKind.BinaryExpression:
        return evaluateBinaryExpression(node);

      case ts.SyntaxKind.PrefixUnaryExpression: {
        if (
          node.operator === ts.SyntaxKind.PlusPlusToken ||
          node.operator === ts.SyntaxKind.MinusMinusToken
        ) {
          const existing = evaluate(node.operand);
          assign(node.operand, existing, node);
          return domain.empty();
        }
        evaluate(node.operand);
        return domain.empty();
      }

      case ts.SyntaxKind.PostfixUnaryExpression: {
        if (
          node.operator === ts.SyntaxKind.PlusPlusToken ||
          node.operator === ts.SyntaxKind.MinusMinusToken
        ) {
          const existing = evaluate(node.operand);
          assign(node.operand, existing, node);
          return domain.empty();
        }
        evaluate(node.operand);
        return domain.empty();
      }

      case ts.SyntaxKind.DeleteExpression:
      case ts.SyntaxKind.VoidExpression:
      case ts.SyntaxKind.TypeOfExpression:
        evaluate(node.expression);
        return domain.empty();

      case ts.SyntaxKind.ArrayLiteralExpression:
        return evaluateArrayLiteral(node);

      case ts.SyntaxKind.ObjectLiteralExpression:
        return evaluateObjectLiteral(node);

      default: {
        if (ts.SyntaxKind.SatisfiesExpression && node.kind === ts.SyntaxKind.SatisfiesExpression) {
          return evaluate(node.expression);
        }
        unsupported(
          node,
          ts.SyntaxKind[node.kind] || 'Expression',
          `Unsupported expression syntax: ${ts.SyntaxKind[node.kind]}`
        );
        return domain.empty();
      }
    }
  }

  function evaluateBinaryExpression(node) {
    const op = node.operatorToken.kind;

    if (op === ts.SyntaxKind.EqualsToken) {
      const rhs = evaluate(node.right);
      assign(node.left, rhs, node);
      return rhs;
    }

    if (
      op === ts.SyntaxKind.BarBarEqualsToken ||
      op === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
      op === ts.SyntaxKind.QuestionQuestionEqualsToken
    ) {
      const lhs = evaluate(node.left);
      const rhs = evaluate(node.right);
      const unionVal = domain.join(lhs, rhs);
      assign(node.left, unionVal, node);
      return unionVal;
    }

    if (
      op === ts.SyntaxKind.PlusEqualsToken ||
      op === ts.SyntaxKind.MinusEqualsToken ||
      op === ts.SyntaxKind.AsteriskEqualsToken ||
      op === ts.SyntaxKind.SlashEqualsToken ||
      op === ts.SyntaxKind.PercentEqualsToken ||
      op === ts.SyntaxKind.AsteriskAsteriskEqualsToken ||
      op === ts.SyntaxKind.LessThanLessThanEqualsToken ||
      op === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken ||
      op === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken ||
      op === ts.SyntaxKind.AmpersandEqualsToken ||
      op === ts.SyntaxKind.BarEqualsToken ||
      op === ts.SyntaxKind.CaretEqualsToken
    ) {
      evaluate(node.left);
      evaluate(node.right);
      assign(node.left, domain.empty(), node);
      return domain.empty();
    }

    if (
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.AmpersandAmpersandToken ||
      op === ts.SyntaxKind.QuestionQuestionToken
    ) {
      const left = evaluate(node.left);
      const right = evaluate(node.right);
      return domain.join(left, right);
    }

    if (op === ts.SyntaxKind.CommaToken) {
      evaluate(node.left);
      return evaluate(node.right);
    }

    evaluate(node.left);
    evaluate(node.right);
    return domain.empty();
  }

  function evaluateArrayLiteral(node) {
    const heap = allocate(node, { array: true });
    let spreadSeen = false;
    let index = 0;

    for (const elem of node.elements) {
      if (ts.isSpreadElement(elem)) {
        const src = evaluate(elem.expression);
        domain.spread(heap, src, { array: true });
        spreadSeen = true;
      } else if (ts.isOmittedExpression(elem)) {
        index++;
      } else {
        const val = evaluate(elem);
        const key = spreadSeen ? '*' : String(index);
        domain.write(heap, key, val);
        index++;
      }
    }
    return heap;
  }

  function evaluateObjectLiteral(node) {
    const heap = allocate(node, { array: false });

    for (const [propertyIndex, prop] of node.properties.entries()) {
      if (ts.isPropertyAssignment(prop)) {
        let key;
        if (ts.isComputedPropertyName(prop.name)) {
          const expr = prop.name.expression;
          if (
            ts.isStringLiteral(expr) ||
            ts.isNumericLiteral(expr) ||
            ts.isNoSubstitutionTemplateLiteral(expr)
          ) {
            key = expr.text;
          } else {
            const keyValue = evaluate(expr);
            key = '*';
            if (services.computedKey) services.computedKey(prop.name, keyValue);
            else unsupported(prop.name, 'ComputedPropertyName', 'Dynamic computed property name cannot be safely modeled');
          }
        } else if (
          ts.isIdentifier(prop.name) ||
          ts.isStringLiteral(prop.name) ||
          ts.isNumericLiteral(prop.name)
        ) {
          key = prop.name.text;
        } else {
          key = prop.name.getText?.() ?? String(prop.name);
        }
        const val = evaluate(prop.initializer);
        domain.write(heap, key, val);
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        const key = prop.name.text;
        const val = identifier(prop.name);
        domain.write(heap, key, val);
      } else if (ts.isSpreadAssignment(prop)) {
        const src = evaluate(prop.expression);
        const shadowed = node.properties.slice(propertyIndex + 1).flatMap((later) => {
          let name = later.name;
          if (!name || !(ts.isPropertyAssignment(later) || ts.isShorthandPropertyAssignment(later) || ts.isMethodDeclaration(later))) return [];
          if (ts.isComputedPropertyName(name)) name = name.expression;
          return ts.isIdentifier(name) && !ts.isComputedPropertyName(later.name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name) ? [name.text] : [];
        });
        domain.spread(heap, src, { array: false, shadowed });
      } else if (ts.isMethodDeclaration(prop)) {
        let key;
        if (ts.isComputedPropertyName(prop.name)) {
          const expr = prop.name.expression;
          if (
            ts.isStringLiteral(expr) ||
            ts.isNumericLiteral(expr) ||
            ts.isNoSubstitutionTemplateLiteral(expr)
          ) {
            key = expr.text;
          } else {
            evaluate(expr);
            key = '*';
            unsupported(prop.name, 'ComputedPropertyName', 'Dynamic computed method name cannot be safely modeled');
          }
        } else if (
          ts.isIdentifier(prop.name) ||
          ts.isStringLiteral(prop.name) ||
          ts.isNumericLiteral(prop.name)
        ) {
          key = prop.name.text;
        } else {
          key = prop.name.getText?.() ?? String(prop.name);
        }
        const val = functionValue(prop);
        domain.write(heap, key, val);
      } else if (ts.isGetAccessor(prop) && services.getter) {
        // The flow decides whether the getter body is a supported alias; its value is the slot value.
        if (ts.isComputedPropertyName(prop.name) || !(ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name) || ts.isNumericLiteral(prop.name))) {
          unsupported(prop.name, 'ComputedPropertyName', 'Dynamic computed getter name cannot be safely modeled');
        } else {
          const val = services.getter(prop);
          if (val) domain.write(heap, prop.name.text, val);
        }
      } else if (ts.isGetAccessor(prop)) {
        unsupported(prop, 'GetAccessor', 'Getter accessors are not supported');
      } else if (ts.isSetAccessor(prop)) {
        unsupported(prop, 'SetAccessor', 'Setter accessors are not supported');
      } else {
        unsupported(prop, ts.SyntaxKind[prop.kind] || 'Property', 'Unsupported property syntax');
      }
    }
    return heap;
  }

  evaluate.evaluate = evaluate;
  return evaluate;
}
