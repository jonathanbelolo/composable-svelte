<script lang="ts">
	import { createStore } from '@composable-svelte/core';
	import {
		CodeHighlight,
		codeHighlightReducer,
		createInitialState,
		highlightCode
	} from '@composable-svelte/code';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent
	} from '@composable-svelte/core/components/ui/card/index.js';
	import { Button } from '@composable-svelte/core/components/ui/button/index.js';

	// Example code snippets
	const typescriptExample = `interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

const fetchUser = async (id: string): Promise<User> => {
  const response = await fetch(\`/api/users/\${id}\`);
  return response.json();
};`;

	const pythonExample = `def fibonacci(n: int) -> int:
    """Calculate the nth Fibonacci number."""
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

# Generate first 10 Fibonacci numbers
for i in range(10):
    print(f"F({i}) = {fibonacci(i)}")`;

	const sqlExample = `SELECT
    users.name,
    COUNT(orders.id) AS total_orders,
    SUM(orders.amount) AS total_spent
FROM users
LEFT JOIN orders ON users.id = orders.user_id
WHERE users.created_at >= '2024-01-01'
GROUP BY users.id, users.name
HAVING COUNT(orders.id) > 5
ORDER BY total_spent DESC
LIMIT 10;`;

	const rustExample = `fn main() {
    let numbers = vec![1, 2, 3, 4, 5];

    let sum: i32 = numbers.iter().sum();
    println!("Sum: {}", sum);

    let doubled: Vec<i32> = numbers
        .iter()
        .map(|x| x * 2)
        .collect();

    println!("Doubled: {:?}", doubled);
}`;

	// Create stores for different examples
	const tsStore = createStore({
		initialState: createInitialState({
			code: typescriptExample,
			language: 'typescript',
			theme: 'dark',
			showLineNumbers: true
		}),
		reducer: codeHighlightReducer,
		dependencies: { highlightCode }
	});

	const pythonStore = createStore({
		initialState: createInitialState({
			code: pythonExample,
			language: 'python',
			theme: 'dark',
			showLineNumbers: true
		}),
		reducer: codeHighlightReducer,
		dependencies: { highlightCode }
	});

	const sqlStore = createStore({
		initialState: createInitialState({
			code: sqlExample,
			language: 'sql',
			theme: 'light',
			showLineNumbers: false
		}),
		reducer: codeHighlightReducer,
		dependencies: { highlightCode }
	});

	const rustStore = createStore({
		initialState: createInitialState({
			code: rustExample,
			language: 'rust',
			theme: 'dark',
			showLineNumbers: true
		}),
		reducer: codeHighlightReducer,
		dependencies: { highlightCode }
	});

	// Interactive demo store
	const interactiveStore = createStore({
		initialState: createInitialState({
			code: 'const greeting = "Hello, World!";\nconsole.log(greeting);',
			language: 'javascript',
			theme: 'dark',
			showLineNumbers: true
		}),
		reducer: codeHighlightReducer,
		dependencies: { highlightCode }
	});
</script>

<div class="space-y-12">
	<!-- Introduction -->
	<section class="space-y-4">
		<div>
			<h2 class="text-2xl font-bold mb-2">CodeHighlight Component</h2>
			<p class="text-muted-foreground">
				Read-only syntax highlighting component built with Prism.js and Composable Architecture
			</p>
		</div>
		<div class="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
			<h4 class="font-semibold text-blue-900 dark:text-blue-100 mb-2">Key Features</h4>
			<ul class="text-sm text-blue-800 dark:text-blue-200 space-y-1">
				<li>✓ 10+ Programming languages supported</li>
				<li>✓ Light/dark themes with VS Code-inspired colors</li>
				<li>✓ Copy to clipboard with status feedback</li>
				<li>✓ Optional line numbers</li>
				<li>✓ All state in store (Composable Architecture)</li>
			</ul>
		</div>
	</section>

	<!-- Language Support -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Supported Languages</h3>
			<p class="text-muted-foreground text-sm">
				Multiple programming languages with accurate syntax highlighting
			</p>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<!-- TypeScript -->
			<Card>
				<CardHeader>
					<CardTitle class="text-sm">TypeScript</CardTitle>
					<CardDescription>Full TypeScript syntax support</CardDescription>
				</CardHeader>
				<CardContent>
					<CodeHighlight store={tsStore} />
				</CardContent>
			</Card>

			<!-- Python -->
			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Python</CardTitle>
					<CardDescription>Python with decorators and f-strings</CardDescription>
				</CardHeader>
				<CardContent>
					<CodeHighlight store={pythonStore} />
				</CardContent>
			</Card>

			<!-- SQL -->
			<Card>
				<CardHeader>
					<CardTitle class="text-sm">SQL</CardTitle>
					<CardDescription>Database queries (light theme, no line numbers)</CardDescription>
				</CardHeader>
				<CardContent>
					<CodeHighlight store={sqlStore} />
				</CardContent>
			</Card>

			<!-- Rust -->
			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Rust</CardTitle>
					<CardDescription>System programming language</CardDescription>
				</CardHeader>
				<CardContent>
					<CodeHighlight store={rustStore} />
				</CardContent>
			</Card>
		</div>
	</section>

	<!-- Interactive Controls -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
			<p class="text-muted-foreground text-sm">Toggle features dynamically using store actions</p>
		</div>

		<Card>
			<CardHeader>
				<div class="flex items-center justify-between">
					<div>
						<CardTitle>Customizable Highlighting</CardTitle>
						<CardDescription>Change theme, language, and settings</CardDescription>
					</div>
					<div class="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onclick={() => interactiveStore.dispatch({ type: 'toggleLineNumbers' })}
						>
							{$interactiveStore.showLineNumbers ? 'Hide' : 'Show'} Line Numbers
						</Button>
						<Button
							variant="outline"
							size="sm"
							onclick={() =>
								interactiveStore.dispatch({
									type: 'themeChanged',
									theme: $interactiveStore.theme === 'dark' ? 'light' : 'dark'
								})}
						>
							Switch to {$interactiveStore.theme === 'dark' ? 'Light' : 'Dark'} Theme
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<div class="space-y-4">
					<!-- Language Selector -->
					<div class="flex gap-2">
						{#each ['typescript', 'javascript', 'python', 'rust', 'sql'] as lang}
							<Button
								variant={$interactiveStore.language === lang ? 'default' : 'outline'}
								size="sm"
								onclick={() =>
									interactiveStore.dispatch({
										type: 'languageChanged',
										language: lang
									})}
							>
								{lang.charAt(0).toUpperCase() + lang.slice(1)}
							</Button>
						{/each}
					</div>

					<!-- Code Display -->
					<CodeHighlight store={interactiveStore} />

					<!-- State Display -->
					<Card class="bg-muted">
						<CardContent class="pt-6">
							<div class="text-xs font-mono space-y-1">
								<div>
									<span class="text-muted-foreground">Theme:</span>
									<span class="ml-2 font-semibold">{$interactiveStore.theme}</span>
								</div>
								<div>
									<span class="text-muted-foreground">Language:</span>
									<span class="ml-2 font-semibold">{$interactiveStore.language}</span>
								</div>
								<div>
									<span class="text-muted-foreground">Line Numbers:</span>
									<span class="ml-2 font-semibold"
										>{$interactiveStore.showLineNumbers ? 'On' : 'Off'}</span
									>
								</div>
								<div>
									<span class="text-muted-foreground">Copy Status:</span>
									<span class="ml-2 font-semibold">{$interactiveStore.copyStatus}</span>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</CardContent>
		</Card>
	</section>

	<!-- Usage Example -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Usage Example</h3>
			<p class="text-muted-foreground text-sm">How to use CodeHighlight in your app</p>
		</div>

		<Card>
			<CardContent class="pt-6">
				<pre
					class="text-sm bg-slate-950 text-slate-50 p-4 rounded-lg overflow-x-auto">{`import { createStore } from '@composable-svelte/core';
import {
  CodeHighlight,
  codeHighlightReducer,
  createInitialState,
  highlightCode
} from '@composable-svelte/code';

const store = createStore({
  initialState: createInitialState({
    code: 'const hello = "world";',
    language: 'typescript',
    theme: 'dark',
    showLineNumbers: true
  }),
  reducer: codeHighlightReducer,
  dependencies: { highlightCode }
});`}</pre>
			</CardContent>
		</Card>
	</section>

	<!-- Features -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Feature Highlights</h3>
			<p class="text-muted-foreground text-sm">Built with Composable Architecture principles</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Pure State Management</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					All component state lives in the store. No component <code
						class="text-xs bg-muted px-1 py-0.5 rounded">$state</code
					> for application logic.
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Effects as Data</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Side effects (highlighting, clipboard) are declared as data structures using <code
						class="text-xs bg-muted px-1 py-0.5 rounded">Effect.run()</code
					>.
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Dependency Injection</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					External functionality (Prism.js) is injected as dependencies for easy testing and
					swapping.
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Tree-Shakeable</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Language grammars are loaded dynamically - only bundle the languages you use.
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Fully Testable</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Pure reducer functions can be tested in isolation without mounting components.
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-sm">Type-Safe</CardTitle>
				</CardHeader>
				<CardContent class="text-sm text-muted-foreground">
					Full TypeScript support with discriminated unions and exhaustiveness checks.
				</CardContent>
			</Card>
		</div>
	</section>
</div>
