import {
  APP_VERSION,
  SCHEMA_VERSION,
  excalidrawFileSchema,
  exportEnvelopeSchema,
  findStructuralProblems,
  validateDrawing,
  type DrawingDocument,
  type ValidationIssue,
} from '../storage/schemas';
import { appError, err, ok, type Result } from '../lib/errors';
import { newDrawingId } from '../storage/documents';

export const MAX_IMPORT_BYTES = 12 * 1024 * 1024;

export function serializeDrawing(document: DrawingDocument): string {
  const payload = {
    type: 'sketchpilot' as const,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: Date.now(),
    drawing: { ...document, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION },
  };
  return JSON.stringify(payload, null, 2);
}

export function suggestedFileName(title: string, extension: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'sketchpilot-drawing'}.${extension}`;
}

function invalid(message: string, issues: ValidationIssue[] = []): Result<never> {
  const detail = issues.length
    ? issues.slice(0, 3).map((issue) => `${issue.path}: ${issue.message}`).join('; ')
    : '';
  return err(
    appError(
      'invalid-import',
      detail ? `${message} (${detail})` : message,
      'Only SketchPilot JSON exports and .excalidraw files can be imported.',
    ),
  );
}

/**
 * Parses untrusted JSON into a DrawingDocument.
 * Rejects atomically — a partially valid file never becomes a drawing.
 */
export function parseImportedDrawing(raw: string, fileName = 'imported.json'): Result<DrawingDocument> {
  if (raw.length > MAX_IMPORT_BYTES) {
    return invalid('That file is too large to import (limit 12 MB).');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalid('That file is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    return invalid('That file does not contain a drawing.');
  }

  const record = parsed as Record<string, unknown>;

  // 1. Our own export envelope.
  if (record.type === 'sketchpilot') {
    const envelope = exportEnvelopeSchema.safeParse(record);
    if (!envelope.success) {
      return invalid('This SketchPilot file is malformed.', envelope.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })));
    }
    if (envelope.data.schemaVersion > SCHEMA_VERSION) {
      return err(
        appError(
          'unsupported-version',
          `This drawing was saved by a newer version of SketchPilot (schema v${envelope.data.schemaVersion}).`,
          'Update the extension, then import the file again.',
        ),
      );
    }
    const drawing = envelope.data.drawing;
    const structural = findStructuralProblems(drawing.elements);
    if (structural.length) return invalid('This drawing contains invalid elements.', structural);
    return ok({ ...drawing, id: newDrawingId(), appVersion: APP_VERSION } as DrawingDocument);
  }

  // 2. A raw Excalidraw file (read-only compatibility with the ecosystem).
  if (record.type === 'excalidraw') {
    const parsedFile = excalidrawFileSchema.safeParse(record);
    if (!parsedFile.success) {
      return invalid('This .excalidraw file is malformed.', parsedFile.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })));
    }
    const structural = findStructuralProblems(parsedFile.data.elements);
    if (structural.length) return invalid('This drawing contains invalid elements.', structural);
    const now = Date.now();
    return ok({
      id: newDrawingId(),
      schemaVersion: SCHEMA_VERSION,
      title: fileName.replace(/\.excalidraw$/i, '') || 'Imported drawing',
      createdAt: now,
      updatedAt: now,
      appVersion: APP_VERSION,
      elements: parsedFile.data.elements,
      appState: parsedFile.data.appState ?? {},
      files: parsedFile.data.files ?? {},
    } as DrawingDocument);
  }

  // 3. A bare document (e.g. an older export without the envelope).
  if (Array.isArray(record.elements)) {
    const validated = validateDrawing({ ...record, id: newDrawingId() });
    if (!validated.ok) return invalid('That file is not a valid drawing.', validated.issues);
    const structural = findStructuralProblems(validated.value.elements);
    if (structural.length) return invalid('This drawing contains invalid elements.', structural);
    return ok(validated.value);
  }

  return invalid('That file does not look like a SketchPilot drawing.');
}

export async function readFileAsText(file: File): Promise<Result<string>> {
  try {
    if (file.size > MAX_IMPORT_BYTES) {
      return err(
        appError('invalid-import', 'That file is too large to import (limit 12 MB).', 'Try exporting a smaller drawing.'),
      );
    }
    return ok(await file.text());
  } catch {
    return err(appError('invalid-import', 'That file could not be read.', 'Check the file and try again.'));
  }
}

/** Strips script-capable constructs from an SVG string before it leaves (or enters) the app. */
export function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s(href|xlink:href)\s*=\s*"javascript:[^"]*"/gi, '')
    .replace(/\s(href|xlink:href)\s*=\s*"data:text\/html[^"]*"/gi, '');
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadText(text: string, fileName: string, mime = 'application/json'): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), fileName);
}
