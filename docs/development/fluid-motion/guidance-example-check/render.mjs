// Generates packages/core/docs/fluid-motion.md: every `@@file@@` line is replaced verbatim by the
// checked file (trailing newline trimmed), so the published examples are the compiled, tested files.
// `node render.mjs --check` fails if the published guide differs from the rendered template.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
const target = fileURLToPath(new URL('../../../../packages/core/docs/fluid-motion.md', import.meta.url));
const rendered = readFileSync(`${here}fluid-motion.template.md`, 'utf8')
  .replace(/^@@(.+?)@@$/gm, (_, file) => readFileSync(`${here}${file}`, 'utf8').replace(/\n$/, ''));
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== rendered) { console.error('fluid-motion.md is stale: run node render.mjs'); process.exit(1); }
  console.log('fluid-motion.md matches the template');
} else {
  writeFileSync(target, rendered);
  console.log(`wrote ${target}`);
}
