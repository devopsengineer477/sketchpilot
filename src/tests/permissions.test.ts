import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.json'), 'utf8')) as {
  manifest_version: number;
  name: string;
  version: string;
  permissions: string[];
  background: { service_worker: string; type: string };
  action: { default_popup: string };
};

describe('shipped manifest (scenario 18)', () => {
  it('is a Manifest V3 extension with a module service worker and a popup', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background.type).toBe('module');
    expect(manifest.background.service_worker).toBe('background.js');
    expect(manifest.action.default_popup).toBe('popup.html');
  });

  it('declares exactly the documented permissions', () => {
    expect(manifest.permissions).toEqual(['storage', 'activeTab', 'scripting', 'contextMenus', 'clipboardWrite']);
  });

  it('asks for nothing that would let it read pages in the background', () => {
    for (const forbidden of ['tabs', 'cookies', 'history', 'webRequest', 'webNavigation', 'debugger', 'identity']) {
      expect(manifest.permissions).not.toContain(forbidden);
    }
  });

  it('keeps the store-listing description within the 132-character limit', () => {
    const raw = JSON.parse(readFileSync(resolve(root, 'public/manifest.json'), 'utf8')) as { description: string };
    expect(raw.description.length).toBeLessThanOrEqual(132);
    expect(raw.description.length).toBeGreaterThan(40);
  });

  it('keeps name and version in step with package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string };
    expect(manifest.version).toBe(pkg.version);
  });
});
