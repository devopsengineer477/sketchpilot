import { appError, err, ok, type Result } from '../lib/errors';
import { parseSelectionInjection, readSelectionInPage, type CaptureApi, type ActiveTab } from '../capture/service';
import { pendingCaptureSchema, type PendingCapture } from '../capture/model';

/**
 * Chrome bindings for the capture flow. This is the only place that knows
 * `chrome.tabs`, `chrome.scripting` or `chrome.commands` exist (plan P4-T2/T6/T9).
 */

const PENDING_PREFIX = 'sketchpilot.pending.';

type SessionArea = {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

function hasChrome(): boolean {
  return typeof chrome !== 'undefined' && !!chrome?.runtime?.id;
}

/**
 * Pending captures live in `chrome.storage.session`: memory-only, cleared when the browser
 * closes, never written to disk. A screenshot the user never keeps leaves no trace.
 */
function sessionArea(): SessionArea | null {
  if (!hasChrome()) return null;
  const session = (chrome.storage as unknown as { session?: SessionArea }).session;
  if (session) return session;
  // Older Chrome: fall back to local storage; the record is still deleted on read.
  return chrome.storage.local as unknown as SessionArea;
}

// In-memory fallback for Node tests and any context without chrome.storage.
const memoryPending = new Map<string, unknown>();

export async function stashPendingCapture(capture: PendingCapture): Promise<void> {
  const store = sessionArea();
  if (!store) {
    memoryPending.set(capture.id, capture);
    return;
  }
  await store.set({ [`${PENDING_PREFIX}${capture.id}`]: capture });
}

/** Reads and deletes in one step — a pending capture is single-use by construction. */
export async function takePendingCapture(id: string): Promise<PendingCapture | null> {
  const store = sessionArea();
  let raw: unknown;
  if (!store) {
    raw = memoryPending.get(id) ?? null;
    memoryPending.delete(id);
  } else {
    const result = await store.get(`${PENDING_PREFIX}${id}`);
    raw = result?.[`${PENDING_PREFIX}${id}`] ?? null;
    await store.remove(`${PENDING_PREFIX}${id}`);
  }
  const parsed = pendingCaptureSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function dropPendingCapture(id: string): Promise<void> {
  const store = sessionArea();
  if (!store) {
    memoryPending.delete(id);
    return;
  }
  await store.remove(`${PENDING_PREFIX}${id}`);
}

export async function readActiveTab(): Promise<ActiveTab | null> {
  if (!hasChrome() || !chrome.tabs?.query) return null;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab) return null;
    return { id: tab.id, url: tab.url, title: tab.title, windowId: tab.windowId };
  } catch {
    return null;
  }
}

export async function captureVisibleTab(windowId?: number): Promise<Result<string>> {
  if (!hasChrome() || !chrome.tabs?.captureVisibleTab) {
    return err(appError('capture-failed', 'Screenshots are not available here.', 'Open the editor in Chrome and try again.'));
  }
  try {
    // The promise overload requires a windowId; without one Chrome captures the
    // current window, which is what we want when the worker has no window context.
    const dataUrl =
      typeof windowId === 'number'
        ? await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
        : await new Promise<string>((resolve, reject) => {
            chrome.tabs.captureVisibleTab({ format: 'png' }, (value) => {
              const failure = chrome.runtime.lastError;
              if (failure) reject(new Error(failure.message ?? 'capture failed'));
              else resolve(value);
            });
          });
    return ok(dataUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(appError('capture-failed', message, undefined, error));
  }
}

export async function readSelectionFromTab(tabId: number): Promise<Result<{ text: string; pageUrl: string; pageTitle: string }>> {
  if (!hasChrome() || !chrome.scripting?.executeScript) {
    return err(
      appError('capture-failed', 'Reading a page selection is not available here.', 'Use the editor or the popup inside Chrome.'),
    );
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      // The function is serialised into the page: it may not reference anything in scope.
      func: readSelectionInPage,
    });
    return parseSelectionInjection(results?.[0]?.result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const blocked = /cannot access|chrome:\/\/|cannot be scripted|extension manifest/i.test(message);
    return err(
      appError(
        'capture-failed',
        blocked ? 'Chrome blocked access to this page.' : 'The selection could not be read from this page.',
        blocked
          ? 'Browser-internal pages and the Web Store are protected. Try a normal website.'
          : 'Reload the page and try again — some pages block injected scripts until they are reloaded.',
        error,
      ),
    );
  }
}

/** Image dimensions from a data URL. Works in both the service worker and a page. */
export async function imageSizeOf(dataUrl: string): Promise<{ width: number; height: number }> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close?.();
  return size;
}

export type CommandBinding = { name: string; shortcut: string; description: string };

/**
 * The *effective* shortcut for each command. Users rebind these on
 * chrome://extensions/shortcuts, so the app must read them rather than assume (P4-T9).
 */
export async function readCommandBindings(): Promise<CommandBinding[]> {
  if (!hasChrome() || !chrome.commands?.getAll) {
    return [
      { name: 'new-drawing', shortcut: '', description: 'New drawing' },
      { name: 'open-dashboard', shortcut: '', description: 'Open the library' },
      { name: 'capture-tab', shortcut: '', description: 'Capture the visible tab' },
      { name: 'capture-selection', shortcut: '', description: 'Note from selected text' },
    ];
  }
  try {
    const commands = await chrome.commands.getAll();
    return commands
      .filter((command) => command.name !== '_execute_action')
      .map((command) => ({
        name: command.name ?? '',
        shortcut: command.shortcut ?? '',
        description: command.description ?? '',
      }));
  } catch {
    return [];
  }
}

/** Background-worker capture API: what `captureVisibleTab()`/`captureSelection()` run against. */
export const chromeCaptureApi: CaptureApi = {
  activeTab: readActiveTab,
  captureVisibleTab,
  readSelection: readSelectionFromTab,
  imageSize: imageSizeOf,
  stash: stashPendingCapture,
  openEditor: async (pendingId) => {
    const url = `${chrome.runtime.getURL('editor.html')}?pending=${encodeURIComponent(pendingId)}`;
    await chrome.tabs.create({ url, active: true });
  },
};
