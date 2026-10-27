/**
 * Which pages Chrome will let an extension capture, and what to say when it won't.
 *
 * The classification is deliberately conservative: it decides *before* calling
 * `captureVisibleTab`/`executeScript`, so a protected page produces one clear sentence
 * instead of a raw Chrome error string (spec §7, plan P4-T2/T3).
 */

export type PageKind =
  | 'web'
  | 'chrome'
  | 'webstore'
  | 'extension'
  | 'file'
  | 'view-source'
  | 'data'
  | 'unknown';

export type PageVerdict = {
  capturable: boolean;
  kind: PageKind;
  /** Shown to the user when `capturable` is false. States what happened, why, and what to do. */
  message?: string;
  hint?: string;
};

const CHROME_WEB_STORE_HOSTS = new Set([
  'chromewebstore.google.com',
  'chrome.google.com',
  'chrome.google.com/webstore',
]);

const PROTECTED_SCHEMES = new Set([
  'chrome',
  'chrome-untrusted',
  'chrome-extension',
  'chrome-search',
  'devtools',
  'edge',
  'about',
  'brave',
  'opera',
  'vivaldi',
]);

const MESSAGES: Record<Exclude<PageKind, 'web'>, { message: string; hint: string }> = {
  chrome: {
    message: 'Chrome does not allow extensions to read its own pages.',
    hint: 'Settings, history, the new-tab page and other chrome:// screens are off-limits by design. Open a normal website and capture that instead.',
  },
  webstore: {
    message: 'The Chrome Web Store is a protected page.',
    hint: 'Chrome blocks extensions from reading store pages. Capture a different page, or take a screenshot with your OS and drag the file onto the canvas.',
  },
  extension: {
    message: 'This tab belongs to a browser extension, not a website.',
    hint: 'Extension pages — including Chrome’s built-in PDF viewer — are protected. Open the same document as a normal web page, or capture another tab.',
  },
  file: {
    message: 'SketchPilot is not allowed to read local files yet.',
    hint: 'Enable “Allow access to file URLs” for SketchPilot on chrome://extensions, or open the file in a web page and capture that.',
  },
  'view-source': {
    message: 'View-source pages cannot be captured.',
    hint: 'Open the page itself rather than its source view.',
  },
  data: {
    message: 'This tab has no real page address to capture.',
    hint: 'Open a normal website and try again.',
  },
  unknown: {
    message: 'SketchPilot could not tell which page is active.',
    hint: 'Click the toolbar icon once more — Chrome only grants access to the tab you are looking at, at the moment you ask.',
  },
};

/** Classifies a tab URL without touching the tabs API, so it is fully unit-testable. */
export function classifyPageUrl(url: string | undefined | null): PageVerdict {
  if (!url || typeof url !== 'string') {
    return { capturable: false, kind: 'unknown', ...MESSAGES.unknown };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { capturable: false, kind: 'unknown', ...MESSAGES.unknown };
  }

  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();

  if (scheme === 'https' || scheme === 'http') {
    if (CHROME_WEB_STORE_HOSTS.has(parsed.hostname)) {
      return { capturable: false, kind: 'webstore', ...MESSAGES.webstore };
    }
    return { capturable: true, kind: 'web' };
  }

  if (scheme === 'file') return { capturable: false, kind: 'file', ...MESSAGES.file };
  if (scheme === 'view-source') return { capturable: false, kind: 'view-source', ...MESSAGES['view-source'] };
  if (scheme === 'data' || scheme === 'blob') return { capturable: false, kind: 'data', ...MESSAGES.data };
  if (scheme === 'chrome-extension') return { capturable: false, kind: 'extension', ...MESSAGES.extension };
  if (PROTECTED_SCHEMES.has(scheme)) return { capturable: false, kind: 'chrome', ...MESSAGES.chrome };

  return { capturable: false, kind: 'unknown', ...MESSAGES.unknown };
}

/** True for anything the user can meaningfully point at — used to enable/disable buttons. */
export function isCapturable(url: string | undefined | null): boolean {
  return classifyPageUrl(url).capturable;
}
