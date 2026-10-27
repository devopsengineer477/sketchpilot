import { exportToBlob } from '@excalidraw/excalidraw';
import type { DrawingDocument, DrawingThumbnail } from '../storage/schemas';
import { repository } from '../storage/repository';

/**
 * Library thumbnails.
 *
 * Generated from the saved document, off the editing hot path (idle callback +
 * throttled), at a fixed width so cards stay light. A failure is never fatal: the
 * card falls back to a placeholder.
 */

export const THUMBNAIL_WIDTH = 360;
const MIN_INTERVAL_MS = 8_000;

export async function generateThumbnail(document: DrawingDocument): Promise<DrawingThumbnail | null> {
  if (document.elements.length === 0) return null;

  try {
    const blob = await exportToBlob({
      elements: document.elements as never,
      appState: {
        exportBackground: true,
        viewBackgroundColor: (document.appState.viewBackgroundColor as string) ?? '#ffffff',
        exportWithDarkMode: false,
      } as never,
      files: (document.files ?? {}) as never,
      mimeType: 'image/png',
      quality: 0.85,
      getDimensions: (width: number, height: number) => {
        const safeWidth = Math.max(1, width);
        const safeHeight = Math.max(1, height);
        const scale = Math.min(2, THUMBNAIL_WIDTH / safeWidth);
        return {
          width: Math.round(safeWidth * scale),
          height: Math.round(safeHeight * scale),
          scale,
        };
      },
    });

    const dataUrl = await blobToDataUrl(blob);
    // Keep the stored preview well under the schema's 400 kB ceiling.
    if (dataUrl.length > 380_000) return null;

    return {
      drawingId: document.id,
      dataUrl,
      width: THUMBNAIL_WIDTH,
      height: Math.max(1, Math.round(THUMBNAIL_WIDTH * 0.6)),
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Schedules thumbnail generation for a document that was just saved.
 * Throttled per drawing and run when the browser is idle, so drawing stays smooth.
 */
export class ThumbnailScheduler {
  private lastRun = new Map<string, number>();
  private pending = new Set<string>();

  schedule(document: DrawingDocument): void {
    if (document.elements.length === 0) return;
    const now = Date.now();
    const last = this.lastRun.get(document.id) ?? 0;
    if (now - last < MIN_INTERVAL_MS) return;
    if (this.pending.has(document.id)) return;

    this.pending.add(document.id);
    const run = async () => {
      this.pending.delete(document.id);
      this.lastRun.set(document.id, Date.now());
      const thumbnail = await generateThumbnail(document);
      if (thumbnail) await repository.saveThumbnail(thumbnail);
    };

    const idle = (window as unknown as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (typeof idle === 'function') {
      idle(() => void run(), { timeout: 4_000 });
    } else {
      window.setTimeout(() => void run(), 2_000);
    }
  }

  reset(): void {
    this.lastRun.clear();
    this.pending.clear();
  }
}
