import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { DrawingDocument, DrawingElement, PersistedAppState } from '../../storage/schemas';
import { withTimestamp } from '../../storage/documents';

/**
 * CanvasAdapter — the only place in the app that reads Excalidraw internals.
 *
 * If the engine ever has to be replaced (see ADR-001), this module and the one
 * component that mounts <Excalidraw> are the complete blast radius.
 */

const PERSISTED_APP_STATE_KEYS = [
  'viewBackgroundColor',
  'gridSize',
  'currentItemStrokeColor',
  'currentItemBackgroundColor',
  'currentItemStrokeWidth',
  'currentItemFontSize',
  'currentItemFontFamily',
  'currentItemOpacity',
] as const;

export function toDraftElement(element: ExcalidrawElement): DrawingElement {
  // Deleted elements are tombstones kept for undo history; they must not be persisted.
  const record = element as unknown as Record<string, unknown>;
  return {
    ...record,
    id: String(record.id),
    type: String(record.type),
    x: Number(record.x),
    y: Number(record.y),
    width: Number(record.width),
    height: Number(record.height),
  } as DrawingElement;
}

export function liveElements(elements: readonly ExcalidrawElement[]): DrawingElement[] {
  return elements.filter((element) => !element.isDeleted).map(toDraftElement);
}

export function toPersistedAppState(appState: AppState): PersistedAppState {
  const picked: Record<string, unknown> = {};
  for (const key of PERSISTED_APP_STATE_KEYS) {
    const value = (appState as unknown as Record<string, unknown>)[key];
    if (value !== undefined) picked[key] = value;
  }
  if (appState.theme === 'light' || appState.theme === 'dark') picked.theme = appState.theme;
  return picked as PersistedAppState;
}

/** Builds the persistable revision of the open drawing from the live scene. */
export function snapshotDocument(
  base: DrawingDocument,
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
  now = Date.now(),
): DrawingDocument {
  return withTimestamp(
    {
      ...base,
      elements: liveElements(elements),
      appState: toPersistedAppState(appState),
      files: files as Record<string, unknown>,
    },
    now,
  );
}

/** Elements stored in the document, ready to hand back to the engine. */
export function toEngineElements(document: DrawingDocument): ExcalidrawElement[] {
  return document.elements as unknown as ExcalidrawElement[];
}

export function toEngineFiles(document: DrawingDocument): BinaryFiles {
  return (document.files ?? {}) as unknown as BinaryFiles;
}

export type ExportRequest = {
  format: 'png' | 'svg';
  transparent: boolean;
  darkMode: boolean;
  /** Exported selection only, when the caller asked for it. */
  elements?: readonly ExcalidrawElement[];
};

/**
 * Undo/redo are not exposed on the imperative API in 0.18, so we replay the
 * engine's own keyboard binding instead of maintaining a second, divergent
 * history stack. The event must be dispatched on the engine container (it is the
 * element that owns the handler and passes the library's focus checks) — firing
 * it on `document` is silently ignored.
 */
export function requestHistoryStep(direction: 'undo' | 'redo'): void {
  const target = document.querySelector('.excalidraw') ?? document.body;
  const event = new KeyboardEvent('keydown', {
    key: direction === 'undo' ? 'z' : 'Z',
    code: 'KeyZ',
    keyCode: 90,
    ctrlKey: true,
    metaKey: true,
    shiftKey: direction === 'redo',
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
}

export type ZoomAction = 'in' | 'out' | 'reset' | 'fit';

export function applyZoom(api: ExcalidrawImperativeAPI, action: ZoomAction): void {
  const appState = api.getAppState();
  const current = appState.zoom.value;
  if (action === 'fit') {
    api.scrollToContent(api.getSceneElements(), { fitToContent: true, animate: true });
    return;
  }
  const next = action === 'in' ? current * 1.2 : action === 'out' ? current / 1.2 : 1;
  const clamped = Math.min(8, Math.max(0.1, Number(next.toFixed(3))));
  api.updateScene({ appState: { zoom: { value: clamped as AppState['zoom']['value'] } } });
}

export function setEngineTheme(api: ExcalidrawImperativeAPI, theme: 'light' | 'dark'): void {
  if (api.getAppState().theme === theme) return;
  api.updateScene({ appState: { theme } });
}
