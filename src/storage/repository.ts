import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  DrawingDocument,
  DrawingMetadata,
  DrawingThumbnail,
  Template,
} from './schemas';
import {
  appError,
  err,
  ok,
  toStorageError,
  type Result,
} from '../lib/errors';

/**
 * Persistence abstraction. The UI and the autosave controller depend on this
 * interface only, so the implementation can be swapped (IndexedDB → backend later)
 * and tested with fake-indexeddb without touching component code.
 */

export type SortKey = 'modified' | 'created' | 'name';
export type DrawingListItem = DrawingMetadata;

export interface DrawingRepository {
  list(options?: { favoritesOnly?: boolean; query?: string; sortBy?: SortKey }): Promise<Result<DrawingListItem[]>>;
  get(id: string): Promise<Result<DrawingDocument>>;
  save(document: DrawingDocument): Promise<Result<DrawingMetadata>>;
  remove(id: string): Promise<Result<void>>;
  setFavorite(id: string, favorite: boolean): Promise<Result<DrawingMetadata>>;
  count(): Promise<number>;
  getDraft(id: string): Promise<DrawingDocument | null>;
  saveDraft(document: DrawingDocument): Promise<void>;
  clearDraft(id: string): Promise<void>;
  getThumbnail(drawingId: string): Promise<DrawingThumbnail | null>;
  saveThumbnail(thumbnail: DrawingThumbnail): Promise<void>;
  /** Every drawing, for whole-library export. */
  exportAll(): Promise<Result<{ drawings: DrawingDocument[]; templates: Template[] }>>;
  listTemplates(): Promise<Result<Template[]>>;
  saveTemplate(template: Template): Promise<Result<Template>>;
  removeTemplate(id: string): Promise<Result<void>>;
  /** Adds drawings without overwriting existing ids. Returns how many were added. */
  importMany(drawings: DrawingDocument[]): Promise<Result<number>>;
  clearAll(): Promise<Result<void>>;
}

interface SketchPilotDB extends DBSchema {
  drawings: { key: string; value: DrawingDocument };
  meta: {
    key: string;
    value: DrawingMetadata;
    indexes: { 'by-updatedAt': number; 'by-title': string };
  };
  drafts: { key: string; value: DrawingDocument };
  thumbnails: { key: string; value: DrawingThumbnail };
  templates: { key: string; value: Template; indexes: { 'by-name': string } };
}

const DB_NAME = 'sketchpilot';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<SketchPilotDB>> | null = null;

export function openSketchPilotDb(): Promise<IDBPDatabase<SketchPilotDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SketchPilotDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('drawings')) {
          db.createObjectStore('drawings', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          const meta = db.createObjectStore('meta', { keyPath: 'id' });
          meta.createIndex('by-updatedAt', 'updatedAt');
          meta.createIndex('by-title', 'title');
        }
        if (!db.objectStoreNames.contains('drafts')) {
          db.createObjectStore('drafts', { keyPath: 'id' });
        }
        // v2 — thumbnails let the library show previews without loading full documents;
        // templates store user-authored starting points. Existing drawings are untouched.
        if (!db.objectStoreNames.contains('thumbnails')) {
          db.createObjectStore('thumbnails', { keyPath: 'drawingId' });
        }
        if (!db.objectStoreNames.contains('templates')) {
          const templates = db.createObjectStore('templates', { keyPath: 'id' });
          templates.createIndex('by-name', 'name');
        }
      },
      blocked() {
        // Another tab holds an old version open; surface via the failing call instead of hanging.
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/** Test hook: isolate each test with a fresh connection. */
export function resetRepositoryConnection(): void {
  dbPromise = null;
}

function toMetadata(document: DrawingDocument, favorite: boolean): DrawingMetadata {
  return {
    id: document.id,
    title: document.title,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    elementCount: document.elements.length,
    favorite,
    hasThumbnail: false,
  };
}

function sortItems(items: DrawingListItem[], sortBy: SortKey): DrawingListItem[] {
  const copy = [...items];
  copy.sort((a, b) => {
    if (sortBy === 'name') return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    if (sortBy === 'created') return b.createdAt - a.createdAt;
    return b.updatedAt - a.updatedAt;
  });
  return copy;
}

export function createRepository(connect: () => Promise<IDBPDatabase<SketchPilotDB>> = openSketchPilotDb): DrawingRepository {
  return {
    async list(options = {}) {
      const { favoritesOnly = false, query = '', sortBy = 'modified' } = options;
      try {
        const db = await connect();
        let items = await db.getAll('meta');
        if (favoritesOnly) items = items.filter((item) => item.favorite);
        const needle = query.trim().toLowerCase();
        if (needle) items = items.filter((item) => item.title.toLowerCase().includes(needle));
        return ok(sortItems(items, sortBy));
      } catch (error) {
        return err(toStorageError(error));
      }
    },

    async get(id) {
      try {
        const db = await connect();
        const document = await db.get('drawings', id);
        if (!document) {
          return err(
            appError(
              'drawing-not-found',
              'That drawing is no longer in local storage.',
              'It may have been deleted. Open the dashboard to pick another drawing.',
            ),
          );
        }
        return ok(document);
      } catch (error) {
        return err(toStorageError(error));
      }
    },

    async save(document) {
      try {
        const db = await connect();
        const existing = await db.get('meta', document.id);
        const thumbnail = await db.get('thumbnails', document.id);
        const metadata = { ...toMetadata(document, existing?.favorite ?? false), hasThumbnail: !!thumbnail };
        const tx = db.transaction(['drawings', 'meta'], 'readwrite');
        await tx.objectStore('drawings').put(document);
        await tx.objectStore('meta').put(metadata);
        await tx.done;
        return ok(metadata);
      } catch (error) {
        return err(toStorageError(error));
      }
    },

    async remove(id) {
      try {
        const db = await connect();
        const tx = db.transaction(['drawings', 'meta', 'drafts', 'thumbnails'], 'readwrite');
        await tx.objectStore('drawings').delete(id);
        await tx.objectStore('meta').delete(id);
        await tx.objectStore('drafts').delete(id);
        await tx.objectStore('thumbnails').delete(id);
        await tx.done;
        return ok(undefined);
      } catch (error) {
        return err(toStorageError(error));
      }
    },

    async setFavorite(id, favorite) {
      try {
        const db = await connect();
        const metadata = await db.get('meta', id);
        if (!metadata) {
          return err(appError('drawing-not-found', 'That drawing no longer exists.', 'Refresh the dashboard.'));
        }
        const next = { ...metadata, favorite };
        await db.put('meta', next);
        return ok(next);
      } catch (error) {
        return err(toStorageError(error));
      }
    },

    async count() {
      try {
        const db = await connect();
        return await db.count('meta');
      } catch {
        return 0;
      }
    },

    async getDraft(id) {
      try {
        const db = await connect();
        return (await db.get('drafts', id)) ?? null;
      } catch {
        return null;
      }
    },

    async saveDraft(document) {
      try {
        const db = await connect();
        await db.put('drafts', document);
      } catch {
        // Drafts are best-effort: a failure here must never interrupt editing.
      }
    },

    async clearDraft(id) {
      try {
        const db = await connect();
        await db.delete('drafts', id);
      } catch {
        // ignore
      }
    },

    async getThumbnail(drawingId) {
      try {
        const db = await connect();
        return (await db.get('thumbnails', drawingId)) ?? null;
      } catch {
        // A missing preview is cosmetic: never let it break the library view.
        return null;
      }
    },

    async saveThumbnail(thumbnail) {
      try {
        const db = await connect();
        await db.put('thumbnails', thumbnail);
        const metadata = await db.get('meta', thumbnail.drawingId);
        if (metadata) await db.put('meta', { ...metadata, hasThumbnail: true });
      } catch {
        // Previews are best-effort.
      }
    },

    async exportAll() {
      try {
        const db = await connect();
        const [drawings, templates] = await Promise.all([db.getAll('drawings'), db.getAll('templates')]);
        return ok({ drawings, templates });
      } catch (error) {
        return err(toStorageError(error));
      }
    },

    async listTemplates() {
      try {
        const db = await connect();
        const templates = await db.getAll('templates');
        return ok(templates.sort((a, b) => a.name.localeCompare(b.name)));
      } catch (error) {
        return err(toStorageError(error));
      }
    },

    async saveTemplate(template) {
      try {
        const db = await connect();
        await db.put('templates', template);
        return ok(template);
      } catch (error) {
        return err(toStorageError(error));
      }
    },

    async removeTemplate(id) {
      try {
        const db = await connect();
        await db.delete('templates', id);
        return ok(undefined);
      } catch (error) {
        return err(toStorageError(error));
      }
    },

    async importMany(drawings) {
      try {
        const db = await connect();
        const tx = db.transaction(['drawings', 'meta'], 'readwrite');
        let added = 0;
        for (const drawing of drawings) {
          const existing = await tx.objectStore('drawings').get(drawing.id);
          if (existing) continue;
          await tx.objectStore('drawings').put(drawing);
          await tx.objectStore('meta').put(toMetadata(drawing, false));
          added += 1;
        }
        await tx.done;
        return ok(added);
      } catch (error) {
        return err(toStorageError(error));
      }
    },

    async clearAll() {
      try {
        const db = await connect();
        const tx = db.transaction(['drawings', 'meta', 'drafts', 'thumbnails', 'templates'], 'readwrite');
        await Promise.all([
          tx.objectStore('drawings').clear(),
          tx.objectStore('meta').clear(),
          tx.objectStore('drafts').clear(),
          tx.objectStore('thumbnails').clear(),
          // User templates are user data too; built-ins live in code and come back on reload.
          tx.objectStore('templates').clear(),
          tx.done,
        ]);
        return ok(undefined);
      } catch (error) {
        return err(toStorageError(error));
      }
    },
  };
}

export const repository = createRepository();
