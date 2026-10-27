/**
 * `quality` only means something for lossy formats.
 *
 * The canvas engine accepts `quality` alongside `mimeType`, but when the mimeType is `image/png`
 * the value is meaningless and the engine says so on the console:
 *
 *   `"quality" will be ignored for "image/png" mimeType`
 *
 * That warning showed up in the extension's own console during a store smoke test, where any
 * console noise reads as a defect. SketchPilot only exports PNG and SVG today, so the option is
 * never sent — and if a lossy format is ever offered, this is the single place that decides.
 */

/** Formats where a 0–1 quality actually changes the bytes. */
const LOSSY_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/webp', 'image/avif']);

/**
 * Returns `{ quality }` for lossy formats and `{}` otherwise, so it can be spread into an
 * export call without branching at every call site.
 */
export function qualityOption(mimeType: string, quality: number): { quality?: number } {
  return LOSSY_MIME_TYPES.has(mimeType.toLowerCase()) ? { quality } : {};
}
