import { z } from 'zod';

/**
 * Single source of truth for every persisted shape.
 * Anything that is validated on the way in (import, restore, future AI output)
 * goes through these schemas — there is no second, hand-written type.
 */

export const APP_NAME = 'SketchPilot AI';
export const APP_VERSION = '1.3.1';
export const SCHEMA_VERSION = 2;

/** Element ids are attacker-controllable via imported files, so bound them. */
const idSchema = z.string().min(1).max(64);

const finiteNumber = z.number().finite();
const boundedCoord = finiteNumber.min(-100_000).max(100_000);

export const ELEMENT_TYPES = [
  'rectangle',
  'ellipse',
  'diamond',
  'arrow',
  'line',
  'freedraw',
  'text',
  'image',
  'frame',
  'embeddable',
  'magicframe',
] as const;

/**
 * We intentionally do not re-implement Excalidraw's element schema. We validate the
 * invariants that can corrupt the document (identity, type, geometry) and let the
 * engine own the rest. Unknown keys are preserved so a drawing saved by a newer
 * engine version is not silently degraded.
 */
export const drawingElementSchema = z
  .object({
    id: idSchema,
    type: z.enum(ELEMENT_TYPES),
    x: boundedCoord,
    y: boundedCoord,
    width: z.number().finite().min(0).max(100_000),
    height: z.number().finite().min(0).max(100_000),
  })
  .passthrough();

export type DrawingElement = z.infer<typeof drawingElementSchema>;

/** The slice of Excalidraw appState we persist across sessions. */
export const persistedAppStateSchema = z
  .object({
    viewBackgroundColor: z.string().max(32).optional(),
    gridSize: z.number().finite().nullable().optional(),
    currentItemStrokeColor: z.string().max(32).optional(),
    currentItemBackgroundColor: z.string().max(32).optional(),
    currentItemStrokeWidth: z.number().finite().optional(),
    currentItemFontSize: z.number().finite().optional(),
    currentItemFontFamily: z.union([z.number(), z.string()]).optional(),
    currentItemOpacity: z.number().finite().min(0).max(100).optional(),
    theme: z.enum(['light', 'dark']).optional(),
  })
  .passthrough();

export type PersistedAppState = z.infer<typeof persistedAppStateSchema>;

export const drawingFilesSchema = z.record(z.string().max(64), z.unknown());

export const drawingDocumentSchema = z.object({
  id: z.uuid(),
  schemaVersion: z.number().int().positive(),
  title: z.string().min(1).max(200),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  appVersion: z.string().max(32),
  elements: z.array(drawingElementSchema).max(20_000),
  appState: persistedAppStateSchema.default({}),
  files: drawingFilesSchema.default({}),
});

export type DrawingDocument = z.infer<typeof drawingDocumentSchema>;

export const drawingMetadataSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(200),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  elementCount: z.number().int().nonnegative(),
  favorite: z.boolean(),
  hasThumbnail: z.boolean(),
});

export type DrawingMetadata = z.infer<typeof drawingMetadataSchema>;

/** Cached render of a drawing for library cards. */
export const thumbnailSchema = z.object({
  drawingId: z.uuid(),
  /** `data:image/png;base64,...` — never an external URL. */
  dataUrl: z.string().startsWith('data:image/png;base64,').max(400_000),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  updatedAt: z.number().int().nonnegative(),
});

export type DrawingThumbnail = z.infer<typeof thumbnailSchema>;

export const TEMPLATE_CATEGORIES = [
  'engineering',
  'planning',
  'learning',
  'custom',
] as const;

export const templateSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(80),
  description: z.string().max(240),
  category: z.enum(TEMPLATE_CATEGORIES),
  /** Built-in templates ship with the extension and are read-only. */
  source: z.enum(['builtin', 'user']),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  elements: z.array(drawingElementSchema).max(5_000),
  appState: persistedAppStateSchema.default({}),
});

export type Template = z.infer<typeof templateSchema>;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/** One file that carries the whole library, so "export everything" is a single action. */
export const libraryArchiveSchema = z.object({
  type: z.literal('sketchpilot-library'),
  schemaVersion: z.number().int().positive(),
  appVersion: z.string().max(32),
  exportedAt: z.number().int().nonnegative(),
  drawings: z.array(drawingDocumentSchema).max(5_000),
  templates: z.array(templateSchema).max(500).default([]),
});

export type LibraryArchive = z.infer<typeof libraryArchiveSchema>;

export const storageStatusSchema = z.object({
  available: z.boolean(),
  usageBytes: z.number().nonnegative(),
  quotaBytes: z.number().nonnegative(),
  drawingCount: z.number().int().nonnegative(),
  message: z.string().optional(),
});

export type StorageStatus = z.infer<typeof storageStatusSchema>;

export const themePreferenceSchema = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const userSettingsSchema = z.object({
  theme: themePreferenceSchema.default('system'),
  lastOpenedDrawingId: z.uuid().nullable().default(null),
  aiEnabled: z.boolean().default(false),
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

/** Envelope written by our JSON export. Bump `schemaVersion` with any breaking change. */
export const exportEnvelopeSchema = z.object({
  type: z.literal('sketchpilot'),
  schemaVersion: z.number().int().positive(),
  appVersion: z.string().max(32),
  exportedAt: z.number().int().nonnegative(),
  drawing: drawingDocumentSchema.omit({ schemaVersion: true }).extend({
    schemaVersion: z.number().int().positive(),
  }),
});

export type ExportEnvelope = z.infer<typeof exportEnvelopeSchema>;

/** Raw Excalidraw `.excalidraw` files are also importable (read-only compatibility). */
export const excalidrawFileSchema = z
  .object({
    type: z.literal('excalidraw'),
    version: z.number().int().positive(),
    elements: z.array(drawingElementSchema).max(20_000),
    appState: persistedAppStateSchema.optional(),
    files: drawingFilesSchema.optional(),
  })
  .passthrough();

export type ValidationIssue = { path: string; message: string };

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

function toIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.slice(0, 12).map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

export function validateDrawing(input: unknown): ValidationResult<DrawingDocument> {
  const parsed = drawingDocumentSchema.safeParse(input);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, issues: toIssues(parsed.error) };
}

/**
 * Detects duplicate element ids and non-finite geometry that zod's per-field checks
 * cannot see. Runs on every import and (later) every AI payload before write.
 */
export function findStructuralProblems(elements: readonly DrawingElement[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  elements.forEach((element, index) => {
    if (seen.has(element.id)) {
      issues.push({ path: `elements.${index}.id`, message: `duplicate element id "${element.id}"` });
    }
    seen.add(element.id);
    if (![element.x, element.y, element.width, element.height].every(Number.isFinite)) {
      issues.push({ path: `elements.${index}`, message: 'element has non-finite geometry' });
    }
  });
  return issues;
}
