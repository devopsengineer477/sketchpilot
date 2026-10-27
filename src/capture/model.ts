import { z } from 'zod';

/**
 * The capture contract.
 *
 * A capture is *not* a drawing. It is a short-lived record that travels from the page
 * (popup, context menu or keyboard command) to the editor, where the user decides what
 * happens to it. Nothing from a page reaches a document, or storage on disk, until that
 * decision (spec §7, plan P4-T5).
 */

export const SOURCE_KEY = 'sketchpilotSource';

export const CAPTURE_LIMITS = {
  /** Roughly 8 MB of base64 — a full 4K screenshot still fits, nothing abusive does. */
  maxDataUrlLength: 8_000_000,
  maxSelectionLength: 20_000,
  /** How much of a selection we put inside a sticky note before truncating. */
  noteTextLength: 1200,
  maxExcerptLength: 280,
  maxTitleLength: 300,
} as const;

export const sourceReferenceSchema = z.object({
  url: z.string().max(2048),
  title: z.string().max(CAPTURE_LIMITS.maxTitleLength),
  capturedAt: z.number().int().nonnegative(),
  excerpt: z.string().max(CAPTURE_LIMITS.maxExcerptLength).optional(),
  favicon: z.string().max(2048).optional(),
});

export type SourceReference = z.infer<typeof sourceReferenceSchema>;

const baseCapture = {
  id: z.string().min(1).max(64),
  pageUrl: z.string().max(2048),
  pageTitle: z.string().max(CAPTURE_LIMITS.maxTitleLength),
  capturedAt: z.number().int().nonnegative(),
};

export const capturedImageSchema = z.object({
  ...baseCapture,
  kind: z.literal('image'),
  /** Only image data URLs: a `javascript:` or `data:text/html` payload is rejected here. */
  dataUrl: z
    .string()
    .max(CAPTURE_LIMITS.maxDataUrlLength)
    .refine((value) => /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(value), {
      message: 'expected a base64 image data URL',
    }),
  width: z.number().int().positive().max(20_000),
  height: z.number().int().positive().max(20_000),
});

export const capturedSelectionSchema = z.object({
  ...baseCapture,
  kind: z.literal('selection'),
  text: z.string().min(1).max(CAPTURE_LIMITS.maxSelectionLength),
  /** Where the capture came from, so the editor can preselect the right action. */
  intent: z.enum(['note', 'mindmap']).optional(),
  origin: z.enum(['popup', 'menu', 'command']).optional(),
});

export const pendingCaptureSchema = z.discriminatedUnion('kind', [
  capturedImageSchema,
  capturedSelectionSchema,
]);

export type CapturedImage = z.infer<typeof capturedImageSchema>;
export type CapturedSelection = z.infer<typeof capturedSelectionSchema>;
export type PendingCapture = z.infer<typeof pendingCaptureSchema>;

export function newCaptureId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `cap-${Date.now().toString(36)}-${random}`;
}

export function createImageCapture(input: {
  dataUrl: string;
  width: number;
  height: number;
  pageUrl: string;
  pageTitle: string;
}): CapturedImage {
  return {
    id: newCaptureId(),
    kind: 'image',
    dataUrl: input.dataUrl,
    width: input.width,
    height: input.height,
    pageUrl: input.pageUrl,
    pageTitle: input.pageTitle || hostOf(input.pageUrl),
    capturedAt: Date.now(),
  };
}

export function createSelectionCapture(input: {
  text: string;
  pageUrl: string;
  pageTitle: string;
  intent?: CapturedSelection['intent'];
  origin?: CapturedSelection['origin'];
}): CapturedSelection {
  return {
    id: newCaptureId(),
    kind: 'selection',
    text: normaliseSelectionText(input.text),
    pageUrl: input.pageUrl,
    pageTitle: input.pageTitle || hostOf(input.pageUrl),
    capturedAt: Date.now(),
    ...(input.intent ? { intent: input.intent } : {}),
    ...(input.origin ? { origin: input.origin } : {}),
  };
}

/** Collapses page whitespace so a note does not inherit the source markup's newlines. */
export function normaliseSelectionText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, CAPTURE_LIMITS.maxSelectionLength);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

export function excerptOf(text: string, max: number = CAPTURE_LIMITS.maxExcerptLength): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export function sourceFromCapture(capture: PendingCapture): SourceReference {
  return {
    url: capture.pageUrl,
    title: capture.pageTitle || hostOf(capture.pageUrl),
    capturedAt: capture.capturedAt,
    ...(capture.kind === 'selection' ? { excerpt: excerptOf(capture.text) } : {}),
  };
}

/** Reads a source reference back off an element, tolerating anything a foreign file contains. */
export function readSource(customData: unknown): SourceReference | null {
  if (!customData || typeof customData !== 'object') return null;
  const raw = (customData as Record<string, unknown>)[SOURCE_KEY];
  const parsed = sourceReferenceSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function sourceLabel(source: SourceReference): string {
  return `${source.title} · ${hostOf(source.url)}`;
}

export function formatCapturedAt(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return new Date(timestamp).toISOString();
  }
}

/**
 * The clipboard form of a source-referenced element: the text, then the provenance.
 * Copying content out of SketchPilot must never silently drop where it came from.
 */
export function textWithSource(text: string, source: SourceReference): string {
  return `${text}\n\nSource: ${source.title} — ${source.url} (captured ${formatCapturedAt(source.capturedAt)})`;
}

/** The note body used by "Add as sticky note" — the excerpt, not the whole page. */
export function noteTextFor(selection: CapturedSelection): string {
  const text = selection.text.slice(0, CAPTURE_LIMITS.noteTextLength).trim();
  return selection.text.length > text.length ? `${text}…` : text;
}

/** The body used by "Add as source reference": provenance first, text second. */
export function sourceCardTextFor(selection: CapturedSelection): string {
  return `${selection.pageTitle || hostOf(selection.pageUrl)}\n${selection.pageUrl}\nCaptured ${formatCapturedAt(
    selection.capturedAt,
  )}\n\n“${excerptOf(selection.text, 160)}”`;
}

export type ConsentSummary = {
  host: string;
  characters: number;
  lines: number;
  /** What exactly is leaving the machine, for the confirmation dialog. */
  preview: string;
  pageLabel: string;
};

/**
 * Describes an outbound AI request that contains page text (spec §7: "never silently send
 * webpage content to an AI provider"). The panel renders this and blocks Generate until
 * the user confirms it.
 */
export function consentSummary(input: {
  prompt: string;
  endpoint: string;
  pageUrl?: string;
  pageTitle?: string;
}): ConsentSummary {
  const characters = input.prompt.length;
  return {
    host: hostOf(input.endpoint),
    characters,
    lines: input.prompt.split('\n').length,
    preview: input.prompt.length > 1200 ? `${input.prompt.slice(0, 1200)}…` : input.prompt,
    pageLabel: input.pageTitle ? `${input.pageTitle} · ${hostOf(input.pageUrl ?? '')}` : hostOf(input.pageUrl ?? ''),
  };
}
