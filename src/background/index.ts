/**
 * MV3 service worker: message router, context menus and keyboard commands.
 *
 * The worker is intentionally stateless — it can be terminated at any time — so every
 * handler reads what it needs per invocation. It never holds a captured screenshot
 * longer than the call that produced it.
 */
import { captureSelection, captureVisibleTab } from '../capture/service';
import { chromeCaptureApi } from '../platform/capture';
import { createSelectionCapture, type CapturedSelection } from '../capture/model';
import { CONTEXT_MENUS, resolveMenuAction } from '../capture/menu';

export type ExtensionMessage =
  | { type: 'ping' }
  | { type: 'editor.open'; drawingId?: string }
  | { type: 'dashboard.open' }
  | { type: 'capture.tab' }
  | { type: 'capture.selection'; intent?: CapturedSelection['intent'] };

type Response =
  | { ok: true }
  | { ok: false; message: string; hint?: string };

function editorUrl(options: { drawingId?: string; pending?: string; captureError?: string; captureHint?: string } = {}): string {
  const params = new URLSearchParams();
  if (options.drawingId) params.set('id', options.drawingId);
  if (options.pending) params.set('pending', options.pending);
  if (options.captureError) params.set('captureError', options.captureError);
  if (options.captureHint) params.set('captureHint', options.captureHint);
  const query = params.toString();
  const base = chrome.runtime.getURL('editor.html');
  return query ? `${base}?${query}` : base;
}

function dashboardUrl(): string {
  return chrome.runtime.getURL('dashboard.html');
}

/** A context-menu or command failure has no UI to land in, so the editor explains it. */
async function openEditorWithError(message: string, hint?: string): Promise<void> {
  await chrome.tabs.create({
    url: editorUrl({ captureError: message, ...(hint ? { captureHint: hint } : {}) }),
    active: true,
  });
}

async function runTabCapture(): Promise<Response> {
  const result = await captureVisibleTab(chromeCaptureApi);
  if (result.ok) return { ok: true };
  await openEditorWithError(result.error.message, result.error.hint);
  return { ok: false, message: result.error.message, hint: result.error.hint };
}

async function runSelectionCapture(
  options: { intent?: CapturedSelection['intent']; origin?: CapturedSelection['origin'] } = {},
): Promise<Response> {
  const result = await captureSelection(chromeCaptureApi, options);
  if (result.ok) return { ok: true };
  await openEditorWithError(result.error.message, result.error.hint);
  return { ok: false, message: result.error.message, hint: result.error.hint };
}

function registerContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    for (const menu of CONTEXT_MENUS) {
      chrome.contextMenus.create(menu as chrome.contextMenus.CreateProperties);
    }
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  registerContextMenus();
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: editorUrl() });
  }
});

// Menus survive restarts, but re-creating them costs nothing and prevents a stale set
// after an update that changed the menu ids.
chrome.runtime.onStartup.addListener(registerContextMenus);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const action = resolveMenuAction(info.menuItemId.toString(), info.selectionText);
  switch (action.kind) {
    case 'new-drawing':
      void chrome.tabs.create({ url: editorUrl() });
      break;
    case 'open-dashboard':
      void chrome.tabs.create({ url: dashboardUrl() });
      break;
    case 'capture-tab':
      void runTabCapture();
      break;
    case 'note':
    case 'mindmap': {
      // Selection text is already in hand: build the pending capture and open the editor.
      void (async () => {
        const capture = createSelectionCapture({
          text: action.selectionText,
          pageUrl: tab?.url ?? info.pageUrl ?? '',
          pageTitle: tab?.title ?? '',
          intent: action.kind === 'mindmap' ? 'mindmap' : 'note',
          origin: 'menu',
        });
        await chromeCaptureApi.stash(capture);
        await chrome.tabs.create({ url: editorUrl({ pending: capture.id }), active: true });
      })();
      break;
    }
    default:
      break;
  }
});

chrome.commands.onCommand.addListener((command) => {
  switch (command) {
    case 'new-drawing':
      void chrome.tabs.create({ url: editorUrl() });
      break;
    case 'open-dashboard':
      void chrome.tabs.create({ url: dashboardUrl() });
      break;
    case 'capture-tab':
      void runTabCapture();
      break;
    case 'capture-selection':
      void runSelectionCapture({ intent: 'note', origin: 'command' });
      break;
    default:
      break;
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  switch (message?.type) {
    case 'ping':
      sendResponse({ ok: true } satisfies Response);
      return false;
    case 'editor.open':
      void chrome.tabs.create({ url: editorUrl({ drawingId: message.drawingId }) });
      sendResponse({ ok: true } satisfies Response);
      return false;
    case 'dashboard.open':
      void chrome.tabs.create({ url: dashboardUrl() });
      sendResponse({ ok: true } satisfies Response);
      return false;
    case 'capture.tab':
    case 'capture.selection':
      // Async: keep the channel open until the capture resolves so the popup can show
      // the exact failure instead of silently closing.
      void (async () => {
        try {
          const response =
            message.type === 'capture.tab'
              ? await runTabCapture()
              : await runSelectionCapture({ intent: message.intent, origin: 'popup' });
          sendResponse(response);
        } catch (error) {
          sendResponse({
            ok: false,
            message: 'The capture could not be started.',
            hint: error instanceof Error ? error.message : 'Try again from the page you want to capture.',
          } satisfies Response);
        }
      })();
      return true;
    default:
      sendResponse({ ok: false, message: 'unknown-message' } satisfies Response);
      return false;
  }
});
