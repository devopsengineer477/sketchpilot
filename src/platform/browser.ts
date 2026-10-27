/**
 * Platform adapter: the only place the domain layer touches `chrome.*`.
 * Everything above this file is testable in Node with a fake implementation.
 */

export type PreferencesShape = {
  theme: 'system' | 'light' | 'dark';
  lastOpenedDrawingId: string | null;
  aiEnabled: boolean;
};

export const DEFAULT_PREFERENCES: PreferencesShape = {
  theme: 'system',
  lastOpenedDrawingId: null,
  aiEnabled: false,
};

const PREFERENCES_KEY = 'sketchpilot.preferences';

type StorageArea = {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

function hasChrome(): boolean {
  return typeof chrome !== 'undefined' && !!chrome?.storage?.local;
}

function area(): StorageArea | null {
  if (!hasChrome()) return null;
  return chrome.storage.local as unknown as StorageArea;
}

export async function readPreferences(): Promise<PreferencesShape> {
  const store = area();
  if (!store) return { ...DEFAULT_PREFERENCES };
  try {
    const result = await store.get(PREFERENCES_KEY);
    const raw = result?.[PREFERENCES_KEY];
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFERENCES };
    const value = raw as Partial<PreferencesShape>;
    return {
      theme:
        value.theme === 'light' || value.theme === 'dark' || value.theme === 'system'
          ? value.theme
          : DEFAULT_PREFERENCES.theme,
      lastOpenedDrawingId:
        typeof value.lastOpenedDrawingId === 'string' ? value.lastOpenedDrawingId : null,
      aiEnabled: value.aiEnabled === true,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export async function writePreferences(patch: Partial<PreferencesShape>): Promise<void> {
  const store = area();
  if (!store) return;
  const current = await readPreferences();
  await store.set({ [PREFERENCES_KEY]: { ...current, ...patch } });
}

export function extensionUrl(path: string): string {
  if (hasChrome() && chrome.runtime?.getURL) return chrome.runtime.getURL(path);
  return `/${path.replace(/^\//, '')}`;
}

export function openEditorTab(
  drawingId?: string,
  options: { templateId?: string; openAi?: boolean } = {},
): void {
  const base = extensionUrl('editor.html');
  const params = new URLSearchParams();
  if (drawingId) params.set('id', drawingId);
  if (options.templateId) params.set('template', options.templateId);
  if (options.openAi) params.set('ai', '1');
  const query = params.toString();
  const url = query ? `${base}?${query}` : base;
  if (hasChrome() && chrome.tabs?.create) {
    void chrome.tabs.create({ url });
    return;
  }
  window.open(url, '_blank');
}

export function openSettings(): void {
  const url = extensionUrl('settings.html');
  if (hasChrome() && chrome.tabs?.create) {
    void chrome.tabs.create({ url });
    return;
  }
  window.location.href = url;
}

export { readCommandBindings, type CommandBinding } from './capture';

/** Clipboard write, used by the source chip and text results. Resolves false if blocked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function openDashboard(): void {
  const url = extensionUrl('dashboard.html');
  if (hasChrome() && chrome.tabs?.create) {
    void chrome.tabs.create({ url });
    return;
  }
  window.location.href = url;
}
