import { exportToBlob, exportToSvg } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { BinaryFiles } from '@excalidraw/excalidraw/types';
import type { PersistedAppState } from '../storage/schemas';
import { sanitizeSvg } from './io';

export type RenderOptions = {
  transparent?: boolean;
  darkMode?: boolean;
  scale?: number;
};

/** Guard against pathological scenes turning into 200 MB PNGs. */
const MAX_EXPORT_PIXELS = 40_000_000;

export async function renderPng(
  elements: readonly ExcalidrawElement[],
  appState: PersistedAppState,
  files: BinaryFiles,
  options: RenderOptions = {},
): Promise<Blob> {
  if (elements.length === 0) throw new Error('There is nothing on the canvas to export yet.');
  const blob = await exportToBlob({
    elements: elements as never,
    appState: {
      ...(appState as never as Record<string, unknown>),
      exportBackground: !options.transparent,
      exportWithDarkMode: options.darkMode ?? false,
      viewBackgroundColor: (appState.viewBackgroundColor as string) ?? '#ffffff',
    } as never,
    files: files as never,
    mimeType: 'image/png',
    quality: 1,
    getDimensions: (width: number, height: number) => {
      // The caller cannot ask for a blurrier-than-1× export…
      const requested = Math.max(1, options.scale ?? (width * height > MAX_EXPORT_PIXELS ? 1 : 2));
      // …but the pixel budget always wins, even if that means going below 1× on a scene too
      // large to render at full size. (Clamping this back up to 1 would silently defeat the
      // budget: a 20 000 px square would export at 400 MP.)
      const scale = Math.min(requested, Math.sqrt(MAX_EXPORT_PIXELS / Math.max(1, width * height)));
      return {
        // Floor, never round: rounding up can put the result just over the budget.
        width: Math.max(1, Math.floor(width * scale)),
        height: Math.max(1, Math.floor(height * scale)),
        scale,
      };
    },
  });
  return blob;
}

export async function renderSvg(
  elements: readonly ExcalidrawElement[],
  appState: PersistedAppState,
  files: BinaryFiles,
  options: RenderOptions = {},
): Promise<string> {
  if (elements.length === 0) throw new Error('There is nothing on the canvas to export yet.');
  const svg = await exportToSvg({
    elements: elements as never,
    appState: {
      ...(appState as never as Record<string, unknown>),
      exportBackground: !options.transparent,
      exportWithDarkMode: options.darkMode ?? false,
      viewBackgroundColor: (appState.viewBackgroundColor as string) ?? '#ffffff',
    } as never,
    files: files as never,
    exportPadding: 16,
  });
  return sanitizeSvg(svg.outerHTML);
}
