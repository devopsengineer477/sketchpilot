import { appError, err, ok, type Result } from '../lib/errors';
import { classifyPageUrl } from './urls';
import {
  CAPTURE_LIMITS,
  createImageCapture,
  createSelectionCapture,
  normaliseSelectionText,
  type CapturedImage,
  type CapturedSelection,
  type PendingCapture,
} from './model';

/**
 * The capture flow, with the browser behind a small injectable interface.
 *
 * Everything interesting — refusing protected pages, mapping a denied permission to real
 * copy, rejecting an empty selection — is testable in Node with a fake, and the same code
 * runs in the background worker against real Chrome (plan P4-T2/T3/T12).
 */

export type ActiveTab = {
  id?: number;
  url?: string;
  title?: string;
  windowId?: number;
};

export type CaptureApi = {
  activeTab(): Promise<ActiveTab | null>;
  /** Resolves to a data URL, or a message from Chrome we should show verbatim-ish. */
  captureVisibleTab(windowId: number | undefined): Promise<Result<string>>;
  readSelection(tabId: number): Promise<Result<{ text: string; pageUrl: string; pageTitle: string }>>;
  imageSize(dataUrl: string): Promise<{ width: number; height: number }>;
  stash(capture: PendingCapture): Promise<void>;
  openEditor(pendingId: string): Promise<void>;
};

/**
 * Chrome's own failure text for a denied/blocked capture, translated into something a
 * person can act on. Kept deliberately narrow: unknown errors keep their original text.
 */
export function explainCaptureFailure(raw: string): { message: string; hint: string } {
  const text = raw.toLowerCase();
  if (text.includes('cannot access') || text.includes('cannot be scripted')) {
    return {
      message: 'Chrome refused to capture this page.',
      hint: 'Browser-internal pages, the Web Store and other extensions’ pages are protected. Try a normal website.',
    };
  }
  if (text.includes('activeTab') || text.includes('permission')) {
    return {
      message: 'SketchPilot did not have permission for this tab.',
      hint: 'Chrome grants capture access only for the tab in front of you, right after you click. Click the SketchPilot icon again while the page is visible.',
    };
  }
  if (text.includes('quota') || text.includes('too large')) {
    return {
      message: 'That screenshot was too large to hold in memory.',
      hint: 'Capture a smaller window, or use your OS screenshot tool and drag the file onto the canvas.',
    };
  }
  return {
    message: 'The screenshot could not be taken.',
    hint: 'Close any full-screen or DRM-protected player and try again, or capture a different tab.',
  };
}

export async function captureVisibleTab(api: CaptureApi): Promise<Result<CapturedImage>> {
  const tab = await api.activeTab();
  const verdict = classifyPageUrl(tab?.url);
  if (!verdict.capturable) {
    return err(appError('capture-blocked', verdict.message ?? 'This page cannot be captured.', verdict.hint));
  }

  const shot = await api.captureVisibleTab(tab?.windowId);
  if (!shot.ok) {
    const explained = explainCaptureFailure(shot.error.message);
    return err(appError('capture-failed', explained.message, explained.hint, shot.error));
  }

  if (shot.value.length > CAPTURE_LIMITS.maxDataUrlLength) {
    return err(
      appError(
        'capture-failed',
        'That screenshot is too large for SketchPilot to insert.',
        'Capture a smaller window, or use your OS screenshot tool and drag the file onto the canvas.',
      ),
    );
  }

  let size: { width: number; height: number };
  try {
    size = await api.imageSize(shot.value);
  } catch {
    return err(
      appError(
        'capture-failed',
        'The screenshot could not be decoded.',
        'Try capturing the page again. If it keeps failing, use your OS screenshot tool and drag the file onto the canvas.',
      ),
    );
  }

  const capture = createImageCapture({
    dataUrl: shot.value,
    width: size.width,
    height: size.height,
    pageUrl: tab?.url ?? '',
    pageTitle: tab?.title ?? '',
  });

  await api.stash(capture);
  await api.openEditor(capture.id);
  return ok(capture);
}

export async function captureSelection(
  api: CaptureApi,
  options: { intent?: CapturedSelection['intent']; origin?: CapturedSelection['origin'] } = {},
): Promise<Result<CapturedSelection>> {
  const tab = await api.activeTab();
  const verdict = classifyPageUrl(tab?.url);
  if (!verdict.capturable) {
    return err(appError('capture-blocked', verdict.message ?? 'This page cannot be captured.', verdict.hint));
  }
  if (typeof tab?.id !== 'number') {
    return err(
      appError(
        'capture-blocked',
        'Chrome did not share the active tab, so the selection could not be read.',
        'Click the SketchPilot icon directly on the page whose text you want to capture.',
      ),
    );
  }

  const read = await api.readSelection(tab.id);
  if (!read.ok) {
    return err(read.error);
  }

  const text = normaliseSelectionText(read.value.text ?? '');
  if (!text) {
    return err(
      appError(
        'selection-empty',
        'No text was selected on that page.',
        'Select some text with your mouse or keyboard first, then run the command again. Chrome only reads the selection at the moment you ask.',
      ),
    );
  }

  const capture = createSelectionCapture({
    text,
    pageUrl: read.value.pageUrl || tab.url || '',
    pageTitle: read.value.pageTitle || tab.title || '',
    ...(options.intent ? { intent: options.intent } : {}),
    ...(options.origin ? { origin: options.origin } : {}),
  });

  await api.stash(capture);
  await api.openEditor(capture.id);
  return ok(capture);
}

/**
 * The selection reader injected into the page.
 *
 * This function is serialised by `chrome.scripting.executeScript`, so it must not close
 * over anything from module scope — no imports, no helpers, no constants. Keep it dumb.
 */
export function readSelectionInPage(): { text: string; pageUrl: string; pageTitle: string } {
  const selection = typeof window !== 'undefined' ? window.getSelection() : null;
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  let text = selection ? selection.toString() : '';
  const tag = active && active.tagName ? active.tagName.toLowerCase() : '';
  if (!text && (tag === 'input' || tag === 'textarea')) {
    const value = (active as HTMLInputElement | HTMLTextAreaElement).value;
    const start = (active as HTMLInputElement).selectionStart ?? 0;
    const end = (active as HTMLInputElement).selectionEnd ?? 0;
    text = typeof value === 'string' && end > start ? value.slice(start, end) : '';
  }
  return {
    text,
    pageUrl: typeof location !== 'undefined' ? location.href : '',
    pageTitle: typeof document !== 'undefined' ? document.title : '',
  };
}

/** Shape-check for whatever `executeScript` hands back (it is untyped at runtime). */
export function parseSelectionInjection(result: unknown): Result<{ text: string; pageUrl: string; pageTitle: string }> {
  if (!result || typeof result !== 'object') {
    return err(
      appError(
        'capture-failed',
        'Chrome did not return anything from this page.',
        'Reload the page and try again — some pages block injected scripts until they are reloaded.',
      ),
    );
  }
  const record = result as Record<string, unknown>;
  return ok({
    text: typeof record.text === 'string' ? record.text : '',
    pageUrl: typeof record.pageUrl === 'string' ? record.pageUrl : '',
    pageTitle: typeof record.pageTitle === 'string' ? record.pageTitle : '',
  });
}
