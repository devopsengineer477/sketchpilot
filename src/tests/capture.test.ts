import { describe, expect, it, vi } from 'vitest';
import { classifyPageUrl, isCapturable } from '../capture/urls';
import {
  CAPTURE_LIMITS,
  consentSummary,
  createImageCapture,
  createSelectionCapture,
  excerptOf,
  noteTextFor,
  normaliseSelectionText,
  pendingCaptureSchema,
  readSource,
  sourceCardTextFor,
  sourceFromCapture,
  textWithSource,
  type PendingCapture,
} from '../capture/model';
import {
  captureSelection,
  captureVisibleTab,
  explainCaptureFailure,
  parseSelectionInjection,
  type CaptureApi,
} from '../capture/service';
import { takePendingCapture, stashPendingCapture } from '../platform/capture';
import { resolveMenuAction } from '../capture/menu';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function fakeApi(overrides: Partial<CaptureApi> = {}): CaptureApi {
  return {
    activeTab: async () => ({ id: 7, url: 'https://example.com/post', title: 'Example post', windowId: 1 }),
    captureVisibleTab: async () => ({ ok: true, value: PNG }),
    readSelection: async () => ({ ok: true, value: { text: '  Hello   world  ', pageUrl: 'https://example.com/post', pageTitle: 'Example post' } }),
    imageSize: async () => ({ width: 1280, height: 800 }),
    stash: async () => {},
    openEditor: async () => {},
    ...overrides,
  };
}

describe('page classification', () => {
  it.each([
    ['https://example.com/a', true],
    ['http://localhost:3000/docs', true],
  ])('allows %s', (url, expected) => {
    expect(isCapturable(url)).toBe(expected);
  });

  it.each([
    ['chrome://settings', 'chrome'],
    ['chrome://version/', 'chrome'],
    ['about:blank', 'chrome'],
    ['devtools://devtools/bundled/inspector.html', 'chrome'],
    ['https://chromewebstore.google.com/detail/x', 'webstore'],
    ['https://chrome.google.com/webstore/category/extensions', 'webstore'],
    ['chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html?file=x.pdf', 'extension'],
    ['file:///Users/me/notes.pdf', 'file'],
    ['view-source:https://example.com', 'view-source'],
    ['data:text/html,<h1>hi</h1>', 'data'],
    ['not a url', 'unknown'],
    ['', 'unknown'],
  ])('refuses %s', (url, kind) => {
    const verdict = classifyPageUrl(url);
    expect(verdict.capturable).toBe(false);
    expect(verdict.kind).toBe(kind);
    // Every refusal explains itself and offers a next step.
    expect(verdict.message).toBeTruthy();
    expect(verdict.hint).toBeTruthy();
  });

  it('names the PDF viewer case honestly rather than blaming the user', () => {
    const verdict = classifyPageUrl('chrome-extension://abc/index.html?file=report.pdf');
    expect(verdict.message).toMatch(/extension/i);
    expect(verdict.hint).toMatch(/PDF viewer/i);
  });
});

describe('chrome failure translation', () => {
  it('turns a protected-page error into advice', () => {
    const explained = explainCaptureFailure('Cannot access a chrome:// URL');
    expect(explained.message).toMatch(/refused/i);
    expect(explained.hint).toMatch(/protected|website/i);
  });

  it('explains an activeTab denial without blaming the extension', () => {
    const explained = explainCaptureFailure(
      "Either the '<all_urls>' or 'activeTab' permission is required.",
    );
    expect(explained.hint).toMatch(/click the SketchPilot icon/i);
  });

  it('keeps a specific message for oversized captures', () => {
    expect(explainCaptureFailure('QUOTA_BYTES quota exceeded').message).toMatch(/too large/i);
  });

  it('falls back to a generic but actionable message', () => {
    const explained = explainCaptureFailure('something exotic happened');
    expect(explained.message).toBeTruthy();
    expect(explained.hint).toMatch(/try again|different tab/i);
  });
});

describe('captureVisibleTab', () => {
  it('captures, records the page and opens the editor', async () => {
    const stash = vi.fn(async (_capture: PendingCapture) => {});
    const openEditor = vi.fn(async () => {});
    const result = await captureVisibleTab(fakeApi({ stash, openEditor }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe('image');
    expect(result.value.pageUrl).toBe('https://example.com/post');
    expect(result.value.width).toBe(1280);
    expect(stash).toHaveBeenCalledTimes(1);
    expect(openEditor).toHaveBeenCalledWith(result.value.id);
  });

  it('never calls captureVisibleTab for a protected page', async () => {
    const capture = vi.fn(async () => ({ ok: true as const, value: PNG }));
    const result = await captureVisibleTab(
      fakeApi({
        activeTab: async () => ({ id: 1, url: 'chrome://settings', title: 'Settings', windowId: 1 }),
        captureVisibleTab: capture,
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('capture-blocked');
    expect(capture).not.toHaveBeenCalled();
  });

  it('reports a denied permission as copy, not as a raw Chrome string', async () => {
    const result = await captureVisibleTab(
      fakeApi({
        captureVisibleTab: async () => ({
          ok: false,
          error: { code: 'capture-failed', message: 'Either the "<all_urls>" or "activeTab" permission is required.' },
        }),
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('SketchPilot did not have permission for this tab.');
    expect(result.error.hint).toMatch(/click/i);
  });

  it('refuses a screenshot too large to hold in the document', async () => {
    const result = await captureVisibleTab(
      fakeApi({ captureVisibleTab: async () => ({ ok: true, value: `${PNG}${'A'.repeat(CAPTURE_LIMITS.maxDataUrlLength)}` }) }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/too large/i);
  });

  it('reports an undecodable image instead of inserting a broken element', async () => {
    const result = await captureVisibleTab(
      fakeApi({
        imageSize: async () => {
          throw new Error('decode failed');
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/could not be decoded/i);
  });
});

describe('captureSelection', () => {
  it('collapses whitespace and keeps the page as provenance', async () => {
    const result = await captureSelection(fakeApi(), { intent: 'note', origin: 'menu' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe('Hello world');
    expect(result.value.intent).toBe('note');
    expect(result.value.pageUrl).toBe('https://example.com/post');
  });

  it('tells the user when nothing was selected', async () => {
    const result = await captureSelection(
      fakeApi({ readSelection: async () => ({ ok: true, value: { text: '   ', pageUrl: 'https://a.test', pageTitle: 'A' } }) }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('selection-empty');
    expect(result.error.hint).toMatch(/select some text/i);
  });

  it('refuses protected pages before injecting anything', async () => {
    const read = vi.fn(async () => ({ ok: true as const, value: { text: 'x', pageUrl: '', pageTitle: '' } }));
    const result = await captureSelection(
      fakeApi({
        activeTab: async () => ({ id: 2, url: 'https://chromewebstore.google.com/x', windowId: 1 }),
        readSelection: read,
      }),
    );
    expect(result.ok).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it('explains a tab Chrome did not share', async () => {
    const result = await captureSelection(fakeApi({ activeTab: async () => ({ url: 'https://example.com' }) }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.hint).toMatch(/click the SketchPilot icon/i);
  });

  it('truncates a pathological selection instead of refusing it', async () => {
    const long = 'word '.repeat(20_000);
    const result = await captureSelection(
      fakeApi({ readSelection: async () => ({ ok: true, value: { text: long, pageUrl: 'https://a.test', pageTitle: 'A' } }) }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text.length).toBeLessThanOrEqual(CAPTURE_LIMITS.maxSelectionLength);
  });
});

describe('selection injection parsing', () => {
  it('accepts a well-formed payload', () => {
    const parsed = parseSelectionInjection({ text: 'hi', pageUrl: 'https://a.test', pageTitle: 'A' });
    expect(parsed.ok).toBe(true);
  });

  it('fails cleanly when the page returns nothing', () => {
    const parsed = parseSelectionInjection(undefined);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.hint).toMatch(/reload/i);
  });

  it('tolerates missing fields without inventing text', () => {
    const parsed = parseSelectionInjection({ pageUrl: 'https://a.test' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.text).toBe('');
  });
});

describe('capture model', () => {
  it('rejects a data URL that is not an image', () => {
    const bad = {
      id: 'x',
      kind: 'image',
      dataUrl: 'data:text/html;base64,PHNjcmlwdD4=',
      width: 10,
      height: 10,
      pageUrl: 'https://a.test',
      pageTitle: 'A',
      capturedAt: Date.now(),
    };
    expect(pendingCaptureSchema.safeParse(bad).success).toBe(false);
    expect(
      pendingCaptureSchema.safeParse({ ...bad, dataUrl: PNG }).success,
    ).toBe(true);
  });

  it('builds a source reference that survives a JSON round trip', () => {
    const capture = createSelectionCapture({
      text: 'A quoted sentence.',
      pageUrl: 'https://example.com/a?b=1',
      pageTitle: 'Article',
    });
    const source = sourceFromCapture(capture);
    expect(source).toMatchObject({ url: 'https://example.com/a?b=1', title: 'Article' });
    expect(readSource({ sketchpilotSource: JSON.parse(JSON.stringify(source)) })).toEqual(source);
  });

  it('ignores junk custom data instead of throwing', () => {
    expect(readSource(null)).toBeNull();
    expect(readSource('nope')).toBeNull();
    expect(readSource({ sketchpilotSource: { url: 1 } })).toBeNull();
    expect(readSource({ other: true })).toBeNull();
  });

  it('keeps the URL when text is copied out', () => {
    const capture = createSelectionCapture({ text: 'Quote', pageUrl: 'https://example.com/x', pageTitle: 'X' });
    const copied = textWithSource('Quote', sourceFromCapture(capture));
    expect(copied).toContain('https://example.com/x');
    expect(copied).toContain('Source: X');
  });

  it('truncates long notes rather than dropping the selection', () => {
    const capture = createSelectionCapture({
      text: 'x'.repeat(5000),
      pageUrl: 'https://example.com',
      pageTitle: 'Long',
    });
    const note = noteTextFor(capture);
    expect(note.length).toBeLessThanOrEqual(CAPTURE_LIMITS.noteTextLength + 1);
    expect(note.endsWith('…')).toBe(true);
  });

  it('puts provenance first in a source card', () => {
    const capture = createSelectionCapture({ text: 'Body', pageUrl: 'https://example.com/p', pageTitle: 'Page' });
    const card = sourceCardTextFor(capture);
    expect(card.split('\n')[0]).toBe('Page');
    expect(card).toContain('https://example.com/p');
  });

  it('normalises whitespace and clips excerpts', () => {
    expect(normaliseSelectionText('a\u00a0\u00a0b\n\n\n\nc')).toBe('a b\n\nc');
    expect(excerptOf('y'.repeat(400)).length).toBe(CAPTURE_LIMITS.maxExcerptLength);
  });

  it('describes an outbound payload precisely enough to consent to', () => {
    const summary = consentSummary({
      prompt: 'line one\nline two',
      endpoint: 'https://openrouter.ai/api/v1',
      pageUrl: 'https://example.com/deep/page',
      pageTitle: 'Deep page',
    });
    expect(summary.host).toBe('openrouter.ai');
    expect(summary.characters).toBe(17);
    expect(summary.lines).toBe(2);
    expect(summary.pageLabel).toContain('Deep page');
    expect(summary.preview).toBe('line one\nline two');
  });

  it('sends an image capture through the pending store exactly once', async () => {
    const capture = createImageCapture({
      dataUrl: PNG,
      width: 1,
      height: 1,
      pageUrl: 'https://example.com',
      pageTitle: 'Example',
    });
    await stashPendingCapture(capture);
    expect(await takePendingCapture(capture.id)).toEqual(capture);
    expect(await takePendingCapture(capture.id)).toBeNull();
  });

  it('refuses to resurrect a corrupted pending capture', async () => {
    await stashPendingCapture({ id: 'bad-1', kind: 'selection', text: 'ok' } as unknown as PendingCapture);
    expect(await takePendingCapture('bad-1')).toBeNull();
  });
});

describe('context menu routing', () => {
  it('maps ids to actions', () => {
    expect(resolveMenuAction('sketchpilot.new')).toEqual({ kind: 'new-drawing' });
    expect(resolveMenuAction('sketchpilot.dashboard')).toEqual({ kind: 'open-dashboard' });
    expect(resolveMenuAction('sketchpilot.capture')).toEqual({ kind: 'capture-tab' });
    expect(resolveMenuAction('sketchpilot.note', ' selected text ')).toEqual({
      kind: 'note',
      selectionText: 'selected text',
    });
    expect(resolveMenuAction('sketchpilot.mindmap', 'text')).toEqual({ kind: 'mindmap', selectionText: 'text' });
    expect(resolveMenuAction('sketchpilot.note', '   ')).toEqual({ kind: 'ignore' });
    expect(resolveMenuAction('something-else')).toEqual({ kind: 'ignore' });
  });
});
