<script lang="ts">
	import { createStore } from '@composable-svelte/core';
	import {
		CodeEditor,
		codeEditorReducer,
		createEditorInitialState
	} from '@composable-svelte/code';

	// Example 1: JavaScript Editor
	const jsStore = createStore({
		initialState: createEditorInitialState({
			value: `// JavaScript Example
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));`,
			language: 'javascript',
			theme: 'dark'
		}),
		reducer: codeEditorReducer,
		dependencies: {
			onSave: async (value) => {
				console.log('[Demo] Saving code:', value);
				await new Promise((r) => setTimeout(r, 500));
				console.log('[Demo] Code saved successfully');
			}
		}
	});

	// Example 2: TypeScript Editor with formatter
	const tsStore = createStore({
		initialState: createEditorInitialState({
			value: `// TypeScript Example
interface User{name:string;age:number;}
const user:User={name:"Alice",age:30};
function greet(user:User):string{return \`Hello, \${user.name}!\`;}
console.log(greet(user));`,
			language: 'typescript',
			theme: 'dark'
		}),
		reducer: codeEditorReducer,
		dependencies: {
			onSave: async (value) => {
				console.log('[Demo] Saving TypeScript:', value);
				await new Promise((r) => setTimeout(r, 500));
			},
			formatter: async (code) => {
				// Simulate formatting
				console.log('[Demo] Formatting code...');
				await new Promise((r) => setTimeout(r, 300));
				// Simple formatting simulation
				return code
					.replace(/interface\s+(\w+)\{/g, 'interface $1 {\n  ')
					.replace(/;(\w)/g, ';\n  $1')
					.replace(/\}/g, '\n}');
			}
		}
	});

	// Example 3: HTML Editor (Light Theme)
	const htmlStore = createStore({
		initialState: createEditorInitialState({
			value: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Code Editor Demo</title>
</head>
<body>
  <h1>Hello, World!</h1>
  <p>This is an interactive code editor.</p>
</body>
</html>`,
			language: 'html',
			theme: 'light'
		}),
		reducer: codeEditorReducer
	});

	// Example 4: Python Editor (Read-only)
	const pythonStore = createStore({
		initialState: createEditorInitialState({
			value: `# Python Example
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)

print(quicksort([3, 6, 8, 10, 1, 2, 1]))`,
			language: 'python',
			theme: 'dark',
			readOnly: true
		}),
		reducer: codeEditorReducer
	});
</script>

<div class="space-y-12">
	<!-- Live Demo Section -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
			<p class="text-muted-foreground text-sm">
				Full-featured code editor with syntax highlighting, line numbers, and save functionality
			</p>
		</div>

		<div class="space-y-8">
			<!-- Example 1: JavaScript Editor -->
			<div class="space-y-4">
				<h4 class="text-sm font-medium text-muted-foreground">JavaScript Editor (Dark Theme)</h4>
				<div class="h-[300px]">
					<CodeEditor store={jsStore} />
				</div>
				<p class="text-xs text-muted-foreground">
					Try editing the code and pressing Cmd+S (Mac) or Ctrl+S (Windows) to save
				</p>
			</div>

			<!-- Example 2: TypeScript Editor with Formatter -->
			<div class="space-y-4">
				<h4 class="text-sm font-medium text-muted-foreground">
					TypeScript Editor with Formatter
				</h4>
				<div class="h-[300px]">
					<CodeEditor store={tsStore} />
				</div>
				<p class="text-xs text-muted-foreground">
					Click "Format" or press Cmd+Shift+F to format the code
				</p>
			</div>

			<!-- Example 3: HTML Editor (Light Theme) -->
			<div class="space-y-4">
				<h4 class="text-sm font-medium text-muted-foreground">HTML Editor (Light Theme)</h4>
				<div class="h-[300px]">
					<CodeEditor store={htmlStore} />
				</div>
				<p class="text-xs text-muted-foreground">
					Light theme with HTML syntax highlighting
				</p>
			</div>

			<!-- Example 4: Python Editor (Read-only) -->
			<div class="space-y-4">
				<h4 class="text-sm font-medium text-muted-foreground">Python Editor (Read-only)</h4>
				<div class="h-[300px]">
					<CodeEditor store={pythonStore} />
				</div>
				<p class="text-xs text-muted-foreground">
					Read-only mode - you can view but not edit the code
				</p>
			</div>
		</div>
	</section>

	<!-- Description -->\n\t<section class="space-y-4">
		<h3 class="text-xl font-semibold">Usage</h3>
		<div class="prose prose-sm dark:prose-invert">
			<p>
				The CodeEditor component provides a full-featured interactive code editor built on
				CodeMirror 6. Perfect for code playgrounds, documentation, tutorials, and development
				tools. Key features include:
			</p>
			<ul>
				<li>Syntax highlighting for 11+ languages</li>
				<li>Line numbers and gutter</li>
				<li>Auto-save tracking (unsaved changes indicator)</li>
				<li>Customizable save and format handlers</li>
				<li>Light and dark themes</li>
				<li>Read-only mode</li>
				<li>Keyboard shortcuts (Cmd+S to save, Cmd+Shift+F to format)</li>
				<li>Status bar with cursor position and selection info</li>
			</ul>
		</div>
	</section>

	<!-- Features Section -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Key Features</h3>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
			<div class="rounded-lg border bg-card p-6 space-y-3">
				<div class="text-2xl">🎨</div>
				<h4 class="font-semibold">Syntax Highlighting</h4>
				<p class="text-sm text-muted-foreground">
					Support for 11+ languages including TypeScript, JavaScript, Python, Rust, HTML, CSS,
					and more
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<div class="text-2xl">💾</div>
				<h4 class="font-semibold">Smart Save</h4>
				<p class="text-sm text-muted-foreground">
					Tracks unsaved changes with visual indicator. Async save handler with error handling.
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<div class="text-2xl">⌨️</div>
				<h4 class="font-semibold">Keyboard Shortcuts</h4>
				<p class="text-sm text-muted-foreground">
					Cmd+S to save, Cmd+Shift+F to format, plus all standard editor shortcuts
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<div class="text-2xl">🌓</div>
				<h4 class="font-semibold">Theme Support</h4>
				<p class="text-sm text-muted-foreground">
					Light and dark themes with auto-detection of system preference
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<div class="text-2xl">📊</div>
				<h4 class="font-semibold">Status Bar</h4>
				<p class="text-sm text-muted-foreground">
					Shows cursor position, selection info, and current language
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<div class="text-2xl">🏗️</div>
				<h4 class="font-semibold">Composable Architecture</h4>
				<p class="text-sm text-muted-foreground">
					All state in store, pure reducers, effects as data, fully testable
				</p>
			</div>
		</div>
	</section>

	<!-- Use Cases Section -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Common Use Cases</h3>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
			<div class="rounded-lg border bg-card p-6 space-y-3">
				<h4 class="font-semibold">Code Playgrounds</h4>
				<p class="text-sm text-muted-foreground">
					Interactive coding environments where users can write and execute code
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<h4 class="font-semibold">Documentation</h4>
				<p class="text-sm text-muted-foreground">
					Show editable code examples in documentation with syntax highlighting
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<h4 class="font-semibold">Development Tools</h4>
				<p class="text-sm text-muted-foreground">
					Build IDE-like features for web-based development environments
				</p>
			</div>
		</div>
	</section>

	<!-- Best Practices -->\n\t<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Best Practices</h3>
		</div>

		<div class="space-y-4">
			<div class="rounded-lg border bg-card p-6">
				<h4 class="font-semibold mb-3">When to Use CodeEditor vs CodeHighlight</h4>
				<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
					<li>Use <strong>CodeEditor</strong> when users need to edit code</li>
					<li>Use <strong>CodeHighlight</strong> for read-only code display</li>
					<li>CodeEditor is heavier (~124KB) but more feature-rich</li>
					<li>CodeHighlight is lighter and simpler for static code</li>
				</ul>
			</div>

			<div class="rounded-lg border bg-card p-6">
				<h4 class="font-semibold mb-3">Performance Tips</h4>
				<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
					<li>Use read-only mode when editing is not needed</li>
					<li>Debounce save operations for large files</li>
					<li>Consider lazy-loading the editor for better initial load time</li>
					<li>CodeMirror handles large files well with built-in virtualization</li>
				</ul>
			</div>

			<div class="rounded-lg border bg-card p-6">
				<h4 class="font-semibold mb-3">Keyboard Shortcuts</h4>
				<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
					<li><strong>Cmd+S / Ctrl+S:</strong> Save code</li>
					<li><strong>Cmd+Shift+F / Ctrl+Shift+F:</strong> Format code</li>
					<li><strong>Cmd+Z / Ctrl+Z:</strong> Undo</li>
					<li><strong>Cmd+Shift+Z / Ctrl+Shift+Z:</strong> Redo</li>
					<li>Plus all standard CodeMirror shortcuts</li>
				</ul>
			</div>
		</div>
	</section>

	<!-- Architecture Details -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Architecture</h3>
		</div>

		<div class="rounded-lg border bg-card p-6 space-y-4">
			<p class="text-sm text-muted-foreground">
				CodeEditor follows Composable Svelte architecture patterns:
			</p>
			<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
				<li><strong>ALL state in store:</strong> No component $state, all application state lives in the store</li>
				<li><strong>CodeMirror as infrastructure:</strong> CodeMirror is like the DOM - we bridge its changes to our store</li>
				<li><strong>Pure reducer:</strong> All business logic (save, format, validation) in reducer</li>
				<li><strong>Effects as data:</strong> Save and format operations return Effect structures</li>
				<li><strong>Fully testable:</strong> Mock CodeMirror in tests, test reducer logic in isolation with TestStore</li>
			</ul>
			<div class="mt-4 p-4 bg-muted/30 rounded text-xs text-muted-foreground">
				<strong>Note:</strong> The `codemirrorValue` variable in the component is NOT component state -
				it's a simple variable tracking CodeMirror's internal value to prevent circular updates, similar
				to tracking `input.value` for a DOM input element.
			</div>
		</div>
	</section>
</div>
