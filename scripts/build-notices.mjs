#!/usr/bin/env node
/**
 * Generates `public/THIRD-PARTY-NOTICES.txt` from the installed production dependency tree.
 *
 * SketchPilot AI presents itself as a product of its own: no other product's name in the UI, no
 * links out, no offers. That is a branding decision. It is **not** a licence decision — the MIT,
 * Apache-2.0 and ISC components we ship require their copyright notices and permission text to
 * travel with the code, so they ship, in full, in this file.
 *
 * Run `npm run notices` after changing a dependency (CI re-runs it and fails if the committed
 * file differs).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();

const LS_ARGS = ['ls', '--omit=dev', '--all', '--json'];

/**
 * Runs one command and returns its stdout, or `null` when the executable could not be started at
 * all (as opposed to it running and failing, which is a real error we want to surface).
 */
function tryRun(file, args) {
  try {
    return execFileSync(file, args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const code = error?.code;
    if (code === 'ENOENT' || code === 'EINVAL' || code === 'EACCES') return null;
    throw error;
  }
}

/**
 * `npm ls --json`, on every platform.
 *
 * On Windows `npm` is a `npm.cmd` shim, and `execFileSync("npm", …)` fails with
 * `spawnSync npm ENOENT` (Node does not apply PATHEXT to a bare file name, and modern Node
 * refuses to spawn `.cmd`/`.bat` without a shell). Rather than passing `shell: true` — which
 * re-quotes our arguments through cmd.exe — we run npm's own JavaScript entry point with the
 * Node binary already running this script. That path is exposed by npm itself as `npm_execpath`
 * whenever this script is launched through `npm run`, which is how the build calls it.
 */
function npmTree() {
  // `--from-lockfile` exercises the fallback deliberately (npm run notices:lockfile); the env
  // var is kept for the same purpose in environments that cannot pass arguments.
  if (process.argv.includes('--from-lockfile') || process.env.SKETCHPILOT_NOTICES_SKIP_NPM === '1') {
    return null;
  }

  const cliPath = process.env.npm_execpath;
  if (cliPath && /\.[cm]?js$/i.test(cliPath) && existsSync(cliPath)) {
    const output = tryRun(process.execPath, [cliPath, ...LS_ARGS]);
    if (output !== null) return output;
  }

  // Outside `npm run` (or with a non-JS npm shim) fall back to the platform's launcher name.
  const output = tryRun(process.platform === 'win32' ? 'npm.cmd' : 'npm', LS_ARGS);
  return output;
}

/** The `node_modules/...` key of a lockfile entry, reduced to the bare package name. */
function lockName(key) {
  const index = key.lastIndexOf('node_modules/');
  if (index === -1) return null;
  return key.slice(index + 'node_modules/'.length);
}

/**
 * Fallback tree, read straight from `package-lock.json`.
 *
 * This exists so the build can never be blocked by a missing or unusual npm launcher: the notices
 * file is a licence obligation, and failing to *regenerate* it must not look like failing to
 * *ship* it. It walks the lockfile the way the installer does — starting at the root's production
 * dependencies and following `dependencies`, `optionalDependencies` and installed
 * `peerDependencies` — so it reaches the same set of packages as `npm ls --omit=dev`, including
 * peers that npm installs for production packages but marks `dev` in the lockfile because the root
 * also lists them as dev dependencies (react's type packages, for instance).
 */
function lockfileTree() {
  const lockPath = join(root, 'package-lock.json');
  if (!existsSync(lockPath)) {
    throw new Error(
      'Cannot read the production dependency tree: `npm` could not be started and there is no package-lock.json to fall back to.',
    );
  }
  const entries = new Map(Object.entries(JSON.parse(readFileSync(lockPath, 'utf8')).packages ?? {}));
  const rootEntry = entries.get('') ?? {};

  /** Node resolution: nearest `node_modules/<name>` walking up from `fromKey`. */
  const resolveFrom = (fromKey, name) => {
    let base = fromKey;
    for (;;) {
      const candidate = `${base ? `${base}/` : ''}node_modules/${name}`;
      if (entries.has(candidate)) return candidate;
      const cut = base.lastIndexOf('/node_modules/');
      if (cut === -1) {
        const top = `node_modules/${name}`;
        return entries.has(top) ? top : null;
      }
      base = base.slice(0, cut);
    }
  };

  const found = new Map();
  const queue = Object.keys({ ...rootEntry.dependencies, ...rootEntry.optionalDependencies }).map((name) => ({
    fromKey: '',
    name,
  }));
  const visited = new Set();

  while (queue.length > 0) {
    const { fromKey, name } = queue.shift();
    const key = resolveFrom(fromKey, name);
    if (!key || visited.has(key)) continue;
    visited.add(key);

    const entry = entries.get(key);
    if (entry.link || entry.inBundle) continue;
    const packageName = lockName(key);
    const dedupe = `${packageName}@${entry.version ?? 'unknown'}`;
    if (!found.has(dedupe)) found.set(dedupe, { name: packageName, version: entry.version });

    const next = { ...entry.dependencies, ...entry.optionalDependencies, ...entry.peerDependencies };
    for (const dependency of Object.keys(next)) queue.push({ fromKey: key, name: dependency });
  }

  return [...found.values()].sort(
    (left, right) => left.name.localeCompare(right.name) || String(left.version).localeCompare(String(right.version)),
  );
}

function productionTree() {
  const output = npmTree();
  if (output === null) {
    process.stderr.write('build-notices: `npm` could not be started; reading package-lock.json instead.\n');
    return lockfileTree();
  }
  const parsed = JSON.parse(output);
  const found = new Map();

  const walk = (node) => {
    for (const [name, dependency] of Object.entries(node.dependencies ?? {})) {
      const key = `${name}@${dependency.version ?? 'unknown'}`;
      if (!found.has(key)) found.set(key, { name, version: dependency.version, dir: dependency.resolved });
      walk(dependency);
    }
  };
  walk(parsed);
  return [...found.values()].sort(
    (left, right) => left.name.localeCompare(right.name) || String(left.version).localeCompare(String(right.version)),
  );
}

/** Reads a package's licence field plus the first copyright lines from its LICENSE file. */
function licenceOf(name, version) {
  const dir = join(root, 'node_modules', name);
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return null;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const field =
    typeof pkg.license === 'string'
      ? pkg.license
      : pkg.license?.type ?? (Array.isArray(pkg.licenses) ? pkg.licenses.map((entry) => entry.type).join(' OR ') : 'UNKNOWN');

  let copyright = '';
  const candidates = existsSync(dir) ? readdirSync(dir).filter((file) => /^(licen[cs]e|copying)/i.test(file)) : [];
  if (candidates.length > 0) {
    const text = readFileSync(join(dir, candidates[0]), 'utf8');
    // Only real attribution lines — licence boilerplate also contains the word "copyright".
    const line = text
      .split('\n')
      .map((entry) => entry.trim())
      .find((entry) => /^copyright\s*(\(c\)|©|\d{4})/i.test(entry));
    if (line) copyright = line;
  }
  return { name, version, license: field, copyright, repository: pkg.repository?.url ?? '' };
}

const MIT_TEXT = `MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const packages = productionTree().map((entry) => licenceOf(entry.name, entry.version)).filter(Boolean);
const byLicense = new Map();
for (const entry of packages) {
  const key = entry.license || 'UNKNOWN';
  if (!byLicense.has(key)) byLicense.set(key, []);
  byLicense.get(key).push(entry);
}

const lines = [
  'SketchPilot AI — third-party notices',
  '====================================',
  '',
  'SketchPilot AI is an independent product. It is not affiliated with, endorsed by, sponsored',
  'by, or produced by any other project, and it presents no other product’s name, links or',
  'offers in its interface.',
  '',
  'It is nevertheless built on open-source software, and those licences require their notices',
  'to be included when the software is distributed. That is what this file is: the attribution',
  'required by the licences, not an endorsement or a partnership. Removing it would violate the',
  'licences of the components below.',
  '',
  `Generated from the production dependency tree: ${packages.length} packages.`,
  '',
  '------------------------------------------------------------------------------',
  'Components and licences',
  '------------------------------------------------------------------------------',
  '',
];

for (const [license, entries] of [...byLicense.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
  lines.push(`${license} — ${entries.length} package(s)`);
  for (const entry of entries) {
    lines.push(`  ${entry.name}@${entry.version}`);
    if (entry.copyright) lines.push(`    ${entry.copyright}`);
    if (entry.repository) lines.push(`    ${entry.repository}`);
  }
  lines.push('');
}

lines.push(
  '------------------------------------------------------------------------------',
  'Licence texts',
  '------------------------------------------------------------------------------',
  '',
  MIT_TEXT,
  '',
  '------------------------------------------------------------------------------',
  '',
  'Apache License, Version 2.0',
  '',
  'Licensed under the Apache License, Version 2.0 (the "License"); you may not use the',
  'components listed above except in compliance with the License. You may obtain a copy of the',
  'License at',
  '',
  '    http://www.apache.org/licenses/LICENSE-2.0',
  '',
  'Unless required by applicable law or agreed to in writing, software distributed under the',
  'License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,',
  'either express or implied. See the License for the specific language governing permissions',
  'and limitations under the License.',
  '',
  '------------------------------------------------------------------------------',
  '',
  'ISC License',
  '',
  'Permission to use, copy, modify, and/or distribute this software for any purpose with or',
  'without fee is hereby granted, provided that the above copyright notice and this permission',
  'notice appear in all copies.',
  '',
  'THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS',
  'SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL',
  'THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY',
  'DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF',
  'CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR',
  'PERFORMANCE OF THIS SOFTWARE.',
  '',
);

const target = resolve(root, 'public/THIRD-PARTY-NOTICES.txt');
writeFileSync(target, `${lines.join('\n')}\n`);
console.info(`✔ wrote ${target} (${packages.length} packages)`);
