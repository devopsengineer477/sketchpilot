import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guards for the install path itself.
 *
 * A fresh `npm install` failing with ERESOLVE is the least useful bug a contributor can hit:
 * the product is fine, the dependency graph is not. These assertions keep the two known
 * causes from coming back.
 */

const root = resolve(__dirname, '../..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  devDependencies: Record<string, string>;
};
const major = (range: string) => Number(range.replace(/^[^\d]*/, '').split('.')[0]);

describe('toolchain installability', () => {
  it('keeps @eslint/js on the same major as eslint', () => {
    // `@eslint/js` declares a peer of `eslint@^<its own major>`; a mismatch makes every
    // install fail with ERESOLVE (this happened with @eslint/js@10 next to eslint@9).
    expect(pkg.devDependencies['@eslint/js']).toBeDefined();
    expect(pkg.devDependencies['eslint']).toBeDefined();
    expect(major(pkg.devDependencies['@eslint/js']!)).toBe(major(pkg.devDependencies['eslint']!));
  });

  it('keeps the coverage provider on the same major as vitest', () => {
    expect(major(pkg.devDependencies['@vitest/coverage-v8']!)).toBe(major(pkg.devDependencies['vitest']!));
  });

  it('commits an .npmrc so a plain install resolves without flags', () => {
    const npmrc = readFileSync(resolve(root, '.npmrc'), 'utf8');
    expect(npmrc).toMatch(/^\s*legacy-peer-deps\s*=\s*true\s*$/m);
  });

  it('keeps every npm script runnable by cmd.exe and PowerShell, not just bash', () => {
    // A `VAR=value command` prefix (`NODE_OPTIONS=… vite build`, `UPDATE_DOCS=1 vitest`) is
    // POSIX-only: on Windows it fails with "'NODE_OPTIONS' is not recognized as an internal or
    // external command". Environment variables must come from code, not from the shell.
    const scripts = (JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    }).scripts;
    const posixOnly = Object.entries(scripts).filter(([, command]) =>
      /(^|&&|\|\||;)\s*[A-Za-z_][A-Za-z0-9_]*=\S+\s+\S/.test(command),
    );
    expect(posixOnly, 'inline env assignment is not portable').toEqual([]);
  });

  it('pins the React major that the canvas engine supports (ADR-002)', () => {
    expect(major(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).dependencies.react)).toBe(18);
  });
});
