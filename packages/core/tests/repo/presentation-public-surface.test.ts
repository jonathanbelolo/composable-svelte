/** Public declaration boundaries; full declaration typechecking is a separate build gate. */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import ts from 'typescript';

// This candidate is installed at packages/core/tests/repo/presentation-public-surface.test.ts.
const core = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(core, 'package.json'), 'utf8')) as {
  exports: Record<string, { types?: string }>;
};
const keys = ['.', './navigation', './application', './navigation-components'] as const;
const entries = new Map(keys.map(key => {
  const types = manifest.exports[key]?.types;
  if (!types) throw new Error(`Missing declaration export: ${key}`);
  const path = resolve(core, types);
  if (!existsSync(path)) throw new Error(`Build core before checking declarations: ${path}`);
  return [key, path] as const;
}));
const program = ts.createProgram([...entries.values()], {
  target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true
});
const checker = program.getTypeChecker();
const modules = new Map([...entries].map(([key, path]) => {
  const source = program.getSourceFile(path);
  const symbol = source && checker.getSymbolAtLocation(source);
  if (!symbol) throw new Error(`Unresolved declaration module: ${key}`);
  const exports = new Map(checker.getExportsOfModule(symbol).map(value => [value.name, value]));
  if (!exports.size) throw new Error(`Empty declaration export set: ${key}`);
  return [key, exports] as const;
}));

function contract(key: typeof keys[number], name: string): ts.Type {
  let symbol = modules.get(key)!.get(name);
  if (!symbol) throw new Error(`Missing ${key} export ${name}`);
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  const declaration = symbol.declarations?.[0];
  if (!declaration || symbol.name === 'unknown') throw new Error(`Unresolved ${key} export ${name}`);
  const type = symbol.flags & ts.SymbolFlags.Type
    ? checker.getDeclaredTypeOfSymbol(symbol)
    : checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration ?? declaration);
  expect(type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never), `${key} ${name} unresolved type`).toBe(0);
  return type;
}

function callSignatures(type: ts.Type, label: string): readonly ts.Signature[] {
  const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);
  expect(signatures.length, `${label} must be callable`).toBeGreaterThan(0);
  return signatures;
}

function oneCall(type: ts.Type, label: string): ts.Signature {
  const signatures = callSignatures(type, label);
  expect(signatures, `${label} must have one call signature`).toHaveLength(1);
  return signatures[0]!;
}

function resolved(type: ts.Type, label: string): void {
  expect(type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never), `${label} unresolved type`).toBe(0);
}

function returnsVoid(signature: ts.Signature, label: string): void {
  const result = checker.getReturnTypeOfSignature(signature);
  resolved(result, `${label} return`);
  expect(Boolean(result.flags & ts.TypeFlags.Void), `${label} must return void`).toBe(true);
}

function requiredParameters(signature: ts.Signature): number {
  return signature.getDeclaration().parameters.filter(parameter =>
    parameter.questionToken === undefined && parameter.initializer === undefined && parameter.dotDotDotToken === undefined
  ).length;
}

function method(type: ts.Type, name: string, parameters: number, label: string): ts.Signature {
  const signature = oneCall(member(type, name), label);
  expect(signature.parameters, `${label} parameter count`).toHaveLength(parameters);
  expect(requiredParameters(signature), `${label} required parameter count`).toBe(parameters);
  return signature;
}

function member(type: ts.Type, name: string): ts.Type {
  const property = checker.getPropertyOfType(type, name);
  const declaration = property?.valueDeclaration ?? property?.declarations?.[0];
  if (!property || !declaration) throw new Error(`Missing or unresolved member ${name}`);
  const value = checker.getTypeOfSymbolAtLocation(property, declaration);
  expect(value.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never), `Unresolved member ${name}`).toBe(0);
  return value;
}

function readableWithoutDismiss(type: ts.Type, label: string): void {
  const value = checker.getNonNullableType(type);
  member(value, 'state');
  returnsVoid(method(value, 'dispatch', 1, `${label}.dispatch`), `${label}.dispatch`);
  expect(Boolean(checker.getPropertyOfType(value, 'dismiss')), `${label}.dismiss`).toBe(false);
}

const raw = ['createDismissDependency', 'createDismissDependencyWithCleanup', 'dismissDependency'];
const router = ['DestinationRouter', 'RouteConfig', 'DestinationRouterProps'];
describe('presentation public declarations', () => {
  it.each(['.', './navigation'] as const)('%s does not expose raw or misplaced dismissal authority', key => {
    expect([...raw, 'DismissDependency', 'managedDismissDependency'].filter(name => modules.get(key)!.has(name))).toEqual([]);
  });
  it.each(['.', './navigation-components'] as const)('%s does not expose the retired router', key => {
    expect(router.filter(name => modules.get(key)!.has(name))).toEqual([]);
  });
  it('application exposes the managed requester and presentation capability, without raw factories', () => {
    expect(raw.filter(name => modules.get('./application')!.has(name))).toEqual([]);
    const dismissDependency = contract('./application', 'DismissDependency');
    const dismiss = oneCall(dismissDependency, 'DismissDependency');
    expect(dismiss.parameters, 'DismissDependency parameter count').toHaveLength(0);
    expect(requiredParameters(dismiss), 'DismissDependency required parameter count').toBe(0);
    const effect = checker.getReturnTypeOfSignature(dismiss);
    resolved(effect, 'DismissDependency return');
    expect(Boolean(effect.flags & ts.TypeFlags.Void), 'DismissDependency must return an Effect').toBe(false);
    const effectType = contract('.', 'EffectType');
    expect(checker.isTypeAssignableTo(effect, effectType), 'DismissDependency return assignable to EffectType').toBe(true);
    expect(checker.isTypeAssignableTo(effectType, effect), 'EffectType assignable to DismissDependency return').toBe(true);

    const requester = oneCall(contract('./application', 'managedDismissDependency'), 'managedDismissDependency');
    expect(requiredParameters(requester), 'managedDismissDependency required parameter count').toBe(0);
    expect(requester.parameters.length, 'managedDismissDependency maximum parameter count').toBeLessThanOrEqual(1);
    const requested = checker.getReturnTypeOfSignature(requester);
    resolved(requested, 'managedDismissDependency return');
    expect(checker.isTypeAssignableTo(requested, dismissDependency), 'requester return assignable to DismissDependency').toBe(true);
    expect(checker.isTypeAssignableTo(dismissDependency, requested), 'DismissDependency assignable to requester return').toBe(true);

    const view = contract('./application', 'PresentationView');
    member(view, 'state');
    returnsVoid(method(view, 'dispatch', 1, 'PresentationView.dispatch'), 'PresentationView.dispatch');
    returnsVoid(method(view, 'dismiss', 0, 'PresentationView.dismiss'), 'PresentationView.dismiss');
  });
  it('application alone exposes owner-scoped action observation, without widening ChildView', () => {
    const names = ['observeChildActions', 'isManagedChildView', 'ManagedChildViewBrand'];
    for (const key of ['.', './navigation', './navigation-components'] as const) {
      expect(names.filter(name => modules.get(key)!.has(name)), `${key} owner-action exports`).toEqual([]);
    }
    const observe = oneCall(contract('./application', 'observeChildActions'), 'observeChildActions');
    expect(requiredParameters(observe), 'observeChildActions required parameter count').toBe(2);
    expect(observe.parameters, 'observeChildActions parameter count').toHaveLength(2);
    const stop = oneCall(checker.getReturnTypeOfSignature(observe), 'observeChildActions return');
    returnsVoid(stop, 'observeChildActions unsubscribe');
    const predicate = oneCall(contract('./application', 'isManagedChildView'), 'isManagedChildView');
    expect(requiredParameters(predicate), 'isManagedChildView required parameter count').toBe(1);
    expect(checker.getTypePredicateOfSignature(predicate)?.kind, 'isManagedChildView is a type predicate').toBe(ts.TypePredicateKind.Identifier);
    contract('./application', 'ManagedChildViewBrand');
    const view = contract('./application', 'ChildView');
    expect(checker.getPropertiesOfType(view).map(property => property.name).sort(), 'ChildView members').toEqual(['dispatch', 'select', 'state', 'subscribe']);
    const store = contract('.', 'Store');
    const required = checker.getPropertiesOfType(store).filter(property => !(property.flags & ts.SymbolFlags.Optional)).map(property => property.name);
    expect(required.filter(name => /action/i.test(name)), 'Store gains no required action member').toEqual([]);
  });
  it.each(['ScopedStore', 'ScopedDestinationStore'])('%s retains read/dispatch without dismissal', name => {
    for (const key of ['.', './navigation'] as const) {
      readableWithoutDismiss(contract(key, name), `${key} ${name}`);
    }
  });
  it('functional raw scopes return readable stores without dismissal', () => {
    for (const name of ['scopeToDestination', 'scopeToOptional']) {
      const signature = oneCall(contract('./navigation', name), name);
      readableWithoutDismiss(checker.getReturnTypeOfSignature(signature), `${name} return`);
    }
  });
  it('keeps managed scope capability while the raw fluent terminals have no dismissal', () => {
    const signatures = callSignatures(contract('./navigation', 'scopeTo'), 'scopeTo');
    const managed = signatures.filter(signature => signature.parameters.length === 2);
    const rawScope = signatures.filter(signature => signature.parameters.length === 1);
    expect(managed, 'scopeTo managed overloads').toHaveLength(2);
    expect(rawScope, 'scopeTo raw Store overload').toHaveLength(1);

    const managedReturns = managed.map(signature => checker.getNonNullableType(checker.getReturnTypeOfSignature(signature)));
    const presentation = managedReturns.filter(type => checker.getPropertyOfType(type, 'dismiss') !== undefined);
    const child = managedReturns.filter(type => checker.getPropertyOfType(type, 'dismiss') === undefined);
    expect(presentation, 'managed presentation overload').toHaveLength(1);
    expect(child, 'managed child overload').toHaveLength(1);
    member(presentation[0]!, 'state');
    returnsVoid(method(presentation[0]!, 'dispatch', 1, 'managed PresentationView.dispatch'), 'managed PresentationView.dispatch');
    returnsVoid(method(presentation[0]!, 'dismiss', 0, 'managed PresentationView.dismiss'), 'managed PresentationView.dismiss');
    readableWithoutDismiss(child[0]!, 'managed ChildView');

    const builder = checker.getReturnTypeOfSignature(rawScope[0]!);
    const into = oneCall(member(builder, 'into'), 'ScopeBuilder.into');
    expect(into.parameters, 'ScopeBuilder.into parameter count').toHaveLength(1);
    const nested = checker.getReturnTypeOfSignature(into);
    for (const terminal of ['case', 'optional']) {
      const signature = oneCall(member(nested, terminal), `ScopeBuilder.${terminal}`);
      readableWithoutDismiss(checker.getReturnTypeOfSignature(signature), `raw ScopeBuilder.${terminal} return`);
    }
  });
});
