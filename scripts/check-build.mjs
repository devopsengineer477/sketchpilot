#!/usr/bin/env node
/**
 * Release guard (spec §11/§14 test 18).
 *
 * Fails the build if the shipped extension can reach outside itself or declares
 * permissions we have not documented. Run after `npm run build`.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

if (!existsSync(dist)) {
  console.error('✖ dist/ is missing — run `npm run build` first.');
  process.exit(1);
}

// 1. Required artefacts.
for (const file of [
  'manifest.json',
  'background.js',
  'popup.html',
  'editor.html',
  'dashboard.html',
  'settings.html',
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
  'excalidraw-assets/fonts',
  'THIRD-PARTY-NOTICES.txt',
  'LICENSE.txt',
]) {
  if (!existsSync(join(dist, file))) fail(`missing build artefact: ${file}`);
}

// 2. Manifest sanity: MV3, a documented permission set, no host permissions.
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
// 2a. Permissions must equal the table in PERMISSIONS.md — parsed, not hard-coded, so
//     the document is the contract (plan P4-T14, spec §14 test 18).
const permissionsDoc = readFileSync(resolve(process.cwd(), 'PERMISSIONS.md'), 'utf8');
// Only the declared table: stop at the next heading so the "not requested" list is ignored.
const section = (permissionsDoc.split('## Declared in the manifest')[1] ?? '').split('###')[0];
const documented = [...section.matchAll(/^\|\s*`([a-zA-Z]+)`\s*\|/gm)].map((match) => match[1]).sort();
const declared = [...(manifest.permissions ?? [])].sort();
if (documented.length === 0) {
  fail('PERMISSIONS.md has no machine-readable permission table (expected rows beginning with `name` |)');
} else if (JSON.stringify(declared) !== JSON.stringify(documented)) {
  const missing = documented.filter((name) => !declared.includes(name));
  const extra = declared.filter((name) => !documented.includes(name));
  fail(
    `permissions drifted: manifest [${declared.join(', ')}] vs PERMISSIONS.md [${documented.join(', ')}]` +
      (missing.length ? ` — documented but not declared: ${missing.join(', ')}` : '') +
      (extra.length ? ` — declared but undocumented: ${extra.join(', ')}` : ''),
  );
} else {
  notes.push(`permissions match PERMISSIONS.md (${declared.join(', ')})`);
}

// 2d. Context menus and commands must stay declared: an undeclared command is a
//     shortcut that silently does nothing.
for (const name of ['new-drawing', 'open-dashboard', 'capture-tab', 'capture-selection']) {
  if (!(manifest.commands ?? {})[name]) fail(`manifest is missing the "${name}" command`);
}
// Chrome refuses to load an extension with more than four suggested shortcuts — a rule
// that fails silently in the browser, so catch it here (it cost us a debugging session).
const suggested = Object.values(manifest.commands ?? {}).filter((command) => command?.suggested_key).length;
if (suggested > 4) fail(`manifest declares ${suggested} suggested shortcuts; Chrome allows at most 4`);
if ((manifest.host_permissions ?? []).length > 0) {
  fail('host_permissions must stay empty: no page should be readable without an explicit user action');
}
if ((manifest.content_scripts ?? []).length > 0) {
  fail('no content scripts are allowed in this milestone');
}

// 2e. Declared CSP must be explicit and closed: no remote script, no plugins/objects, no
//     frames (the canvas must never be able to embed a live third-party page).
const csp = manifest.content_security_policy?.extension_pages ?? '';
if (!/script-src 'self'/.test(csp)) fail('CSP must restrict script-src to \'self\'');
if (!/object-src 'none'/.test(csp)) fail('CSP must set object-src \'none\'');
if (!/frame-src 'none'/.test(csp)) fail('CSP must set frame-src \'none\' (no embedded third-party pages)');
if (/unsafe-eval|unsafe-inline|https?:/.test(csp)) fail(`CSP weakens itself: ${csp}`);

// 2f. Independent branding: the shipped pages and manifest must not name another product.
const manifestText = readFileSync(join(dist, 'manifest.json'), 'utf8');
for (const file of ['manifest.json', 'popup.html', 'editor.html', 'dashboard.html', 'settings.html']) {
  const text = file === 'manifest.json' ? manifestText : readFileSync(join(dist, file), 'utf8');
  if (/excalidraw/i.test(text)) fail(`${file} names another product`);
}

// 2g. Third-party notices must actually contain the licences we rely on.
const notices = readFileSync(join(dist, 'THIRD-PARTY-NOTICES.txt'), 'utf8');
for (const marker of [/MIT License/i, /Apache License/i, /Permission is hereby granted, free of charge/i]) {
  if (!marker.test(notices)) fail(`THIRD-PARTY-NOTICES.txt is missing ${marker}`);
}
notes.push('third-party notices shipped');

// 2b. Manifest version must match the package version (releases stay traceable).
const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) {
  fail(`manifest version ${manifest.version} does not match package.json ${pkg.version}`);
}

// 2c. The in-app version shown in Settings must not drift from the release either.
const schemasSource = readFileSync(resolve(process.cwd(), 'src/storage/schemas.ts'), 'utf8');
const appVersion = /APP_VERSION = '([^']+)'/.exec(schemasSource)?.[1];
if (appVersion !== pkg.version) {
  fail(`src/storage/schemas.ts APP_VERSION ${appVersion} does not match package.json ${pkg.version}`);
}

// 3. Entry pages must not reference remote assets.
for (const page of ['popup.html', 'editor.html', 'dashboard.html', 'settings.html']) {
  const html = readFileSync(join(dist, page), 'utf8');
  const remote = html.match(/https?:\/\/[^"'\s>]+/g) ?? [];
  if (remote.length) fail(`${page} references remote resources: ${remote.join(', ')}`);
}

// 4. No remote code execution primitives in shipped scripts, with one documented
//    allowlist: Excalidraw bundles an Emscripten/wasm "glue" chunk (used by its
//    Mermaid export path) whose generated wrappers call `new Function`. It never
//    receives user input, is only reachable from the editor entry, and is not
//    loaded by the popup or dashboard. Everything else must be clean.
const ENGINE_WASM_GLUE = /^subset-(shared|worker)\.chunk-.*\.js$/;
let allowlisted = 0;
const scripts = readdirSync(join(dist, 'assets')).filter((file) => file.endsWith('.js'));
for (const file of [...scripts, 'background.js']) {
  const path = file === 'background.js' ? join(dist, 'background.js') : join(dist, 'assets', file);
  const source = readFileSync(path, 'utf8');
  const usesEval = /(^|[^.\w])eval\s*\(/.test(source);
  const usesFunctionCtor = /new\s+Function\s*\(/.test(source);
  if (!usesEval && !usesFunctionCtor) continue;
  if (ENGINE_WASM_GLUE.test(file) && !usesEval) {
    allowlisted += 1;
    continue;
  }
  fail(`${file} contains ${usesEval ? 'eval()' : 'new Function()'}`);
}
if (allowlisted > 0) notes.push(`${allowlisted} allowlisted engine wasm-glue chunk(s)`);

// 4b. The lightweight surfaces must not pull the engine (or its wasm) in.
for (const entry of ['popup', 'dashboard', 'settings']) {
  const chunk = readdirSync(join(dist, 'assets')).find((file) => file.startsWith(`${entry}-`) && file.endsWith('.js'));
  if (!chunk) {
    fail(`missing ${entry} entry chunk`);
    continue;
  }
  const source = readFileSync(join(dist, 'assets', chunk), 'utf8');
  const sizeKb = readFileSync(join(dist, 'assets', chunk)).byteLength / 1024;
  if (/EXCALIDRAW_ASSET_PATH|subset-worker\.chunk/.test(source)) {
    fail(`${entry} entry pulls the canvas engine`);
  }
  if (sizeKb > 250) fail(`${entry} entry chunk is ${sizeKb.toFixed(0)} kB (budget 250 kB)`);
  else notes.push(`${entry} entry ${sizeKb.toFixed(1)} kB`);
}

// 5. Fonts must be shipped, not fetched.
const fontDir = join(dist, 'excalidraw-assets/fonts');
const families = existsSync(fontDir) ? readdirSync(fontDir) : [];
if (families.length < 5) fail('Excalidraw font families were not copied into the build');
else notes.push(`${families.length} bundled font families`);

// 6. Popup must stay light: the canvas engine belongs to the editor entry only.
const popupChunk = readdirSync(join(dist, 'assets')).find((file) => file.startsWith('popup-') && file.endsWith('.js'));
if (popupChunk) {
  const size = readFileSync(join(dist, 'assets', popupChunk)).byteLength;
  if (size > 200 * 1024) fail(`popup bundle is ${(size / 1024).toFixed(0)} kB (budget 200 kB)`);
  else notes.push(`popup bundle ${(size / 1024).toFixed(1)} kB`);
}

if (failures.length) {
  console.error('✖ build checks failed:');
  for (const failure of failures) console.error(`   - ${failure}`);
  process.exit(1);
}
console.log('✔ build checks passed');
for (const note of notes) console.log(`   · ${note}`);
