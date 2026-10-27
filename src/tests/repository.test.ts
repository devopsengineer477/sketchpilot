import { beforeEach, describe, expect, it } from 'vitest';
import { createRepository, resetRepositoryConnection } from '../storage/repository';
import { createDrawing } from '../storage/documents';
import { SCHEMA_VERSION } from '../storage/schemas';

describe('drawing repository', () => {
  beforeEach(async () => {
    resetRepositoryConnection();
    const repository = createRepository();
    await repository.clearAll();
  });

  it('saves and reopens a drawing without losing element data', async () => {
    const repository = createRepository();
    const drawing = createDrawing({ title: 'Architecture', elements: [] });
    const saved = await repository.save(drawing);
    expect(saved.ok).toBe(true);

    const reopened = await repository.get(drawing.id);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) {
      expect(reopened.value.title).toBe('Architecture');
      expect(reopened.value.schemaVersion).toBe(SCHEMA_VERSION);
      expect(reopened.value.appVersion).toBeTruthy();
    }
  });

  it('keeps drawings separate', async () => {
    const repository = createRepository();
    const a = createDrawing({ title: 'A' });
    const b = createDrawing({ title: 'B' });
    await repository.save(a);
    await repository.save(b);

    const list = await repository.list({ sortBy: 'name' });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.value.map((item) => item.title)).toEqual(['A', 'B']);
  });

  it('reports a missing drawing as an actionable error, not a crash', async () => {
    const repository = createRepository();
    const missing = await repository.get('11111111-1111-4111-8111-111111111111');
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.code).toBe('drawing-not-found');
      expect(missing.error.hint).toBeTruthy();
    }
  });

  it('supports search, sort and favourites', async () => {
    const repository = createRepository();
    const flow = createDrawing({ title: 'Flow chart' });
    const mind = createDrawing({ title: 'Mind map' });
    await repository.save(flow);
    await repository.save(mind);
    await repository.setFavorite(mind.id, true);

    const searched = await repository.list({ query: 'mind' });
    expect(searched.ok && searched.value.map((item) => item.title)).toEqual(['Mind map']);

    const favorites = await repository.list({ favoritesOnly: true });
    expect(favorites.ok && favorites.value.map((item) => item.title)).toEqual(['Mind map']);

    const sorted = await repository.list({ sortBy: 'name' });
    expect(sorted.ok && sorted.value.map((item) => item.title)).toEqual(['Flow chart', 'Mind map']);
  });

  it('removes a drawing and its draft together', async () => {
    const repository = createRepository();
    const drawing = createDrawing();
    await repository.save(drawing);
    await repository.saveDraft({ ...drawing, title: 'draft' });

    const removed = await repository.remove(drawing.id);
    expect(removed.ok).toBe(true);
    expect(await repository.getDraft(drawing.id)).toBeNull();
    expect(await repository.count()).toBe(0);
  });

  it('stores recovery drafts separately from saved documents', async () => {
    const repository = createRepository();
    const drawing = createDrawing({ title: 'Saved' });
    await repository.save(drawing);
    await repository.saveDraft({ ...drawing, title: 'Unsaved', updatedAt: Date.now() + 1000 });

    const saved = await repository.get(drawing.id);
    const draft = await repository.getDraft(drawing.id);
    expect(saved.ok && saved.value.title).toBe('Saved');
    expect(draft?.title).toBe('Unsaved');

    await repository.clearDraft(drawing.id);
    expect(await repository.getDraft(drawing.id)).toBeNull();
  });
});
