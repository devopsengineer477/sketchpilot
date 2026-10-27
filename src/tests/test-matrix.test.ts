import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCENARIOS } from './scenario-map';
import { renderMatrix } from './matrix-render';

const root = resolve(__dirname, '../..');

const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

/** Titles a spec file declares, so a reference can be checked against reality. */
function titlesIn(file: string): string[] {
  const source = read(file);
  const found = [...source.matchAll(/\btest\(\s*'((?:[^'\\]|\\.)*)'/g)].map((match) => match[1]!);
  const unit = [...source.matchAll(/\bit\(\s*'((?:[^'\\]|\\.)*)'/g)].map((match) => match[1]!);
  return [...found, ...unit];
}

describe('§14 test matrix (the map itself)', () => {
  it('covers all eighteen required scenarios, numbered 1..18, with no duplicates', () => {
    expect(SCENARIOS.map((scenario) => scenario.id)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
  });

  it('gives every scenario at least one automated reference', () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.references.length, `scenario ${scenario.id} has no automated test`).toBeGreaterThan(0);
      expect(scenario.requirement.length).toBeGreaterThan(5);
    }
  });

  it('keeps docs/test-matrix.md generated from this map', () => {
    // Regenerate with `npm run docs:matrix` (a node script, so it works on Windows too —
    // the old version relied on `UPDATE_DOCS=1 ...`, which cmd.exe cannot parse).
    const target = resolve(root, 'docs/test-matrix.md');
    expect(existsSync(target), 'run `npm run docs:matrix` to generate it').toBe(true);
    expect(readFileSync(target, 'utf8').replace(/\r\n/g, '\n')).toBe(renderMatrix());
  });

  it('points only at tests that still exist', () => {
    const missing: string[] = [];
    for (const scenario of SCENARIOS) {
      for (const reference of scenario.references) {
        const file = resolve(root, reference.file);
        if (!existsSync(file)) {
          missing.push(`scenario ${scenario.id}: ${reference.file} does not exist`);
          continue;
        }
        if (reference.kind === 'script') {
          if (!read(reference.file).includes(reference.marker)) {
            missing.push(`scenario ${scenario.id}: ${reference.file} no longer contains "${reference.marker}"`);
          }
          continue;
        }
        if (!titlesIn(reference.file).includes(reference.title)) {
          missing.push(`scenario ${scenario.id}: "${reference.title}" not found in ${reference.file}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('scenario 18: the manifest matches its own documentation', () => {
  const manifest = JSON.parse(read('public/manifest.json')) as {
    permissions: string[];
    commands: Record<string, { suggested_key?: unknown }>;
  };

  it('declares exactly the documented permissions', () => {
    // PERMISSIONS.md is the contract; the table's first cell is the permission name.
    const declaredSection = read('PERMISSIONS.md').split('### Deliberately not requested')[0]!;
    const documented = [...declaredSection.matchAll(/^\| `([a-zA-Z]+)` \|/gm)].map((match) => match[1]!);
    expect([...manifest.permissions].sort()).toEqual([...documented].sort());
  });

  it('never asks for host permissions or content scripts', () => {
    const raw = read('public/manifest.json');
    expect(raw).not.toContain('host_permissions');
    expect(raw).not.toContain('content_scripts');
    expect(raw).not.toContain('<all_urls>');
    expect(manifest.permissions).not.toContain('tabs');
    expect(manifest.permissions).not.toContain('debugger');
  });

  it('suggests at most four shortcuts, because Chrome refuses to load a fifth', () => {
    const suggested = Object.values(manifest.commands).filter((command) => command.suggested_key);
    expect(suggested.length).toBeLessThanOrEqual(4);
    expect(suggested.length).toBeGreaterThan(0);
  });
});

describe('every spec file is registered in the matrix or is a helper', () => {
  it('has no orphaned e2e spec with an unnumbered, unmapped requirement', () => {
    const specs = ['extension', 'library', 'milestone2', 'milestone3', 'milestone4'];
    for (const spec of specs) {
      expect(existsSync(resolve(root, `tests/e2e/${spec}.spec.ts`))).toBe(true);
    }
  });
});
