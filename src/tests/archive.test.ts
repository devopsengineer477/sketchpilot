import { beforeEach, describe, expect, it } from 'vitest';
import { buildLibraryArchive, importLibraryArchive, parseLibraryArchive } from '../export/archive';
import { createRepository, resetRepositoryConnection } from '../storage/repository';
import { createDrawing } from '../storage/documents';

const rectangle = { id: 'r1', type: 'rectangle' as const, x: 0, y: 0, width: 100, height: 50 };

describe('library archive', () => {
  beforeEach(async () => {
    resetRepositoryConnection();
    await createRepository().clearAll();
  });

  it('round-trips drawings through export and import', async () => {
    const repository = createRepository();
    await repository.save(createDrawing({ title: 'First', elements: [rectangle] }));
    await repository.save(createDrawing({ title: 'Second', elements: [rectangle] }));

    const archiveJson = await buildLibraryArchive();
    expect(archiveJson.ok).toBe(true);
    if (!archiveJson.ok) return;

    const parsed = parseLibraryArchive(archiveJson.value);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.drawings).toHaveLength(2);

    await repository.clearAll();
    const imported = await importLibraryArchive(parsed.value);
    expect(imported.ok).toBe(true);
    if (imported.ok) expect(imported.value.drawings).toBe(2);

    const list = await repository.list();
    expect(list.ok && list.value).toHaveLength(2);
  });

  it('never overwrites: importing the same archive twice creates copies', async () => {
    const repository = createRepository();
    await repository.save(createDrawing({ title: 'Original' }));
    const json = await buildLibraryArchive();
    if (!json.ok) throw new Error('archive failed');
    const parsed = parseLibraryArchive(json.value);
    if (!parsed.ok) throw new Error('parse failed');

    await importLibraryArchive(parsed.value);
    await importLibraryArchive(parsed.value);

    const list = await repository.list();
    expect(list.ok && list.value).toHaveLength(3);
  });

  it('rejects a file that is not an archive', () => {
    const result = parseLibraryArchive('{"type":"sketchpilot","drawing":{}}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid-import');
      expect(result.error.hint).toContain('Export library');
    }
  });

  it('rejects an archive written by a newer schema', async () => {
    const repository = createRepository();
    await repository.save(createDrawing({ title: 'Future' }));
    const json = await buildLibraryArchive();
    if (!json.ok) throw new Error('archive failed');
    const payload = JSON.parse(json.value);
    payload.schemaVersion = 99;

    const result = parseLibraryArchive(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unsupported-version');
  });

  it('rejects an archive containing a corrupt drawing, importing nothing', async () => {
    const repository = createRepository();
    await repository.save(createDrawing({ title: 'Good' }));
    const json = await buildLibraryArchive();
    if (!json.ok) throw new Error('archive failed');
    const payload = JSON.parse(json.value);
    payload.drawings.push({ ...payload.drawings[0], id: 'not-a-uuid' });

    const parsed = parseLibraryArchive(JSON.stringify(payload));
    expect(parsed.ok).toBe(false);
    expect(await repository.count()).toBe(1);
  });
});
