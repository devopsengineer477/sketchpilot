/**
 * `npm run docs:matrix` — rewrites docs/test-matrix.md from src/tests/scenario-map.ts.
 *
 * Run through `vite-node` so it can import the TypeScript sources directly, and so the same
 * renderer the test uses produces the file. Cross-platform: no shell redirection, no inline
 * environment variables, no `sed`.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderMatrix } from '../src/tests/matrix-render';

const target = resolve(process.cwd(), 'docs/test-matrix.md');
writeFileSync(target, renderMatrix());
console.info(`✔ wrote ${target}`);
