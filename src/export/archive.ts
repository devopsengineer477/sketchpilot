import {
  APP_VERSION,
  SCHEMA_VERSION,
  findStructuralProblems,
  libraryArchiveSchema,
  type DrawingDocument,
  type LibraryArchive,
} from '../storage/schemas';
import { appError, err, ok, type Result } from '../lib/errors';
import { newDrawingId } from '../storage/documents';
import { repository } from '../storage/repository';
import { MAX_IMPORT_BYTES } from './io';

/** Whole-library export/import: one file for "back up everything". */

export async function buildLibraryArchive(): Promise<Result<string>> {
  const result = await repository.exportAll();
  if (!result.ok) return err(result.error);

  const archive: LibraryArchive = {
    type: 'sketchpilot-library',
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: Date.now(),
    drawings: result.value.drawings,
    templates: result.value.templates,
  };
  return ok(JSON.stringify(archive, null, 2));
}

export function parseLibraryArchive(raw: string): Result<LibraryArchive> {
  if (raw.length > MAX_IMPORT_BYTES * 4) {
    return err(
      appError('invalid-import', 'That archive is too large to import.', 'Import drawings individually instead.'),
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err(appError('invalid-import', 'That archive is not valid JSON.', 'Pick a SketchPilot library export.'));
  }

  const validated = libraryArchiveSchema.safeParse(parsed);
  if (!validated.success) {
    return err(
      appError(
        'invalid-import',
        'That file is not a SketchPilot library archive.',
        'Use "Export library" in the dashboard to create one.',
      ),
    );
  }

  if (validated.data.schemaVersion > SCHEMA_VERSION) {
    return err(
      appError(
        'unsupported-version',
        `This archive was written by a newer version of SketchPilot (schema v${validated.data.schemaVersion}).`,
        'Update the extension, then import it again.',
      ),
    );
  }

  for (const drawing of validated.data.drawings) {
    const structural = findStructuralProblems(drawing.elements);
    if (structural.length) {
      return err(
        appError(
          'invalid-import',
          `The archive contains an invalid drawing (“${drawing.title}”).`,
          'Nothing was imported. Check the file or export a fresh copy.',
        ),
      );
    }
  }

  return ok(validated.data);
}

/**
 * Imports an archive without ever overwriting existing work: every drawing gets a
 * fresh id, so importing the same archive twice creates copies instead of clobbering.
 */
export async function importLibraryArchive(archive: LibraryArchive): Promise<Result<{ drawings: number; templates: number }>> {
  const now = Date.now();
  const drawings: DrawingDocument[] = archive.drawings.map((drawing) => ({
    ...drawing,
    id: newDrawingId(),
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: drawing.createdAt || now,
    updatedAt: drawing.updatedAt || now,
  }));

  const imported = await repository.importMany(drawings);
  if (!imported.ok) return err(imported.error);

  let templates = 0;
  for (const template of archive.templates) {
    const saved = await repository.saveTemplate({
      ...template,
      id: newDrawingId(),
      source: 'user',
      updatedAt: Date.now(),
    });
    if (saved.ok) templates += 1;
  }

  return ok({ drawings: imported.value, templates });
}
