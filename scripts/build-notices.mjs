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

function productionTree() {
  const json = execFileSync('npm', ['ls', '--omit=dev', '--all', '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(json);
  const found = new Map();

  const walk = (node) => {
    for (const [name, dependency] of Object.entries(node.dependencies ?? {})) {
      const key = `${name}@${dependency.version ?? 'unknown'}`;
      if (!found.has(key)) found.set(key, { name, version: dependency.version, dir: dependency.resolved });
      walk(dependency);
    }
  };
  walk(parsed);
  return [...found.values()].sort((left, right) => left.name.localeCompare(right.name));
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
