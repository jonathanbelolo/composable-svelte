/**
 * Every bare side-effect import must be covered by its package's `sideEffects`.
 *
 * `import './websocket/effect-websocket.js'` in core's barrel exists to run
 * `Effect.websocket = { … }`. Nothing imports a *binding* from that module, so a
 * bundler is free to drop the statement — and `Effect.websocket` then becomes
 * `undefined` at runtime, with no error anywhere.
 *
 * The subtlety this test exists to pin, because I got it wrong once: allowlisting
 * the *target* is not enough. If the **importing** module is marked
 * side-effect-free, the bundler removes its unused top-level statements — the
 * bare import among them — before it ever consults the target's flag. The barrel
 * has to be listed too.
 *
 * Measured with a real Vite lib build against a packed tarball. `sideEffects`
 * absent: `Effect.websocket = {` survives. `sideEffects: false`, or an allowlist
 * naming only the target: dropped. An allowlist naming the barrel *and* the
 * target: survives, and still shakes to the same 17,563 bytes as a blanket
 * `**\/*.js`.
 *
 * This is the cheap structural stand-in for that experiment, so CI does not need
 * a bundler.
 *
 * It walks the whole chain from each package entry, not just the module holding
 * the bare import — a hostile review demonstrated that checking one hop is not
 * enough. Move the bare import one re-export outward and a one-hop check passes
 * while Vite still drops the registration, because a side-effect-free
 * *intermediate* deletes the re-export before the leaf's flag is ever consulted.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { kindOf, walkFiles, listDirs } from './walk.js';
import { packageCapabilities } from './package-capabilities.js';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { parse as parseSvelte } from 'svelte/compiler';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const packagesDir = join(repoRoot, 'packages');

/** Bare `import 'x';` — no bindings, so it is kept only for its side effect. */
const BARE_IMPORT = /^[ \t]*import[ \t]+['"]([^'"]+)['"][ \t]*;?[ \t]*$/gm;

/**
 * Minified module syntax — `import{Effect}from'./e.js'`, `export*from` — which
 * none of the regexes in this file can read. Exported for its control.
 */
export function looksMinified(source: string): boolean {
	return /^(?:import|export)[{'"*]/m.test(source);
}

/** The local names a module's `import` statements bind. */
export function importBindings(source: string): Set<string> {
	const sourceFile = ts.createSourceFile('module.ts', source, ts.ScriptTarget.Latest, true);
	const bindings = new Set<string>();

	for (const stmt of sourceFile.statements) {
		if (ts.isImportDeclaration(stmt) && stmt.importClause) {
			if (stmt.importClause.name) {
				bindings.add(stmt.importClause.name.text);
			}
			const namedBindings = stmt.importClause.namedBindings;
			if (namedBindings) {
				if (ts.isNamespaceImport(namedBindings)) {
					bindings.add(namedBindings.name.text);
				} else if (ts.isNamedImports(namedBindings)) {
					for (const el of namedBindings.elements) {
						bindings.add(el.name.text);
					}
				}
			}
		}
	}

	return bindings;
}

/**
 * Import-time structural reachability for this repository's emitted syntax,
 * not a JavaScript interpreter. Branches
 * are conservatively visited; local calls and aliases are followed by lexical
 * symbols. Dormant function bodies are not roots. Foreign higher-order calls,
 * runtime code generation, getters, and functions returned by factories are
 * outside this guard; real packed-consumer bundle tests remain authoritative.
 */
export function mutatedImports(source: string, svelte = false): string[] {
	if (svelte) {
		// Published Svelte components retain markup. Only their module script
		// executes on import; instance scripts execute when a component is made.
		const component = parseSvelte(source, { modern: true });
		if (!component.module) return [];
		const text = (node: object): string => {
			if (!('start' in node) || typeof node.start !== 'number' || !('end' in node) || typeof node.end !== 'number') {
				throw new Error('Cannot inspect Svelte module script: compiler source positions unavailable');
			}
			return source.slice(node.start, node.end);
		};
		// Imports written in instance scripts are hoisted by the compiler and
		// may be referenced by module code; instance statements still stay dormant.
		const imports = component.instance?.content.body.filter(statement => statement.type === 'ImportDeclaration') ?? [];
		source = imports.map(text).join('\n') + '\n' + text(component.module.content);
	}
	if (importBindings(source).size === 0) return [];
	const fileName = '/side-effect-module.ts';
	const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
	// One in-memory file: symbol binding supplies lexical scope without loading
	// dependencies, checking types, or executing any source from the repository.
	const host: ts.CompilerHost = {
		getSourceFile: (name) => name === fileName ? file : undefined,
		getDefaultLibFileName: () => '', writeFile: () => {},
		getCurrentDirectory: () => '/', getDirectories: () => [],
		fileExists: (name) => name === fileName,
		readFile: (name) => name === fileName ? source : undefined,
		getCanonicalFileName: (name) => name, useCaseSensitiveFileNames: () => true,
		getNewLine: () => '\n'
	};
	const program = ts.createProgram([fileName], { noLib: true, noResolve: true }, host);
	const diagnostics = program.getSyntacticDiagnostics(file);
	if (diagnostics.length > 0) {
		throw new Error('Cannot inspect import-time mutations: ' + diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('; '));
	}
	const checker = program.getTypeChecker();
	type Fn = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;
	type Value = { roots: Set<string>; functions: Set<Fn> };
	type Environment = Map<ts.Symbol, Value>;
	const empty = (): Value => ({ roots: new Set(), functions: new Set() });
	const merge = (values: Value[]): Value => ({
		roots: new Set(values.flatMap(value => [...value.roots])),
		functions: new Set(values.flatMap(value => [...value.functions]))
	});
	const imported = new Map<ts.Symbol, string>();
	for (const statement of file.statements) {
		if (!ts.isImportDeclaration(statement) || !statement.importClause || statement.importClause.isTypeOnly) continue;
		const clause = statement.importClause;
		const names: ts.Identifier[] = [];
		if (clause.name) names.push(clause.name);
		if (clause.namedBindings) {
			if (ts.isNamespaceImport(clause.namedBindings)) names.push(clause.namedBindings.name);
			else for (const item of clause.namedBindings.elements) if (!item.isTypeOnly) names.push(item.name);
		}
		for (const name of names) {
			const symbol = checker.getSymbolAtLocation(name);
			if (symbol) imported.set(symbol, name.text);
		}
	}
	const mutations = new Set<string>();
	const activeCalls = new Map<Fn, Set<string>>();
	const isFn = (node: ts.Node): node is Fn => ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node);
	function value(expression: ts.Node, env: Environment, seen = new Set<ts.Symbol>()): Value {
		if (isFn(expression)) return { roots: new Set(), functions: new Set([expression]) };
		if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isNonNullExpression(expression) || ts.isTypeAssertionExpression(expression)) return value(expression.expression, env, seen);
		if (ts.isConditionalExpression(expression)) return merge([value(expression.whenTrue, env, seen), value(expression.whenFalse, env, seen)]);
		if (ts.isBinaryExpression(expression) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.QuestionQuestionToken].includes(expression.operatorToken.kind)) return merge([value(expression.left, env, seen), value(expression.right, env, seen)]);
		if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
			// Property aliases still mutate the imported object; known local method
			// symbols are also callable without evaluating dormant method bodies.
			const base = value(expression.expression, env, seen);
			const property = ts.isPropertyAccessExpression(expression) ? expression.name.text
				: expression.argumentExpression && ts.isStringLiteralLike(expression.argumentExpression) ? expression.argumentExpression.text : undefined;
			const symbol = property ? checker.getTypeAtLocation(expression.expression).getProperty(property) : undefined;
			const members = symbol && !seen.has(symbol) ? (symbol.declarations ?? []).map(declaration => {
				if (isFn(declaration)) return value(declaration, env, new Set(seen).add(symbol));
				if (ts.isPropertyAssignment(declaration)) return value(declaration.initializer, env, new Set(seen).add(symbol));
				if (ts.isShorthandPropertyAssignment(declaration)) return value(declaration.name, env, new Set(seen).add(symbol));
				return empty();
			}) : [];
			return merge([{ roots: base.roots, functions: new Set() }, ...members]);
		}
		if (!ts.isIdentifier(expression)) return empty();
		const symbol = checker.getSymbolAtLocation(expression);
		if (!symbol || seen.has(symbol)) return empty();
		if (imported.has(symbol)) return { roots: new Set([imported.get(symbol)!]), functions: new Set() };
		if (env.has(symbol)) return env.get(symbol)!;
		const next = new Set(seen).add(symbol);
		return merge((symbol.declarations ?? []).map(declaration => {
			if (isFn(declaration)) return value(declaration, env, next);
			if ((ts.isVariableDeclaration(declaration) || ts.isParameter(declaration)) && declaration.initializer) return value(declaration.initializer, env, next);
			return empty();
		}));
	}
	function assign(name: ts.BindingName, assigned: Value, env: Environment) {
		if (ts.isIdentifier(name)) {
			const symbol = checker.getSymbolAtLocation(name);
			if (symbol) env.set(symbol, assigned);
		} else {
			for (const item of name.elements) if (ts.isBindingElement(item)) assign(item.name, assigned, env);
		}
	}
	function mark(target: ts.Expression, env: Environment) {
		if (ts.isParenthesizedExpression(target)) { mark(target.expression, env); return; }
		if (ts.isArrayLiteralExpression(target)) {
			for (const item of target.elements) if (!ts.isOmittedExpression(item)) mark(ts.isSpreadElement(item) ? item.expression : item, env);
			return;
		}
		if (ts.isObjectLiteralExpression(target)) {
			for (const item of target.properties) {
				if (ts.isPropertyAssignment(item)) mark(item.initializer, env);
				if (ts.isSpreadAssignment(item)) mark(item.expression, env);
			}
			return;
		}
		if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
			for (const root of value(target.expression, env).roots) mutations.add(root);
		}
	}
	function call(fn: Fn, args: readonly ts.Expression[], env: Environment) {
		if (!fn.body) return;
		const local = new Map(env);
		const argumentsValues = fn.parameters.map((parameter, index) => {
			const argument = args[index];
			const assigned = argument ? value(argument, env) : parameter.initializer ? value(parameter.initializer, local) : empty();
			assign(parameter.name, assigned, local);
			return assigned;
		});
		const key = JSON.stringify(argumentsValues.map(item => [[...item.roots].sort(), [...item.functions].map(fn => fn.pos).sort()]));
		const calls = activeCalls.get(fn) ?? new Set<string>();
		if (calls.has(key)) return;
		calls.add(key); activeCalls.set(fn, calls);
		fn.parameters.forEach((parameter, index) => {
			if (!args[index] && parameter.initializer) visit(parameter.initializer, local);
			assign(parameter.name, argumentsValues[index]!, local);
		});
		visit(fn.body, local);
		// Calls can assign a module/outer lexical alias. Local parameters and
		// declarations must not escape into a caller with a similarly named binding.
		for (const [symbol, assigned] of local) {
			if (symbol.declarations?.some(declaration => declaration.pos < fn.pos || declaration.end > fn.end)) env.set(symbol, assigned);
		}
		calls.delete(key);
	}
	function joinEnvironments(env: Environment, branches: Environment[]) {
		const symbols = new Set(branches.flatMap(branch => [...branch.keys()]));
		for (const symbol of symbols) env.set(symbol, merge(branches.map(branch => branch.get(symbol) ?? empty())));
	}
	function visit(node: ts.Node, env: Environment): void {
		if (isFn(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node) || ts.isConstructorDeclaration(node)) return;
		if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
			for (const clause of node.heritageClauses ?? []) visit(clause, env);
			for (const member of node.members) {
				if (member.name && ts.isComputedPropertyName(member.name)) visit(member.name.expression, env);
				if (ts.isClassStaticBlockDeclaration(member)) visit(member.body, env);
				if (ts.isPropertyDeclaration(member) && member.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.StaticKeyword) && member.initializer) visit(member.initializer, env);
			}
			return;
		}
		if (ts.isIfStatement(node)) {
			visit(node.expression, env);
			const yes = new Map(env), no = new Map(env);
			visit(node.thenStatement, yes);
			if (node.elseStatement) visit(node.elseStatement, no);
			joinEnvironments(env, [yes, no]); return;
		}
		if (ts.isSwitchStatement(node)) {
			visit(node.expression, env);
			const before = new Map(env), branches = [before];
			let previous = before;
			for (const clause of node.caseBlock.clauses) {
				const branch = new Map(before);
				joinEnvironments(branch, [before, previous]);
				if (ts.isCaseClause(clause)) visit(clause.expression, branch);
				for (const statement of clause.statements) visit(statement, branch);
				branches.push(branch); previous = branch;
			}
			joinEnvironments(env, branches); return;
		}
		if (ts.isTryStatement(node)) {
			const before = new Map(env), success = new Map(env);
			visit(node.tryBlock, success);
			const failure = new Map(before);
			joinEnvironments(failure, [before, success]);
			if (node.catchClause) visit(node.catchClause.block, failure);
			joinEnvironments(env, [success, failure]);
			if (node.finallyBlock) visit(node.finallyBlock, env);
			return;
		}
		if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
			visit(node.expression, env);
			const before = new Map(env);
			if (!ts.isVariableDeclarationList(node.initializer)) mark(node.initializer, env);
			visit(node.initializer, env); visit(node.statement, env);
			joinEnvironments(env, [before, new Map(env)]); return;
		}
		if (ts.isForStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node)) {
			if (ts.isForStatement(node) && node.initializer) visit(node.initializer, env);
			const before = new Map(env);
			if (ts.isForStatement(node)) {
				if (node.condition) visit(node.condition, env);
				visit(node.statement, env);
				if (node.incrementor) visit(node.incrementor, env);
			} else { visit(node.expression, env); visit(node.statement, env); }
			joinEnvironments(env, [before, new Map(env)]); return;
		}
		if (ts.isVariableDeclaration(node)) {
			if (node.initializer) { visit(node.initializer, env); assign(node.name, value(node.initializer, env), env); }
			return;
		}
		if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
			mark(node.left, env);
			visit(node.left, env); visit(node.right, env);
			if (ts.isIdentifier(node.left)) {
				const logical = [ts.SyntaxKind.BarBarEqualsToken, ts.SyntaxKind.AmpersandAmpersandEqualsToken, ts.SyntaxKind.QuestionQuestionEqualsToken].includes(node.operatorToken.kind);
				assign(node.left, logical ? merge([value(node.left, env), value(node.right, env)]) : value(node.right, env), env);
			}
			return;
		}
		if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
			if (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) mark(node.operand, env);
			visit(node.operand, env); return;
		}
		if (ts.isDeleteExpression(node)) { mark(node.expression, env); visit(node.expression, env); return; }
		if (ts.isCallExpression(node)) {
			visit(node.expression, env);
			for (const argument of node.arguments) visit(argument, env);
			if (ts.isPropertyAccessExpression(node.expression) && (node.expression.name.text === 'call' || node.expression.name.text === 'apply')) {
				const argumentsList = node.expression.name.text === 'call' ? node.arguments.slice(1)
					: node.arguments[1] && ts.isArrayLiteralExpression(node.arguments[1]) ? [...node.arguments[1].elements] : [];
				for (const fn of value(node.expression.expression, env).functions) call(fn, argumentsList, env);
			} else for (const fn of value(node.expression, env).functions) call(fn, node.arguments, env);
			return;
		}
		ts.forEachChild(node, child => visit(child, env));
	}
	visit(file, new Map());
	return [...mutations];
}

/** Translate one `sideEffects` glob into a regex. Supports `*` and `**`. */
function globToRegExp(pattern: string): RegExp {
	const p = pattern.replace(/^\.\//, '');
	let out = '';
	let i = 0;
	while (i < p.length) {
		if (p.startsWith('**/', i)) {
			out += '(?:[^/]*/)*';
			i += 3;
		} else if (p.startsWith('**', i)) {
			out += '.*';
			i += 2;
		} else if (p[i] === '*') {
			out += '[^/]*';
			i += 1;
		} else {
			out += p[i]!.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
			i += 1;
		}
	}
	return new RegExp(`^${out}$`);
}

/** Does `sideEffects` mark this path as side-effectful? */
function covered(sideEffects: unknown, relPath: string): boolean {
	if (sideEffects === undefined || sideEffects === true) return true;
	if (sideEffects === false) return false;
	if (!Array.isArray(sideEffects)) return false;
	return sideEffects.some((pattern: string) => globToRegExp(pattern).test(relPath));
}

/** Every relative specifier a module imports or re-exports from. */
function relativeDeps(source: string): string[] {
	const out: string[] = [];
	for (const re of [
		/(?:^|\n)\s*import\s+[^;'"]*?from\s*['"](\.[^'"]+)['"]/g,
		/(?:^|\n)\s*import\s*['"](\.[^'"]+)['"]/g,
		/(?:^|\n)\s*export\s+[^;'"]*?from\s*['"](\.[^'"]+)['"]/g
	]) {
		for (const m of source.matchAll(re)) out.push(m[1]!);
	}
	return out;
}

/** The entry files a consumer can reach, from the package's exports map. */
function entryFiles(pkgDir: string, pkg: { exports?: Record<string, unknown> }): string[] {
	const targets = new Set<string>();
	const collect = (t: unknown) => {
		if (typeof t === 'string') {
			if (t.endsWith('.js')) targets.add(t);
		} else if (t && typeof t === 'object') {
			Object.values(t as Record<string, unknown>).forEach(collect);
		}
	};
	Object.entries(pkg.exports ?? {}).forEach(([subpath, t]) => {
		if (subpath.includes('*')) return; // wildcards cannot be enumerated
		collect(t);
	});
	return [...targets].map((t) => join(pkgDir, t.replace(/^\.\//, '')));
}

/** Files that might name a subpath: sources, and the documents about them. */
function referencingFiles(): string[] {
	// `plans/` holds historical design records — they describe APIs that were
	// considered and often not built, are not published (`files` excludes them),
	// and are not instructions to anyone.
	const skip = ['node_modules', 'dist', '.svelte-kit', '.git', 'plans', 'worktrees'];

	// A changelog quotes what used to be wrong — that is its job — so it is
	// excluded for the same reason `plans/` is: both are records of the past, not
	// instructions. Live documentation is still scanned.
	const keep = (name: string) => name !== 'CHANGELOG.md' && /\.(ts|js|svelte|md)$/.test(name);

	const out = ['packages', 'examples', 'guides', '.claude'].flatMap(
		(dir) => walkFiles(join(repoRoot, dir), { skip, keep }).files
	);
	return out;
}

/**
 * What a package's exports map turns `subpath` into, or null if nothing matches.
 *
 * Exact keys win over patterns, and a longer pattern prefix wins over a shorter
 * one — Node's own rule.
 */
function resolveSubpath(pkgDir: string, subpath: string): string | null {
	const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
	const exports: Record<string, unknown> = pkg.exports ?? {};

	const target = (entry: unknown): string | null => {
		if (typeof entry === 'string') return entry;
		if (entry && typeof entry === 'object') {
			const record = entry as Record<string, unknown>;
			for (const condition of ['svelte', 'default', 'types']) {
				const value = record[condition];
				if (typeof value === 'string') return value;
			}
		}
		return null;
	};

	if (subpath in exports) {
		const file = target(exports[subpath]);
		return file ? join(pkgDir, file.replace(/^\.\//, '')) : null;
	}

	const patterns = Object.keys(exports)
		.filter((key) => key.includes('*'))
		.sort((a, b) => b.indexOf('*') - a.indexOf('*'));

	for (const pattern of patterns) {
		const [prefix, suffix] = pattern.split('*') as [string, string];
		if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
		const filled = subpath.slice(prefix.length, subpath.length - (suffix.length || 0));
		const file = target(exports[pattern]);
		if (!file) continue;
		return join(pkgDir, file.replace('*', filled).replace(/^\.\//, ''));
	}

	return null;
}

function resolveFrom(fromFile: string, spec: string): string | null {
	const base = join(fromFile, '..', spec);
	for (const c of [base, `${base}.js`, join(base, 'index.js'), base.replace(/\.js$/, '.svelte')]) {
		if (kindOf(c) === 'file') return c;
	}
	return null;
}

const packages = listDirs(packagesDir).filter((name) =>
	existsSync(join(packagesDir, name, 'package.json'))
);

function isPublishedFile(directory: string, files: string[], subpath: string): boolean {
	if (subpath.split('/').includes('..') || !existsSync(join(directory,subpath))) return false;
	const matches = (pattern: string) => {
		const value = pattern.replace(/^\.\//,'').replace(/\/$/,'');
		return subpath === value || subpath.startsWith(`${value}/`) || globToRegExp(value).test(subpath);
	};
	return files.some(pattern => !pattern.startsWith('!') && matches(pattern)) && !files.some(pattern => pattern.startsWith('!') && matches(pattern.slice(1)));
}

function isInstalledFilePath(source: string, index: number): boolean {
	return source.slice(0, index).endsWith('node_modules/');
}

describe('side-effect imports survive tree-shaking', () => {
	it('distinguishes copied installed files from import specifiers', () => {
		const copied = 'cp node_modules/@scope/pkg/consumer app';
		const imported = "import '@scope/pkg/consumer'";
		expect(isInstalledFilePath(copied, copied.indexOf('@scope'))).toBe(true);
		expect(isInstalledFilePath(imported, imported.indexOf('@scope'))).toBe(false);
	});

	it('installed file references require actual published content', () => {
		const dir=mkdtempSync(join(tmpdir(),'installed-doc-reference-'));
		try {
			mkdirSync(join(dir,'docs')); writeFileSync(join(dir,'docs/guide.md'),'Guide');
			expect(isPublishedFile(dir,['docs'],'docs/guide.md')).toBe(true);
			expect(isPublishedFile(dir,['dist'],'docs/guide.md')).toBe(false);
			expect(isPublishedFile(dir,['docs','!docs/guide.md'],'docs/guide.md')).toBe(false);
			expect(isPublishedFile(dir,['docs'],'docs/missing.md')).toBe(false);
		} finally {rmSync(dir,{recursive:true,force:true});}
	});

	it('the glob translation is right', () => {
		expect(globToRegExp('**/*.css').test('dist/styles/globals.css')).toBe(true);
		expect(globToRegExp('dist/index.js').test('dist/index.js')).toBe(true);
		expect(globToRegExp('dist/index.js').test('dist/websocket/index.js')).toBe(false);
		expect(globToRegExp('**/*.svelte').test('dist/node-canvas/NodeCanvas.svelte')).toBe(true);
	});

	it.each(packages.filter(name => packageCapabilities(join(packagesDir,name)).requiresDist))('%s is built, so this guard is not vacuous', (name) => {
		// `return`-ing on a missing dist scores as a pass, which made this silently
		// meaningless on a fresh clone: dist is gitignored and the root `test`
		// script has no build dependency.
		expect(
			existsSync(join(packagesDir, name, 'dist')),
			`${name}/dist is missing — run \`pnpm -r build\` first, or this test proves nothing`
		).toBe(true);
	});

	it('every referenced subpath resolves to a file that exists', () => {
		// The wildcard `"./*": "./dist/*.js"` turns a *directory* subpath into a
		// file that cannot exist: `@composable-svelte/chat/streaming-chat` became
		// `dist/streaming-chat.js`. It was named in three documents and had never
		// resolved — and the existence check below could not see it, because that
		// one only inspects explicit entries.
		//
		// The rule is deliberately "referenced", not "every dist directory with an
		// index.js". The stronger version reads well and is wrong: it would force
		// forty-odd internal build products in `core` — every `components/ui/*` —
		// into public API to satisfy a lint. What matters is that a subpath
		// someone actually writes down works.
		const specifier = /@composable-svelte\/([a-z-]+)\/([A-Za-z0-9_./-]+)/g;
		const broken: string[] = [];
		const seen = new Set<string>();

		for (const file of referencingFiles()) {
			const source = readFileSync(file, 'utf8');
			for (const match of source.matchAll(specifier)) {
				const [full, pkg, subpath] = match as unknown as [string, string, string];
				// `…/dist/…` in prose is a file path being described, not a specifier
				// anyone imports — the exports map deliberately does not expose it.
				if (!packages.includes(pkg) || subpath.split('/').includes('...')) continue;
				if (isInstalledFilePath(source, match.index!)) {
					const directory = join(packagesDir,pkg);
					const metadata = JSON.parse(readFileSync(join(directory,'package.json'),'utf8'));
					if (!isPublishedFile(directory, metadata.files ?? [], subpath)) broken.push(`${full} — installed documentation/file path is absent or not published`);
					continue;
				}
				if (subpath.startsWith('dist') || seen.has(full)) continue;
				seen.add(full);

				const target = resolveSubpath(join(packagesDir, pkg), `./${subpath}`);
				if (target === null) {
					broken.push(`${full} — no exports entry matches`);
				} else if (!existsSync(target)) {
					broken.push(`${full} -> ${relative(repoRoot, target)} (missing)`);
				}
			}
		}

		expect(
			broken,
			'these subpaths are written down somewhere and do not resolve. Add an ' +
				'explicit exports entry, or stop referencing them.'
		).toEqual([]);
	});

	it.each(packages)('%s exports map points at files that exist', (name) => {
		// A subpath whose target is missing fails at *import* time with
		// ERR_MODULE_NOT_FOUND, which no build step and no typecheck catches.
		// `@composable-svelte/chat/streaming-chat` was documented in three places
		// and resolved to `dist/streaming-chat.js` — a file that has never
		// existed, because the wildcard `"./*"` entry cannot see that
		// `streaming-chat` is a directory.
		//
		// This used to be a `.filter(existsSync)` in `entryFiles`, which silently
		// dropped exactly the case worth reporting.
		const pkgDir = join(packagesDir, name);
		const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));

		const missing = entryFiles(pkgDir, pkg).filter((f) => !existsSync(f));

		expect(
			missing.map((f) => relative(pkgDir, f)),
			`${name} declares subpaths whose targets are not in dist — run ` +
				`\`pnpm -r build\`, then check the exports map.`
		).toEqual([]);
	});

	it.each(packages)(
		'%s declares every side-effect module it relies on',
		(name) => {
			const pkgDir = join(packagesDir, name);
			const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));

			expect(
				uncoveredChains(pkgDir, pkg.sideEffects, entryFiles(pkgDir, pkg)),
				`${name}: a side-effect module is reachable only through a module marked ` +
					`side-effect-free, so a bundler may drop the edge before it ever consults ` +
					`the target's flag. Every module on the chain from the entry must be ` +
					`listed in "sideEffects", not only the one holding the import or assignment.`
			).toEqual([]);
		}
	);

	it.each(packages.filter(name => packageCapabilities(join(packagesDir,name)).requiresDist))('%s ships dist in the shape the markers read', (name) => {
		// The remaining BARE_IMPORT and relativeDeps markers assume one statement per line with
		// whitespace after `import` and `export`. A minified emission matches
		// none of them, and the chain walk would go silent rather than red.
		const dist = join(packagesDir, name, 'dist');
		const files = walkFiles(dist, { skip: ['node_modules'], keep: (f) => f.endsWith('.js') }).files;
		const minified = files.filter((file) => looksMinified(readFileSync(file, 'utf8')));

		expect(
			minified.map((f) => relative(dist, f)),
			`${name}: minified module syntax, which the side-effect markers cannot read`
		).toEqual([]);
		// And the shape they do read is present, so the arm is about something.
		expect(files.some((file) => /^import\s/m.test(readFileSync(file, 'utf8')))).toBe(true);
	});

});

/**
 * Walk down from every entry, carrying the path. When a side-effect module is
 * reached — a bare import, or an assignment into an imported binding — every
 * module on the chain to it must be covered, because any side-effect-free link
 * lets a bundler delete the edge above it. Exported for the positive controls.
 */
export function uncoveredChains(pkgDir: string, sideEffects: unknown, entries: string[]): string[] {
	const problems: string[] = [];
	const seen = new Set<string>();

	const visit = (file: string, path: string[]) => {
		if (seen.has(file)) return;
		seen.add(file);

		const source = readFileSync(file, 'utf8');
		const chain = [...path, file];
		// CSS is exempt, and that is measured rather than assumed: a real Vite
		// build keeps `import 'maplibre-gl/dist/maplibre-gl.css'` in a retained
		// component even under `sideEffects: false`, because the CSS pipeline
		// treats it as a side effect independently of the flag. A bare *JS*
		// import gets no such treatment — that is the one that vanished.
		const bare = [...source.matchAll(BARE_IMPORT)]
			.map((m) => m[1]!)
			.filter((spec) => !/\.(css|scss|sass|less)$/.test(spec));
		const mutated = mutatedImports(source, file.endsWith('.svelte'));

		if (bare.length > 0 || mutated.length > 0) {
			const gap = chain.find((m) => !covered(sideEffects, relative(pkgDir, m)));
			if (gap) {
				const what = [
					bare.length > 0 ? `bare: ${bare.join(', ')}` : '',
					mutated.length > 0 ? `assigns into: ${mutated.join(', ')}` : ''
				]
					.filter(Boolean)
					.join('; ');
				problems.push(`${relative(pkgDir, file)} (${what}) — unprotected link: ${relative(pkgDir, gap)}`);
			}
		}

		for (const spec of relativeDeps(source)) {
			const next = resolveFrom(file, spec);
			if (next) visit(next, chain);
		}
	};

	for (const entry of entries) {
		if (existsSync(entry)) visit(entry, []);
	}

	return problems;
}

describe('the chain walk itself', () => {
	// Positive controls, through the real walk, on a package built in a temp
	// directory: the arms above are `filter`s over regexes and a regex that
	// matches nothing passes exactly like a clean tree.
	function scratchPackage(files: Record<string, string>): string {
		const dir = mkdtempSync(join(tmpdir(), 'side-effects-'));
		for (const [rel, content] of Object.entries(files)) {
			mkdirSync(join(dir, rel, '..'), { recursive: true });
			writeFileSync(join(dir, rel), content);
		}
		return dir;
	}

	const attachingPackage = () =>
		scratchPackage({
			'dist/index.js': "export { api } from './api.js';\n",
			'dist/api.js': "import { Effect } from './effect.js';\nexport const api = 1;\nEffect.api = api;\n",
			'dist/effect.js': 'export const Effect = {};\n'
		});

	it('reads the local names an import binds', () => {
		expect([...importBindings("import D, { a, b as c } from 'x';\nimport * as ns from 'y';\n")]).toEqual([
			'D',
			'a',
			'c',
			'ns'
		]);
	});

	it('sees an assignment into an import wherever it sits, and not one in a comment', () => {
		expect(mutatedImports("import { Effect } from './e.js';\nEffect.api = 1;\n")).toEqual(['Effect']);
		expect(mutatedImports("import { Effect } from './e.js';\n/* Effect.api = 1; */\n")).toEqual([]);
		// Indented: a top-level block, the shape that evaded the column-0 form.
		expect(mutatedImports("import { Effect } from './e.js';\ntry {\n  Effect.api = 1;\n} catch {}\n")).toEqual(['Effect']);
		// A dormant uncalled function body must be negative.
		expect(mutatedImports("import { Effect } from './e.js';\nfunction f() {\n  Effect.api = 1;\n}\n")).toEqual([]);
		expect(mutatedImports("import { Effect } from './e.js';\nEffect['api'] = 1;\n")).toEqual(['Effect']);
		expect(mutatedImports("import { Effect } from './e.js';\nEffect.api ??= 1;\n")).toEqual(['Effect']);
		expect(mutatedImports("import { Effect } from './e.js';\nEffect.api === 1;\n")).toEqual([]);
		expect(mutatedImports("import { Effect } from './e.js';\nEffect.api == 1;\n")).toEqual([]);
		expect(mutatedImports("const Local = {};\nLocal.x = 1;\n")).toEqual([]);
	});

	it('dormant uncalled functions and async loaders are negative', () => {
		expect(
			mutatedImports(
				"import Prism from 'prismjs';\nexport async function loadLanguage(lang) {\n  Prism.languages[lang] = {};\n}\n"
			)
		).toEqual([]);
		expect(
			mutatedImports(
				"import { Effect } from './e.js';\nconst init = () => { Effect.api = 1; };\nexport const helper = 42;\n"
			)
		).toEqual([]);
	});

	it('invokes local functions and aliases reached during module initialization', () => {
		// Local alias invoked immediately
		expect(
			mutatedImports("import { Effect } from './e.js';\nconst register = () => Effect.api = 1;\nregister();\n")
		).toEqual(['Effect']);
		// Called local function declared before or after (hoisted)
		expect(
			mutatedImports("import { Effect } from './e.js';\nregister();\nfunction register() {\n  Effect.api = 1;\n}\n")
		).toEqual(['Effect']);
		// IIFEs (arrow function and function expression)
		expect(
			mutatedImports("import { Effect } from './e.js';\n(() => { Effect.api = 1; })();\n")
		).toEqual(['Effect']);
		expect(
			mutatedImports("import { Effect } from './e.js';\n(function() { Effect['api'] = 1; })();\n")
		).toEqual(['Effect']);
		// Import aliases
		expect(
			mutatedImports("import { Effect as Renamed } from './e.js';\nRenamed.api = 1;\n")
		).toEqual(['Renamed']);
	});

	it('respects lexical shadowing for parameters and local variables', () => {
		expect(
			mutatedImports("import { Effect } from './e.js';\nfunction apply(Effect) {\n  Effect.api = 1;\n}\napply({});\n")
		).toEqual([]);
		expect(
			mutatedImports("import { Effect } from './e.js';\nfunction setup() {\n  const Effect = {};\n  Effect.api = 1;\n}\nsetup();\n")
		).toEqual([]);
		expect(
			mutatedImports("import { Effect } from './e.js';\n{\n  const Effect = {};\n  Effect.api = 1;\n}\n")
		).toEqual([]);
	});

	it('bounds recursive function calls during initialization', () => {
		expect(
			mutatedImports("import { Effect } from './e.js';\nfunction loop(n) {\n  if (n > 0) loop(n - 1);\n}\nloop(5);\n")
		).toEqual([]);
	});

	it('detects inline assignment expressions and ignores comments and strings', () => {
		expect(mutatedImports("import { Effect } from './e.js';\nconst x = (Effect.api = 1);\n")).toEqual(['Effect']);
		expect(mutatedImports("import { Effect } from './e.js';\nconsole.log(Effect.api = 1);\n")).toEqual(['Effect']);
		expect(mutatedImports("import { Effect } from './e.js';\n// Effect.api = 1;\n/* Effect.api = 2; */\nconst s = 'Effect.api = 3';\n")).toEqual([]);
	});

	it('tells minified module syntax from the shape the markers read', () => {
		expect(looksMinified("import{Effect}from'./e.js';Effect.api=1;")).toBe(true);
		expect(looksMinified("export*from'./x.js';")).toBe(true);
		expect(looksMinified("import { Effect } from './e.js';\nexport * from './x.js';\n")).toBe(false);
	});

	it('reports an assignment reached only through an unlisted re-export', () => {
		const dir = attachingPackage();
		try {
			const problems = uncoveredChains(dir, ['dist/index.js'], [join(dir, 'dist/index.js')]);
			expect(problems).toHaveLength(1);
			expect(problems[0]).toContain('dist/api.js');
			expect(problems[0]).toContain('assigns into: Effect');
			expect(problems[0]).toContain('unprotected link: dist/api.js');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('reports a bare import the same way', () => {
		const dir = scratchPackage({
			'dist/index.js': "export { x } from './mid.js';\n",
			'dist/mid.js': "import './register.js';\nexport const x = 1;\n",
			'dist/register.js': 'globalThis.registered = true;\n'
		});
		try {
			const problems = uncoveredChains(dir, ['dist/index.js', 'dist/register.js'], [join(dir, 'dist/index.js')]);
			expect(problems).toHaveLength(1);
			expect(problems[0]).toContain('unprotected link: dist/mid.js');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('is satisfied once every link on the chain is listed', () => {
		const dir = attachingPackage();
		try {
			expect(uncoveredChains(dir, ['dist/index.js', 'dist/api.js'], [join(dir, 'dist/index.js')])).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

/**
 * A package's JSDoc must not tell you to import its own exports from elsewhere.
 *
 * `media`'s `audio-player` and `voice-input` barrels, and `chat`'s
 * `streaming-chat` barrel, each carried an `@example` importing that package's
 * own components from `@composable-svelte/code`. Wrong package entirely — and
 * unlike a mistake in a markdown file, this one **ships**: the comment is copied
 * verbatim into `dist/*.js` and `dist/*.d.ts`, so a consumer hovering the symbol
 * in their editor is told to install the wrong dependency.
 *
 * Nothing read it. Both documentation guards walk markdown; a JSDoc example is
 * invisible to them, which is how one survived long enough for the register to
 * record it and then miscount which files it was in.
 *
 * Cross-package examples are fine and common — `media` importing `createStore`
 * from `core` is correct. What is never right is naming a symbol the package
 * itself exports and sourcing it from a sibling.
 */
describe('JSDoc examples name the right package', () => {
	const packagesDir = join(repoRoot, 'packages');

	const offenders = listDirs(packagesDir).flatMap((pkg) => {
		const exported = existsSync(join(packagesDir, pkg, 'dist', 'index.d.ts'))
			? readFileSync(join(packagesDir, pkg, 'dist', 'index.d.ts'), 'utf8')
			: '';

		return walkFiles(join(packagesDir, pkg, 'src'), {
			skip: ['node_modules', 'dist', '.svelte-kit', '.git', 'plans', 'worktrees'],
			keep: (n) => n.endsWith('.ts') || n.endsWith('.svelte')
		}).files.flatMap((file) => {
			const source = readFileSync(file, 'utf8');
			const out: string[] = [];

			// A JSDoc import block: ` *   Name,` lines closed by ` * } from '…';`
			for (const m of source.matchAll(
				/^\s*\*\s*import\s*\{([\s\S]*?)\}\s*from\s*'(@composable-svelte\/[\w-]+)[^']*';/gm
			)) {
				const from = m[2]!.split('/')[1]!;
				if (from === pkg) continue;

				const names = m[1]!
					.split(/[,\n]/)
					.map((n) => n.replace(/^\s*\*?\s*/, '').trim())
					.filter(Boolean);

				const own = names.filter((n) => new RegExp(`\\b${n}\\b`).test(exported));
				if (own.length > 0) {
					out.push(`${relative(repoRoot, file)} sources ${own.join(', ')} from @composable-svelte/${from}`);
				}
			}

			return out;
		});
	});

	it('no package sources its own exports from a sibling', () => {
		expect(
			offenders,
			'this comment is copied into dist/*.js and dist/*.d.ts, so it ships:\n' +
				offenders.join('\n')
		).toEqual([]);
	});
});

describe('import-time reachability qualification', () => {
 const imported = "import { Effect as E } from './effect.js';\n";
 it.each([
  ['dormant declared function', 'function dormant() { E.api = 1; }', []],
  ['dormant arrow', 'const dormant = () => { E.api = 1; };', []],
  ['declared startup function', 'function register() { E.api = 1; } register();', ['E']],
  ['hoisted startup function', 'register(); function register() { E.api = 1; }', ['E']],
  ['arrow startup function', 'const register = () => { E.api = 1; }; register();', ['E']],
  ['IIFE expression', '(function () { E.api = 1; })();', ['E']],
  ['arrow IIFE', '(() => { E.api = 1; })();', ['E']],
  ['nested dormant closure', 'function register() { function later() { E.api = 1; } } register();', []],
  ['called local alias', 'const alias = E; alias.api = 1;', ['E']],
  ['function alias call', 'function register() { E.api = 1; } const run = register; run();', ['E']],
  ['shadowed parameter', 'function register(E) { E.api = 1; } register({});', []],
  ['parameter import alias', 'function register(value) { value.api = 1; } register(E);', ['E']],
  ['top-level block', 'if (enabled) { E["api"] ||= 1; }', ['E']],
  ['inline expression', 'const value = (E.api ??= 1);', ['E']],
  ['recursive local call', 'function register() { E.api = 1; register(); } register();', ['E']],
  ['string and comment only', 'const text = "E.api = 1"; /* E.api = 1; */', []],
  ['called function local shadow', 'function register() { const E = {}; E.api = 1; } register();', []],
  ['class static initialization', 'class Registration { static { E.api = 1; } }', ['E']],
 ] as const)('%s', (_name, body, expected) => {
  expect(mutatedImports(imported + body)).toEqual(expected);
 });
});

describe('lexical reachability counterexamples', () => {
 const imported = "import { Effect as E } from './effect.js';\n";
 it.each([
  ['nested block shadow does not hide outer import', 'function run(){ { const E = {}; E.api = 1; } E.api = 2; } run();', ['E']],
  ['local function closes over block shadow', '{ const E = {}; function run(){ E.api = 1; } run(); }', []],
  ['logical read is not mutation', '!E.api; +E.api; -E.api; ~E.api;', []],
  ['increment is mutation', 'E.api++;', ['E']],
  ['instance initializer is dormant', 'class Example { field = (E.api = 1); }', []],
  ['provided argument skips default initializer', 'function run(value = (E.api = 1)){} run(0);', []],
  ['omitted argument evaluates default initializer', 'function run(value = (E.api = 1)){} run();', ['E']],
  ['branch keeps possible imported alias', 'let alias = E; if (flag) alias = {}; alias.api = 1;', ['E']],
  ['recursive argument forwarding', 'function run(value){ if(flag) run(E); value.api = 1; } run({});', ['E']],
  ['called function publishes module alias', 'let alias; function setup(){ alias = E; } setup(); alias.api = 1;', ['E']],
 ] as const)('%s', (_name, body, expected) => expect(mutatedImports(imported+body)).toEqual(expected));
});

describe('static callable member boundaries', () => {
 const imported = "import { Effect as E } from './effect.js';\n";
 it.each([
  ['binding does not invoke a function', 'function register(){ E.api = 1; } const bound = register.bind(null);', []],
  ['inspecting does not invoke a function', 'function register(){ E.api = 1; } register.toString();', []],
  ['local callable property', 'const registry = { install: () => { E.api = 1; } }; registry.install();', ['E']],
  ['local callable bracket property', 'const registry = { install: () => { E.api = 1; } }; registry["install"]();', ['E']],
  ['local object import alias', 'const registry = { effect: E }; registry.effect.api = 1;', ['E']],
  ['explicit call forwards parameters', 'function register(value){ value.api = 1; } register.call(null, E);', ['E']],
  ['explicit apply forwards parameters', 'function register(value){ value.api = 1; } register.apply(null, [E]);', ['E']],
 ] as const)('%s', (_name, body, expected) => expect(mutatedImports(imported+body)).toEqual(expected));
});

describe('independent review control flow and write targets', () => {
 const imported = "import { Effect as E } from './effect.js';\n";
 it.each([
  ['logical alias', 'const alias = E || {}; alias.api = 1;', ['E']],
  ['nullish grouped alias', '(fallback ?? E).api = 1;', ['E']],
  ['logical assignment retains prior alias', 'let alias = E; alias ||= {}; alias.api = 1;', ['E']],
  ['array destructuring target', '[E.api] = [1];', ['E']],
  ['object destructuring target', '({api: E.api} = {api: 1});', ['E']],
  ['switch branch join', 'let alias; switch(mode){ case 1: alias = E; break; default: alias = {}; } alias.api = 1;', ['E']],
  ['try branch join', 'let alias; try { alias = E; } catch { alias = {}; } alias.api = 1;', ['E']],
  ['for of writes target', 'for(E.api of items){}', ['E']],
  ['for in writes target', 'for(E.api in items){}', ['E']],
  ['possibly empty loop preserves alias', 'let alias = E; for(const item of items){ alias = {}; } alias.api = 1;', ['E']],
 ] as const)('%s', (_name, body, expected) => expect(mutatedImports(imported+body)).toEqual(expected));
});


it('fails closed for malformed syntax instead of reporting a clean mutation set', () => {
	expect(() => mutatedImports("import { E } from './e.js'; E.api = ;")).toThrow('Cannot inspect import-time mutations');
});


describe('published Svelte source boundaries', () => {
	it('inspects module script and ignores markup', () => {
		expect(mutatedImports("<script module>import { E } from './e.js'; E.api = 1;</script><div>content</div>", true)).toEqual(['E']);
	});
	it('does not treat instance initialization as import-time execution', () => {
		expect(mutatedImports("<script>import { E } from './e.js'; E.api = 1;</script><div>content</div>", true)).toEqual([]);
	});
});

it('includes instance imports hoisted into the Svelte module by the compiler', () => {
 expect(mutatedImports("<script module>E.api = 1;</script><script>import { E } from './e.js';</script><div></div>", true)).toEqual(['E']);
});
