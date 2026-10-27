import { APP_VERSION, SCHEMA_VERSION, type DrawingDocument } from './schemas';

export const UNTITLED = 'Untitled drawing';

export function newDrawingId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Deterministic-enough fallback for environments without randomUUID (older jsdom).
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

export function createDrawing(overrides: Partial<DrawingDocument> = {}): DrawingDocument {
  const now = Date.now();
  return {
    id: newDrawingId(),
    schemaVersion: SCHEMA_VERSION,
    title: UNTITLED,
    createdAt: now,
    updatedAt: now,
    appVersion: APP_VERSION,
    elements: [],
    appState: {},
    files: {},
    ...overrides,
  };
}

export function titleFromImport(previous: string | undefined, fallback: string): string {
  const trimmed = previous?.trim();
  return trimmed ? trimmed.slice(0, 200) : fallback;
}

/** Snapshot for autosave. Keeps the document immutable for the history/undo layer. */
export function withTimestamp(document: DrawingDocument, now = Date.now()): DrawingDocument {
  return { ...document, updatedAt: now, appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION };
}
